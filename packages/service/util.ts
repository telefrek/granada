import { DeferredPromise } from "@telefrek/core/index.js"
import type { Optional } from "@telefrek/core/type/utils"
import {
  HttpStatusCode,
  type HttpHandler,
  type HttpRequest,
  type HttpResponse,
} from "@telefrek/http/index.js"
import {
  createRouter,
  getRoutingParameters,
  type Router,
} from "@telefrek/http/routing.js"
import { DefaultHttpMethodStatus, emptyHeaders } from "@telefrek/http/utils"
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
  return async (request: HttpRequest): Promise<HttpResponse> => {
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
        return {
          status: {
            code: HttpStatusCode.NO_CONTENT,
          },
          headers: emptyHeaders(),
        }
      } else {
        return {
          status: {
            code,
          },
          headers: emptyHeaders(),
          body:
            (serviceRoute.options.format ?? SerializationFormat.JSON) ===
            SerializationFormat.JSON
              ? createJsonBody(response)
              : createTextBody(response as string),
        }
      }
    }
  }
}
