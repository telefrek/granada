/**
 * Package containing all of the routing information for associating a given path/method combination with a handler
 */

import { HTTP_METHODS, HttpHandler, HttpMethod, SegmentValue } from ".."

/**
 * Custom {@link Error} raised for routing issues
 */
export class RoutingError extends Error {
  constructor(message?: string) {
    super(message)
  }
}

/**
 * Indicates a {@link Router} that has a prefix for service hosting
 */
export interface RoutableApi {
  router: Router
  prefix?: string
}

/**
 * Type guard for finding {@link RoutableApi}
 *
 * @param routable The object to inspect
 * @returns True if this is a {@link RoutableApi}
 */
export function isRoutableApi(routable: unknown): routable is RoutableApi {
  return (
    typeof routable === "object" &&
    routable !== null &&
    "router" in routable &&
    typeof routable.router === "object"
  )
}

/**
 * Represents the information about the route found
 */
export interface RouteInfo {
  /** Any parameters that were retrieved */
  parameters?: Map<string, SegmentValue>

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
  lookup(request: LookupRequest): RouteInfo | undefined

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
type RouteHandler = Partial<Record<HttpMethod, HttpHandler | undefined>>

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
  readonly #root: RouteTrieNode = {
    info: RouteSegmentInfo.None,
  }

  lookup(request: LookupRequest): RouteInfo | undefined {
    let current = this.#root
    let remainder = request.path

    let parameters: Map<string, SegmentValue> | undefined
    let nextSlash = -1
    let children = this.#root.children
    let info = this.#root.info

    // Still more to search
    while (remainder.length > 0) {
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
              if (routeInfo && parameters) {
                // Check for existing in case we have to merge the set
                if (routeInfo.parameters) {
                  for (const key of parameters.keys()) {
                    routeInfo.parameters.set(key, parameters.get(key)!)
                  }
                } else {
                  routeInfo.parameters = parameters
                }
              }

              // Either we found it or it doesn't exist
              return routeInfo
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
          handler: current.handlers[request.method]!,
          parameters,
        }
      }
    }
  }

  addHandler(
    template: string,
    handler: HttpHandler,
    method?: HttpMethod | undefined,
  ): void {
    // Verify the template and get the set of segments
    const segments = this.#verifyRoute(template)

    // Get the last segment off the list
    const final = segments.pop()!

    // No children so far, just embed this entire stack
    if (this.#root.children === undefined) {
      const handlerNode: HandlerNode = {
        segment: final.segment,
        parameter: final.parameter,
        info: final.info,
        handlers: {},
      }

      if (method !== undefined) {
        handlerNode.handlers[method] = handler
      } else {
        for (const value of HTTP_METHODS) {
          handlerNode.handlers[value] = handler
        }
      }

      // Add the first node
      this.#addFast(this.#root, segments, handlerNode)
    } else {
      let current = this.#root

      // Merge all the segments
      for (const segment of segments) {
        current = this.#mergeSegment(current, segment)
      }

      // Get the location for our handler from the final merge
      current = this.#mergeSegment(current, final)

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

        // Inject this in
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        ;(current as any).handlers = handlers
      }
    }
  }

  addRouter(template: string, router: Router): void {
    // Verify the template and get the set of segments
    const segments = this.#verifyRoute(template)

    // Get the last segment off the list
    const final = segments.pop()!

    // No children so far, just embed this entire stack
    if (this.#root.children === undefined) {
      // Build the node
      const routerNode: RouterNode = {
        segment: final.segment,
        parameter: final.parameter,
        info: final.info,
        router,
      }

      // Add this to the root, no need for collision checks
      this.#addFast(this.#root, segments, routerNode)
    } else {
      let current = this.#root

      // Merge all the segments
      for (const segment of segments) {
        current = this.#mergeSegment(current, segment)
      }

      // Get the location for our handler from the final merge
      current = this.#mergeSegment(current, final)

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        ;(current as any).router = router
      }
    }
  }

  /**
   * This method is here to protect against mapping types that can't be easily resolved at runtime between terminal, wildcard and parameters
   *
   * @param children The children to inspect
   * @param info The info for the collision check
   */
  #guardUnmappable(children: RouteTrieNode[], info: RouteSegmentInfo): void {
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
  #mergeSegment(current: RouteTrieNode, segment: RouteSegment): RouteTrieNode {
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
        this.#guardUnmappable(current.children, segment.info)

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
          this.#guardUnmappable(current.children, segment.info)
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

        let covering: RouteTrieNode | undefined
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
          }

          return this.#split(covering, segment, lcp)
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

  #split(
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

    // It's possible we are splitting out a router node, need to send that through
    if (isRouterNode(current)) {
      left = {
        segment: left.segment,
        info: left.info,
        router: current.router,
      } as RouterNode

      // Remove the router from this object
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      delete (current as RouteTrieNode as any).router
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
  #addFast(
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
  #verifyRoute(template: string): RouteSegment[] {
    // verify the template matches
    if (!TEMPLATE_REGEX.test(template)) {
      throw new RoutingError("Template is not valid")
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
            parameter: segment.slice(1, -1),
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
          throw new RoutingError(`Invalid segment: ${segment}`)
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
const PARAMETER_REGEX = /^\{[a-zA-Z_$][0-9a-zA-Z_$]*\}$/
const TEMPLATE_REGEX =
  /(?:\/(?:[a-zA-Z0-9-]+|\{[a-zA-Z_$][0-9a-zA-Z_$]*\}|\*+)+)+/

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
}

/**
 * {@link RouteTrieNode} that has a {@link HandlerNode}
 */
interface HandlerNode extends RouteTrieNode {
  handlers: RouteHandler
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
