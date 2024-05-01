/**
 * Pipeline operations to support routing
 */

import {
  isInRequestPhase,
  type HttpOperationContext,
  type HttpTransform,
} from "../pipeline.js"
import { setRoutingParameters, type Router } from "../routing.js"

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
        // Check if we need to set routing parameters
        if (info.parameters) {
          setRoutingParameters(info.parameters)
        }

        context.handler = info.handler
      }
    }

    return context
  }
}
