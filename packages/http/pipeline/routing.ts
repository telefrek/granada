/**
 * Pipeline operations to support routing
 */

import { HttpPipelineStage, type HttpPipelineRouter } from "../pipeline.js"
import { type Router } from "../routing.js"

/**
 * Adds the router into the request pipeline processing
 *
 * @param router The {@link Router} to add
 * @param pathPrefix The prefix to place the router at (default is "/")
 * @returns A transform for manipulating that context
 */
export function USE_ROUTER(
  router: Router,
  pathPrefix?: string,
): HttpPipelineRouter {
  return {
    router,
    name: "router",
    stage: HttpPipelineStage.ROUTING,
    rootPath: pathPrefix ?? "/",
  }
}
