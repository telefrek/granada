/**
 * Package containing all of the routing information for associating a given path/method combination with a handler
 */

import type { FrameworkPriority } from "@telefrek/core/index.js"
import {
  Tracing,
  TracingContext,
  getTracer,
} from "@telefrek/core/observability/tracing.js"
import {
  DefaultParameterizedPathTrie,
  type ParameterizedPathTrie,
} from "@telefrek/core/structures/trie.js"
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

  /** The handler priority */
  priority?: FrameworkPriority
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

/**
 * Transform the string into a {@link SegmentValue
 * }
 * @param s The parameter string
 * @returns The {@link SegmentValue} for the string
 */
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

interface RouterNode {
  router?: Router
  handlers?: RouteHandler
  priority?: FrameworkPriority
  template: string
}

/**
 * Default {@link Router} implementation that uses a tree structure to hold the mapping information
 */
class RouterImpl implements Router {
  private readonly _parameterizedTrie: ParameterizedPathTrie<RouterNode>

  constructor() {
    this._parameterizedTrie = new DefaultParameterizedPathTrie()
  }

  lookup(request: LookupRequest): Optional<RouteInfo> {
    const res = this._parameterizedTrie.resolve(request.path)

    while (true) {
      const { value, done } = res.next()

      if (value) {
        const node = value.value as RouterNode

        //
        if (node.router) {
          const resp = node.router.lookup({
            ...request,
            path: value.remainder,
          })

          if (resp) {
            return resp
          }
        } else if (
          node.handlers &&
          value.remainder.length === 0 &&
          node.handlers[request.method] !== undefined
        ) {
          // Map the parameters
          const parameters = new Map<string, SegmentValue>()
          for (const entry of value.parameters.entries()) {
            parameters.set(entry[0], parseParameter(entry[1]))
          }

          return {
            template: node.template,
            parameters,
            handler: node.handlers[request.method]!,
            priority: node.priority,
          }
        }
      } else if (done) {
        return
      }
    }
  }

  addHandler(
    template: string,
    handler: HttpHandler,
    method?: HttpMethod | undefined,
  ): void {
    this._parameterizedTrie.merge(template, (current) => {
      if (current?.router) {
        throw new RoutingError(
          `There is already a router registerred at ${template}`,
        )
      }

      if (current === undefined) {
        current = {
          template,
        }
      }

      const handlers = current.handlers ?? {}
      if (method) {
        handlers![method] = handler
      } else {
        for (const httpMethod of HTTP_METHODS) {
          handlers![httpMethod] = handler
        }
      }

      current.handlers = handlers
      return current
    })
  }

  addRouter(template: string, router: Router): void {
    this._parameterizedTrie.merge(template, (current) => {
      if (current !== undefined) {
        throw new RoutingError(
          `There is already a router or handler registerred at ${template}`,
        )
      }

      return {
        template,
        router,
      }
    })
  }
}
