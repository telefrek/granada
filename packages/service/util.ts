import { type MaybeAwaitable } from "@telefrek/core/index.js"
import { info } from "@telefrek/core/logging.js"
import type { HttpOperationSource } from "@telefrek/http/operations.js"
import {
  createPipeline,
  type HttpPipelineConfiguration,
  type HttpPipelineOptions,
} from "@telefrek/http/pipeline.js"
import { USE_ROUTER } from "@telefrek/http/pipeline/routing.js"
import { createRouter, type Router } from "@telefrek/http/routing.js"
import type { HttpServer } from "@telefrek/http/server.js"
import {
  DEFAULT_SERVER_PIPELINE_CONFIGURATION,
  NOT_FOUND_HANDLER,
} from "@telefrek/http/server/pipeline.js"
import { isRoutableApi, type Service } from "./index.js"

export class ServicePipelineBuilder {
  private _config: HttpPipelineConfiguration
  private _server: HttpServer

  constructor(
    server: HttpServer,
    baseConfig: HttpPipelineConfiguration = DEFAULT_SERVER_PIPELINE_CONFIGURATION,
  ) {
    this._config = { ...baseConfig }
    this._server = server
  }

  withApi(api: unknown): ServicePipelineBuilder {
    if (isRoutableApi(api)) {
      if (!this._config.transforms) {
        this._config.transforms = []
      }

      this._config.transforms.push(USE_ROUTER(api.router, api.pathPrefix))
    }

    return this
  }

  run(port: number, options?: HttpPipelineOptions): MaybeAwaitable<void> {
    createPipeline(this._config).add(
      this._server as HttpOperationSource,
      NOT_FOUND_HANDLER,
      options,
    )
    return this._server.listen(port)
  }
}

/**
 * Helper method that translates between a {@link Service} and {@link Router} for HTTP hosting
 *
 * @param service The {@link Service} to translate into a {@link Router}
 * @param pathPrefix The optional prefix to add to path endpoints
 * @returns The {@link Router} for the {@link Service}
 */
export const serviceToRouter = (service: Service): Router => {
  const router = createRouter()

  // Add all the endpoints
  for (const endpoint of service.endpoints) {
    info(`${service} adding ${endpoint.pathTemplate}...`)
    router.addHandler(endpoint.pathTemplate, endpoint.handler, endpoint.method)
  }

  // Return the router
  return router
}
