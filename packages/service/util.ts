import {
  DefaultHttpMethodStatus,
  HttpStatus,
  type HttpHandler,
  type HttpRequest,
} from "@telefrek/http/index.js"
import { createRouter, type Router } from "@telefrek/http/server/routing.js"
import type { Readable } from "stream"
import { DeferredPromise } from "../core/index.js"
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
    deferred.resolve(undefined)
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
    let args: unknown[] | undefined

    // Read the body
    const body = request.body
      ? (await readBody(request.body.contents!)).at(0)
      : undefined

    if (serviceRoute.options.mapping) {
      args = serviceRoute.options.mapping(
        request.path.parameters ?? new Map(),
        body,
      )
    } else if (body) {
      args = [body]
    }

    let response: ServiceResponse<T> | undefined

    try {
      response = await (args
        ? serviceRoute.method.call(service, ...args!)
        : serviceRoute.method.call(service))
    } catch (err) {
      response = serviceRoute.options.errorHandler
        ? serviceRoute.options.errorHandler(err)
        : {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
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
          status: HttpStatus.NO_CONTENT,
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
