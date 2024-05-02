/**
 * Pipeline operations to support routing
 */

import type { MaybeAwaitable } from "@telefrek/core"
import { activateSpan, getTracer } from "@telefrek/core/observability/tracing"
import { Timer } from "@telefrek/core/time.js"
import { isPromise } from "util/types"
import { isInRequestPhase, type HttpOperationContext } from "../context.js"
import type { HttpResponse } from "../index.js"
import { ApiRouteMetrics } from "../metrics.js"
import { pipelineError, type HttpTransform } from "../pipeline.js"
import { setRoutingParameters, type Router } from "../routing.js"
import { serverError } from "../utils.js"

/**
 * Adds the router into the request pipeline processing
 *
 * @param router The {@link Router} to add
 * @returns A transform for manipulating that context
 */
export function USE_ROUTER(router: Router): HttpTransform {
  return (context: HttpOperationContext) => {
    if (isInRequestPhase(context) && !context.handler) {
      const info = router.lookup({
        method: context.operation.request.method,
        path: context.operation.request.path.original,
      })

      // Check if we identified the information
      if (info) {
        // Set the template that was used

        // Check if we need to set routing parameters
        if (info.parameters) {
          setRoutingParameters(info.parameters, context)
        }

        // Setup the tracking around the routing request
        context.handler = (req, abort): MaybeAwaitable<HttpResponse> => {
          const timer = Timer.startNew()
          const span = getTracer().startSpan(info.template)
          const scope = activateSpan(span)
          const ret = info.handler(req, abort)
          if (isPromise(ret)) {
            return (ret as Promise<HttpResponse>)
              .then(
                (res: HttpResponse) => {
                  ApiRouteMetrics.RouteRequestDuration.record(
                    timer.stop().seconds(),
                    {
                      template: info.template,
                    },
                  )
                  ApiRouteMetrics.RouteResponseStatus.add(1, {
                    status: (res as HttpResponse).status.code.toString(),
                    template: info.template,
                  })

                  return res
                },
                (err) => {
                  pipelineError(
                    `Unhandled error in ${info.template} handler: ${err}`,
                    err,
                  )

                  ApiRouteMetrics.RouteErrors.add(1, {
                    template: info.template,
                  })

                  return serverError()
                },
              )
              .finally(() => {
                scope.finish()
                span.end()
              })
          } else {
            ApiRouteMetrics.RouteRequestDuration.record(
              timer.stop().seconds(),
              {
                template: info.template,
              },
            )
            ApiRouteMetrics.RouteResponseStatus.add(1, {
              status: (ret as HttpResponse).status.code.toString(),
              template: info.template,
            })

            scope.finish()
            span.end()
            return ret
          }
        }
      }
    }

    return context
  }
}
