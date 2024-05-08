/**
 * Pipeline operations to support routing
 */

import {
  Tracing,
  TracingContext,
  getTracer,
} from "@telefrek/core/observability/tracing.js"
import { Timer } from "@telefrek/core/time.js"
import { isInRequestPhase, type HttpOperationContext } from "../context.js"
import type { HttpHandler } from "../index.js"
import { ApiRouteMetrics } from "../metrics.js"
import {
  HttpPipelineStage,
  type HttpPipelineStageTransform,
} from "../pipeline.js"
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
export function USE_ROUTER(router: Router): HttpPipelineStageTransform {
  return {
    transform: (context: HttpOperationContext) => {
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
          context.handler = traceRoute(routeInfo)
        }
      }

      return context
    },
    name: "router",
    stage: HttpPipelineStage.ROUTING,
  }
}

// Wrap the
function traceRoute(info: RouteInfo): HttpHandler {
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
