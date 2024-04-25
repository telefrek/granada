import { DeferredPromise } from "@telefrek/core/index.js"
import type { Optional } from "@telefrek/core/type/utils"
import {
  DefaultHttpMethodStatus,
  HttpStatusCode,
  type HttpHandler,
  type HttpRequest,
} from "@telefrek/http/index.js"
import {
  createRouter,
  getRoutingParameters,
  type Router,
} from "@telefrek/http/routing.js"
import type { Readable } from "stream"
import {
  SerializationFormat,
  createJsonBody,
  createTextBody,
  isServiceError,
  type Service,
  type ServiceResponse,
  type ServiceRouteInfo,
} from "./index.js"

/**
 * Helper method that translates between a {@link Service} and {@link Router} for HTTP hosting
 *
 * @param service The {@link Service} to translate into a {@link Router}
 * @returns The {@link Router} for the {@link Service}
 */
export const serviceToRouter = (service: Service): Router => {
  const router = createRouter()

  // Add all the endpoints
  for (const endpoint of service.endpoints) {
    router.addHandler(endpoint.pathTemplate, endpoint.handler, endpoint.method)
  }

  // Return the router
  return router
}

async function readBody(reader: Readable): Promise<unknown[]> {
  const objects: unknown[] = []

  const deferred = new DeferredPromise()

  reader.on("data", (chunk: unknown) => {
    objects.push(chunk)
  })

  reader.on("end", () => {
    deferred.resolve()
  })

  reader.on("error", (err) => {
    deferred.reject(err)
  })

  await deferred

  return objects
}

export function buildHandler<T>(
  service: unknown,
  serviceRoute: ServiceRouteInfo<T>,
): HttpHandler {
  return async (request: HttpRequest): Promise<void> => {
    let args: Optional<unknown[]>

    // Read the body
    const body = request.body
      ? (await readBody(request.body.contents!)).at(0)
      : undefined

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
            status: HttpStatusCode.INTERNAL_SERVER_ERROR,
          }
    }

    if (isServiceError(response)) {
      request.respond({
        status: response.status,
        statusMessage: response.statusMessage,
        body: response.body,
      })
    } else {
      // Start with the default status code or route definition
      const status =
        serviceRoute.options.statusCode ??
        DefaultHttpMethodStatus[request.method]

      // If no contents, return NO_CONTENT
      if (response === undefined || response === null) {
        request.respond({
          status: HttpStatusCode.NO_CONTENT,
        })
      } else {
        request.respond({
          status,
          body:
            (serviceRoute.options.format ?? SerializationFormat.JSON) ===
            SerializationFormat.JSON
              ? createJsonBody(response)
              : createTextBody(response as string),
        })
      }
    }
  }
}
