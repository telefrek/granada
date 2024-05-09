/**
 * Package containing all of the routing information for associating a given path/method combination with a handler
 */

import {
  Tracing,
  TracingContext,
  getTracer,
} from "@telefrek/core/observability/tracing.js"
import { Timer } from "@telefrek/core/time.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import {
  getOperationContextKey,
  setOperationContextKey,
  type HttpOperationContext,
} from "./context.js"
import { HttpHandler, HttpMethod, SegmentValue } from "./index.js"
import { ApiRouteMetrics } from "./metrics.js"

/**
 * Valid {@link HttpMethod} values as an array
 */
const HTTP_METHODS = [
  HttpMethod.DELETE,
  HttpMethod.GET,
  HttpMethod.HEAD,
  HttpMethod.OPTIONS,
  HttpMethod.PATCH,
  HttpMethod.POST,
  HttpMethod.PUT,
] as HttpMethod[]

export type RoutingParameters = Map<string, SegmentValue>

const ROUTING_PARAMETERS: unique symbol = Symbol()

/**
 * Get the current routing parameters for this operation
 *
 * @returns The current {@link RoutingParameters}
 */
export function getRoutingParameters(): Optional<RoutingParameters> {
  return getOperationContextKey(ROUTING_PARAMETERS)
}

/**
 * Trace the {@link Handler} given the {@link RouteInfo}
 *
 * @param info The route info to trace
 * @returns The tracer enabled {@link HttpHandler}
 */
export function traceRoute(info: RouteInfo): HttpHandler {
  return async (request, abort) => {
    const span = getTracer().startSpan(info.template)
    const timer = Timer.startNew()

    try {
      const response = await TracingContext.with(
        Tracing.setSpan(TracingContext.active(), span),
        async () => {
          return await info.handler(request, abort)
        },
      )

      // Log the status if one was provided
      ApiRouteMetrics.RouteResponseStatus.add(1, {
        status: response.status.code.toString(),
        template: info.template,
        method: request.method,
      })

      return response
    } finally {
      ApiRouteMetrics.RouteRequestDuration.record(timer.stop().seconds(), {
        template: info.template,
        method: request.method,
      })
      span.end()
    }
  }
}

/**
 * Set the current routing parameters for this operation
 *
 * @param parameters The {@link RoutingParameters} to set
 */
export function setRoutingParameters(
  parameters: RoutingParameters,
  context?: HttpOperationContext,
): void {
  if (context) {
    context[ROUTING_PARAMETERS] = parameters
  } else {
    setOperationContextKey(ROUTING_PARAMETERS, parameters)
  }
}

/**
 * Custom {@link Error} raised for routing issues
 */
export class RoutingError extends Error {
  constructor(message?: string) {
    super(message)
  }
}

/**
 * Represents the information about the route found
 */
export interface RouteInfo {
  /** Any parameters that were retrieved */
  parameters?: RoutingParameters

  /** The route template */
  template: string

  /** The handler to invoke */
  handler: HttpHandler
}

/**
 * Represents a request for a lookup
 */
export interface LookupRequest {
  path: string
  method: HttpMethod
}

/**
 * The router is responsible for mapping requests to their handlers and extracting information
 * from the given path that should be included in the request
 */
export interface Router {
  /**
   * Lookup the {@link RouteInfo} that can fulfill the provided {@link LookupRequest}
   *
   * @param request The {@link LookupRequest} to find a handler for
   *
   * @returns A {@link RouteInfo} object that best matches the {@link LookupRequest} if found
   */
  lookup(request: LookupRequest): Optional<RouteInfo>

  /**
   * Register the given {@link HttpHandler} with the template and optionally {@link HttpMethod}.
   *
   * If this path has a collision with another or fails the structural validations this will throw an error
   *
   * @param template The path this handler resolves
   * @param handler The {@link HttpHandler} to associate with this path/method
   * @param method The optional {@link HttpMethod} to use for this handler (default is all methods)
   *
   * @throws A {@link RoutingError} when there is an issue with the template syntax or overlapping routes
   */
  addHandler(template: string, handler: HttpHandler, method?: HttpMethod): void

  /**
   *
   * Register the given {@link Router} with the template
   *
   * If this path has a collision with another or fails the structural validations this will throw an error
   *
   * @param template The path this router resolves
   * @param router The {@link Router} to offload requests to at this position
   */
  addRouter(template: string, router: Router): void
}

/**
 * Create a new router
 *
 * @returns A newly initialized {@link Router}
 */
export function createRouter(): Router {
  return new RouterImpl()
}

/**
 * Represents the route handler information for a given request
 */
type RouteHandler = Partial<Record<HttpMethod, Optional<HttpHandler>>>

const parseParameter = (s: string): SegmentValue => {
  switch (true) {
    case /^[+-]?\d*\.?\d+(?:[Ee][+-]?\d+)?$/.test(s):
      return +s
    case s.toLowerCase() === "true":
      return true
    case s.toLowerCase() === "false":
      return false
    default:
      return s
  }
}

/**
 * Default {@link Router} implementation that uses a tree structure to hold the mapping information
 */
class RouterImpl implements Router {
  readonly _root: RootNode = {
    info: RouteSegmentInfo.None,
    template: "/",
  }

  lookup(request: LookupRequest): Optional<RouteInfo> {
    let current: RouteTrieNode = this._root
    let remainder = request.path

    let parameters: Optional<RoutingParameters>
    let nextSlash = -1
    let children = this._root.children
    let info = this._root.info

    // Still more to search
    while (remainder.length > 0 && remainder !== "/") {
      // Scan the routers along the way to see if they have the match
      if (isRouterNode(current)) {
        const check = current.router.lookup({
          path: remainder,
          method: request.method,
        })
        if (check) {
          return check
        }
      }

      switch (true) {
        case info === RouteSegmentInfo.Wildcard:
          // Advance to the next slash
          nextSlash = remainder.indexOf("/")
          remainder = nextSlash > 0 ? remainder.substring(nextSlash) : ""
          info = RouteSegmentInfo.None
          children = current.children

          break
        case info === RouteSegmentInfo.Parameter: {
          if (parameters === undefined) {
            parameters = new Map()
          }

          const val =
            nextSlash > 0 ? remainder.substring(0, nextSlash) : remainder

          nextSlash = remainder.indexOf("/")
          parameters.set(current.parameter!, parseParameter(val))

          remainder = nextSlash > 0 ? remainder.substring(nextSlash) : ""
          info = RouteSegmentInfo.None
          children = current.children

          break
        }
        case info === RouteSegmentInfo.Terminal:
          remainder = ""
          break
        case children !== undefined: {
          // Check if any children cover this path
          let child = children?.find(
            (c) => c.segment !== undefined && remainder.startsWith(c.segment),
          )

          if (child) {
            // Advance the remainder
            remainder = remainder.substring(child.segment!.length)
            current = child
            children = current.children
            info = current.info

            // Check if we need to offload this
            if (isRouterNode(current)) {
              // Get any info from the child router
              const routeInfo = current.router.lookup({
                method: request.method,
                path: remainder,
              })

              // If we found info
              if (routeInfo) {
                if (parameters) {
                  // Check for existing in case we have to merge the set
                  if (routeInfo.parameters) {
                    for (const key of parameters.keys()) {
                      routeInfo.parameters.set(key, parameters.get(key)!)
                    }
                  } else {
                    routeInfo.parameters = parameters
                  }
                }

                // We found it
                return routeInfo
              }
            }
          } else {
            // Check for terminal, wildcard or parameter
            child = children?.find((c) => c.info !== RouteSegmentInfo.None)

            if (child) {
              // Keep processing
              current = child
              if (!remainder.startsWith("/")) {
                // This isn't a valid path
                return
              }

              // Remove the leading slash
              remainder = remainder.substring(1)

              // Reset the search parameters
              info = current.info
              children = current.children
            } else {
              return
            }
          }
          break
        }
        default:
          // Can't go any further down the tree, abandon hope all ye who enter here
          return
      }
    }

    // Check if we found a valid handler
    if (isHandlerNode(current)) {
      if (current.handlers[request.method]) {
        return {
          template: current.template,
          handler: current.handlers[request.method]!,
          parameters,
        }
      }
    } else if (isRouterNode(current)) {
      // Get the info
      const info = current.router.lookup({
        method: request.method,
        path: remainder,
      })

      // Merge the templates
      if (info) {
        info.template = `${current.template}${info.template}`
      }

      return info
    }

    return
  }

  addHandler(
    template: string,
    handler: HttpHandler,
    method?: Optional<HttpMethod>,
  ): void {
    // Verify the template and get the set of segments
    const segments = this._verifyRoute(template)

    if (segments.length === 0) {
      if (this._root.handlers === undefined) {
        this._root.handlers = {}
      }

      if (method !== undefined) {
        this._root.handlers![method] = handler
      } else {
        for (const value of HTTP_METHODS) {
          this._root.handlers![value] = handler
        }
      }

      return
    } else {
      // Get the last segment off the list
      const final = segments.pop()!

      // No children so far, just embed this entire stack
      if (this._root.children === undefined) {
        const handlerNode: HandlerNode = {
          segment: final.segment,
          parameter: final.parameter,
          info: final.info,
          handlers: {},
          template,
        }

        if (method !== undefined) {
          handlerNode.handlers[method] = handler
        } else {
          for (const value of HTTP_METHODS) {
            handlerNode.handlers[value] = handler
          }
        }

        // Add the first node
        this._addFast(this._root, segments, handlerNode)
      } else {
        let current: RouteTrieNode = this._root

        // Merge all the segments
        for (const segment of segments) {
          current = this._mergeSegment(current, segment)
        }

        // Get the location for our handler from the final merge
        current = this._mergeSegment(current, final)

        if (isHandlerNode(current)) {
          if (method) {
            if (current.handlers[method]) {
              throw new RoutingError(
                `There is already a handler at ${method}: ${template}`,
              )
            }

            // Add the handler
            current.handlers[method] = handler
          } else {
            throw new RoutingError(
              `Found partial handler at ${template} and unsure how to merge since no method defined`,
            )
          }
        } else if (isRouterNode(current)) {
          throw new RoutingError(
            `Found routing node at ${template} in conflict with handler`,
          )
        } else {
          // Add the handler for all methods
          const handlers: RouteHandler = {}

          if (method) {
            handlers[method] = handler
          } else {
            for (const method of HTTP_METHODS) {
              handlers[method] = handler
            }
          }

          const root = current as RootNode
          root.handlers = handlers
          root.template = template
        }
      }
    }
  }

  addRouter(template: string, router: Router): void {
    // Verify the template and get the set of segments
    const segments = this._verifyRoute(template)

    // Adding to the root
    if (segments.length === 0) {
      if (this._root.router) {
        throw new RoutingError(`Duplicate router definition at root node`)
      }

      this._root.router = router
    } else {
      // Get the last segment off the list
      const final = segments.pop()!

      // No children so far, just embed this entire stack
      if (this._root.children === undefined) {
        // Build the node
        const routerNode: RouterNode = {
          segment: final.segment,
          parameter: final.parameter,
          info: final.info,
          router,
          template: template,
        }

        // Add this to the root, no need for collision checks
        this._addFast(this._root, segments, routerNode)
      } else {
        let current: RouteTrieNode = this._root

        // Merge all the segments
        for (const segment of segments) {
          current = this._mergeSegment(current, segment)
        }

        // Get the location for our handler from the final merge
        current = this._mergeSegment(current, final)

        if (isHandlerNode(current)) {
          throw new RoutingError(
            `Conflicting handler node already registerred at ${template}`,
          )
        } else if (isRouterNode(current)) {
          throw new RoutingError(
            `Conflicting router node already registerred at ${template}`,
          )
        } else {
          // Inject the router
          const root = current as RootNode
          root.router = router
          root.template = template
        }
      }
    }
  }

  /**
   * This method is here to protect against mapping types that can't be easily resolved at runtime between terminal, wildcard and parameters
   *
   * @param children The children to inspect
   * @param info The info for the collision check
   */
  _guardUnmappable(children: RouteTrieNode[], info: RouteSegmentInfo): void {
    if (
      children.some((c) => c.info !== info && c.info !== RouteSegmentInfo.None)
    ) {
      throw new RoutingError(
        `There is a conflict between parameters, wildcards and terminal values`,
      )
    }
  }

  /**
   * Merge a segment into the trie at this node
   *
   * @param current The current {@link RouteTrieNode} we ar eprocessing
   * @param segment The {@link RouteSegment} we want to add at this point
   * @returns The resulting {@link RouteTrieNode} where the next operations would happen
   */
  _mergeSegment(current: RouteTrieNode, segment: RouteSegment): RouteTrieNode {
    // Easy case
    if (current.children === undefined) {
      const next: RouteTrieNode = {
        segment: segment.segment,
        parameter: segment.parameter,
        info: segment.info,
      }

      current.children = [next]

      return next
    }

    // Depending on what type segment we're adding, we need to verify different things
    switch (segment.info) {
      // Handle terminal and wildcard where we are just looking for a match or inserting
      case RouteSegmentInfo.Wildcard:
      case RouteSegmentInfo.Terminal: {
        this._guardUnmappable(current.children, segment.info)

        let next = current.children.find((child) => child.info === segment.info)

        // One doesn't already exist
        if (next === undefined) {
          next = {
            info: segment.info,
          }
        }

        return next
      }
      // Handle parameters which can have a match but need to have the same parameter info
      case RouteSegmentInfo.Parameter: {
        const paramNode = current.children.find(
          (child) => child.info === RouteSegmentInfo.Parameter,
        )

        if (paramNode) {
          // This is bad
          if (paramNode.parameter! !== segment.parameter!) {
            throw new RoutingError(
              `Conflicting parameter (${segment.parameter!} != ${paramNode.parameter!}) found at same location in route tree`,
            )
          }

          // Fine to share from here
          return paramNode
        } else {
          this._guardUnmappable(current.children, segment.info)
          // Create the new node
          const next: RouteTrieNode = {
            segment: segment.segment,
            parameter: segment.parameter,
            info: segment.info,
          }

          // No other parameters at this point so safe to add
          current.children.push(next)

          return next
        }
      }
      default: {
        // covering is where some of the segments match
        const commonPrefix = (left: string, right: string): string => {
          let n = 0
          let lastSlash = -1
          while (n < left.length && n < right.length) {
            // Match so far, keep going
            if (left.charAt(n) === right.charAt(n)) {
              // We found a dividing slash for a valid split in segments
              if (left.charAt(n) === "/") {
                lastSlash = n
              }
              n++
            } else {
              break
            }
          }

          // Only a prefix if they both have a shared segment
          return lastSlash > 0
            ? left.substring(0, lastSlash)
            : n === left.length || n === right.length
              ? left.substring(0, n)
              : ""
        }

        let covering: Optional<RouteTrieNode>
        let lcp = 0
        for (const child of current.children.filter(
          (child) => child.info === RouteSegmentInfo.None,
        )) {
          const prefix = commonPrefix(child.segment!, segment.segment!)
          if (prefix.length > lcp) {
            covering = child
            lcp = prefix.length
          }
        }

        // We need to split the nodes
        if (covering) {
          // Full overlap, return the covering
          if (segment.segment === covering.segment) {
            return covering
          } else if (lcp === (covering.segment?.length ?? 0)) {
            // It's possible we overlap with a child
            return this._mergeSegment(covering, {
              segment: segment.segment!.substring(lcp),
              info: RouteSegmentInfo.None,
            })
          }

          return this._split(covering, segment, lcp)
        } else {
          // No covering, just add from here
          const next: RouteTrieNode = {
            segment: segment.segment,
            info: segment.info,
          }

          // No other parameters at this point so safe to add
          current.children.push(next)

          return next
        }
      }
    }
  }

  _split(
    current: RouteTrieNode,
    segment: RouteSegment,
    prefixLegnth: number,
  ): RouteTrieNode {
    // Create a new node with the current children
    let left: RouteTrieNode = {
      segment: current.segment!.substring(prefixLegnth),
      info: current.info,
      children: current.children ? [...current.children] : undefined,
    }

    // Create the new node for our segment
    const right: RouteTrieNode = {
      segment: segment.segment!.substring(prefixLegnth),
      info: segment.info,
    }

    // Update the current to be the prefix
    current.segment = current.segment!.substring(0, prefixLegnth)

    // It's possible we are splitting out a routable node, need to send that through
    if (isRouterNode(current)) {
      left = <RouterNode>{
        segment: left.segment,
        info: left.info,
        router: current.router,
        template: current.template,
      }

      // Remove the router from this object
      delete (current as RootNode).router
    } else if (isHandlerNode(current)) {
      left = <HandlerNode>{
        segment: left.segment,
        info: left.info,
        handlers: current.handlers,
        template: current.template,
      }

      delete (current as RootNode).handlers
    }

    // Clear the existing template
    if ("template" in current) {
      delete current.template
    }

    // Copy over any children
    if (current.children) {
      left.children = current.children
    }

    // Change the children to be the two new nodes
    current.children = [left, right]

    // Return our new segment node
    return right
  }

  /**
   * Does a fast addition without worry about child node merging
   *
   * @param current The {@link RouteTrieNode} to start at
   * @param segments The remaining {@link RouteSegment}
   * @param node The terminal {@link RouteTrieNode}
   */
  _addFast(
    current: RouteTrieNode,
    segments: RouteSegment[],
    node: RouteTrieNode,
  ) {
    // Add all but the last segment
    for (const segment of segments) {
      // Create the children if necessary and push the information
      current.children = current.children ?? []
      current.children.push({
        segment: segment.segment,
        parameter: segment.parameter,
        info: segment.info,
      })

      // Move down the tree
      current = current.children[current.children.length - 1]
    }

    current.children = current.children ?? []
    current.children.push(node)
  }

  /**
   * Internal method to verify a template as valid
   *
   * @param template The template to validate
   *
   * @returns The set of {@link RouteSegment} found for this template path
   */
  _verifyRoute(template: string): RouteSegment[] {
    // verify the template matches
    if (!TEMPLATE_REGEX.test(template)) {
      throw new RoutingError(`Template is not valid: ${template}`)
    }

    if (template === "/") {
      return []
    }

    // verify all of the segments are valid
    const segments = template.replace(/^\//, "").replace(/\/$/, "").split("/")
    if (segments.length === 0) {
      throw new RoutingError("No valid segments found!")
    }

    // Create the set of segments
    const routeSegments: RouteSegment[] = []

    // Check the segments for valid contents while building up the individual
    let currentSegment = ""

    // Helper to clear the current segment after pushing
    const checkCurrent = () => {
      if (currentSegment.length > 0) {
        routeSegments.push({
          segment: currentSegment,
          info: RouteSegmentInfo.None,
        })
        currentSegment = ""
      }
    }

    for (let n = 0; n < segments.length; ++n) {
      const segment = segments[n]

      switch (true) {
        // Test for wildcards
        case WILDCARD === segment:
          // Add anything up to this point as a segment
          checkCurrent()

          // Push the wildcard
          routeSegments.push({
            info: RouteSegmentInfo.Wildcard,
          })
          break
        case PARAMETER_REGEX.test(segment):
          // Add anything up to this point as a segment
          checkCurrent()

          // Push the parameter
          routeSegments.push({
            info: RouteSegmentInfo.Parameter,
            parameter: segment.slice(1),
          })
          break
        case TERMINATOR === segment:
          // Guard no terminator in the middle
          if (n < segments.length - 1) {
            throw new RoutingError("Cannot have pathing after termination")
          }

          // Add anything up to this point as a segment
          checkCurrent()

          // Push the terminal
          routeSegments.push({
            info: RouteSegmentInfo.Terminal,
          })
          break
        case URI_SEGMENT_REGEX.test(segment):
          // Add this segment to the current and continue
          currentSegment += `/${segment}`
          break
        default:
          // This should never happen iwth valid routes
          throw new RoutingError(`Invalid segment: '${segment}' in ${template}`)
      }
    }

    // Add any remainder
    if (currentSegment.length > 0) {
      routeSegments.push({
        info: RouteSegmentInfo.None,
        segment: currentSegment,
      })
    }

    return routeSegments
  }
}

const WILDCARD = "*"
const TERMINATOR = "**"
const URI_SEGMENT_REGEX = /^[a-zA-Z0-9-]+$/
const PARAMETER_REGEX = /^:[a-zA-Z][0-9a-zA-Z_]*$/
const TEMPLATE_REGEX = /^\/(([a-zA-Z0-9_]+|:[a-zA-Z][0-9a-zA-Z_]*|\*{1,2})?\/)*/

/**
 * Internal enum to track {@link RouteTrieNode} state information
 */
enum RouteSegmentInfo {
  None = "none",
  Terminal = "terminal",
  Wildcard = "wildcard",
  Parameter = "parameter",
}

/**
 * Internal object for holding a chunk of a route segment
 */
interface RouteSegment {
  info: RouteSegmentInfo
  segment?: string
  parameter?: string
}

/**
 * A node with the route trie
 */
interface RouteTrieNode {
  parent?: RouteTrieNode
  children?: RouteTrieNode[]
  parameter?: string
  segment?: string
  info: RouteSegmentInfo
}

/**
 * {@link RouteTrieNode} that has a {@link Router}
 */
interface RouterNode extends RouteTrieNode {
  router: Router
  template: string
}

/**
 * {@link RouteTrieNode} that has a {@link HandlerNode}
 */
interface HandlerNode extends RouteTrieNode {
  handlers: RouteHandler
  template: string
}

interface RootNode extends RouteTrieNode {
  handlers?: RouteHandler
  router?: Router
  template: string
}

/**
 * Type guard for {@link RouterNode}
 *
 * @param segment The {@link RouteTrieNode} to inspect
 * @returns True if the segment is a {@link RouterNode}
 */
function isRouterNode(segment: RouteTrieNode): segment is RouterNode {
  return "router" in segment
}

/**
 * Type guard for {@link HandlerNode}
 *
 * @param segment The {@link RouteTrieNode} to inspect
 * @returns True if the segment is a {@link HandlerNode}
 */
function isHandlerNode(segment: RouteTrieNode): segment is HandlerNode {
  return "handlers" in segment
}
