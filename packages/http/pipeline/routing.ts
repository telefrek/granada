/**
 * Pipeline operations to support routing
 */

import { trace } from "@opentelemetry/api"
import {
  TracingContext,
  getTracer,
} from "@telefrek/core/observability/tracing.js"
import { Timer } from "@telefrek/core/time.js"
import { isPromise } from "util/types"
import { isInRequestPhase, type HttpOperationContext } from "../context.js"
import type { HttpHandler, HttpResponse } from "../index.js"
import { ApiRouteMetrics } from "../metrics.js"
import { type HttpTransform } from "../pipeline.js"
import {
  setRoutingParameters,
  type RouteInfo,
  type Router,
} from "../routing.js"

/**
 * Adds the router into the request pipeline processing
 *
 * @param router The {@link Router} to add
 * @returns A transform for manipulating that context
 */
export function USE_ROUTER(router: Router): HttpTransform {
  return (context: HttpOperationContext) => {
    if (isInRequestPhase(context) && !context.handler) {
      const routeInfo = router.lookup({
        method: context.operation.request.method,
        path: context.operation.request.path.original,
      })

      // Check if we identified the information
      if (routeInfo) {
        if (routeInfo.parameters) {
          setRoutingParameters(routeInfo.parameters, context)
        }

        // Ensure we wrap the tracing information
        let routeHandler = traceRoute(routeInfo)

        // Ensure we have the parent context set
        const contextSpan = context.operation.span
        if (contextSpan) {
          const ctx = trace.setSpan(TracingContext.active(), contextSpan)
          trace.getSpan(ctx)
          routeHandler = TracingContext.bind(ctx, routeHandler)
        }

        context.handler = routeHandler
      }
    }

    return context
  }
}

// Wrap the
function traceRoute(info: RouteInfo): HttpHandler {
  return (request, abort) => {
    const span = getTracer().startSpan(info.template)
    const timer = Timer.startNew()
    let isAsync = false

    try {
      const response = TracingContext.with(
        trace.setSpan(TracingContext.active(), span),
        info.handler,
        null,
        request,
        abort,
      )

      if (isPromise(response)) {
        isAsync = true
        return (response as Promise<HttpResponse>)
          .then((httpResponse) => {
            // Log the status if one was provided
            ApiRouteMetrics.RouteResponseStatus.add(1, {
              status: httpResponse.status.code.toString(),
              template: info.template,
              method: request.method,
            })

            return httpResponse
          })
          .finally(() => {
            // Log the duration and end the span
            ApiRouteMetrics.RouteRequestDuration.record(
              timer.stop().seconds(),
              {
                template: info.template,
                method: request.method,
              },
            )
            span.end()
          })
      } else {
        // Log the status if one was provided
        ApiRouteMetrics.RouteResponseStatus.add(1, {
          status: (response as HttpResponse).status.code.toString(),
          template: info.template,
          method: request.method,
        })

        return response
      }
    } finally {
      if (!isAsync) {
        // Log the duration and end the span
        ApiRouteMetrics.RouteRequestDuration.record(timer.stop().seconds(), {
          template: info.template,
          method: request.method,
        })
        span.end()
      }
    }
  }
}
