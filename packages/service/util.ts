import { type MaybeAwaitable } from "@telefrek/core"
import { consumeStream } from "@telefrek/core/streams.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import {
  HttpStatusCode,
  type HttpHandler,
  type HttpRequest,
  type HttpResponse,
} from "@telefrek/http/index.js"
import type { HttpOperationSource } from "@telefrek/http/operations"
import {
  createPipeline,
  type HttpPipelineConfiguration,
} from "@telefrek/http/pipeline"
import { USE_ROUTER } from "@telefrek/http/pipeline/routing"
import {
  createRouter,
  getRoutingParameters,
  type Router,
} from "@telefrek/http/routing.js"
import type { HttpServer } from "@telefrek/http/server"
import {
  DEFAULT_SERVER_PIPELINE_CONFIGURATION,
  NOT_FOUND_HANDLER,
} from "@telefrek/http/server/pipeline"
import {
  DefaultHttpMethodStatus,
  emptyHeaders,
  jsonContents,
  noContents,
  textContents,
} from "@telefrek/http/utils.js"
import {
  SerializationFormat,
  isRoutableApi,
  isServiceError,
  type Service,
  type ServiceResponse,
  type ServiceRouteInfo,
} from "./index.js"

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
      if (!this._config.requestTransforms) {
        this._config.requestTransforms = []
      }

      this._config.requestTransforms.push(USE_ROUTER(api.router))
    }

    return this
  }

  run(port: number): MaybeAwaitable<void> {
    createPipeline(this._config).add(
      this._server as HttpOperationSource,
      NOT_FOUND_HANDLER,
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
export const serviceToRouter = (
  service: Service,
  pathPrefix?: string,
): Router => {
  const router = createRouter()

  // Add all the endpoints
  for (const endpoint of service.endpoints) {
    router.addHandler(
      `${pathPrefix ?? ""}${endpoint.pathTemplate}`,
      endpoint.handler,
      endpoint.method,
    )
  }

  // Return the router
  return router
}

export function buildHandler<T>(
  service: unknown,
  serviceRoute: ServiceRouteInfo<T>,
): HttpHandler {
  return async (request: HttpRequest): Promise<HttpResponse> => {
    let args: Optional<unknown[]>
    let body: Optional<unknown>

    if (request.body) {
      body = await consumeStream(request.body.contents)
    }

    if (serviceRoute.options.mapping) {
      args = serviceRoute.options.mapping(getRoutingParameters(), body)
    } else if (body) {
      args = [body]
    }

    let response: Optional<ServiceResponse<T>>

    try {
      response = await (args
        ? serviceRoute.method.call(service, ...args!)
        : serviceRoute.method.call(service))
    } catch (err) {
      response = serviceRoute.options.errorHandler
        ? serviceRoute.options.errorHandler(err)
        : {
            code: HttpStatusCode.INTERNAL_SERVER_ERROR,
          }
    }

    if (isServiceError(response)) {
      return {
        status: {
          code: response.code,
          message: response.message,
        },
        body: response.body,
        headers: emptyHeaders(),
      }
    } else {
      // Start with the default status code or route definition
      const code =
        serviceRoute.options.statusCode ??
        DefaultHttpMethodStatus[request.method]

      // If no contents, return NO_CONTENT
      if (response === undefined || response === null) {
        return noContents()
      } else {
        // TODO: Add other content types...
        switch (serviceRoute.options.format ?? SerializationFormat.JSON) {
          case SerializationFormat.JSON:
            return jsonContents(response, code)
          default:
            return textContents(String(response), code)
        }
      }
    }
  }
}
