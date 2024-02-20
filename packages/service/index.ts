/**
 * Common components used by this package
 */

import {
  HttpHandler,
  HttpMethod,
  HttpRequest,
  HttpStatus,
  emptyHeaders,
} from "@telefrek/http"
import { parseMediaType } from "@telefrek/http/content"
import { RoutableApi, Router, createRouter } from "@telefrek/http/routing"
import { Readable } from "stream"

/**
 * The target platform the service will be running on for optimizing some operations
 */
export enum HostingPlatform {
  BARE_METAL,
  ECS,
  LAMBDA,
  KUBERNETES,
}

/**
 * The format for serializing data across the wire
 */
export enum SerializationFormat {
  JSON,
}

/**
 * An endpoint is a combination of handler, template and optional method (undefined is all methods)
 */
export interface Endpoint {
  pathTemplate: string
  handler: HttpHandler
  method?: HttpMethod
}

/**
 * A service is a set of endpoints with an optional top level prefix
 */
export interface Service {
  endpoints: Endpoint[]
}

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

// ------------------------------------------
// Custom Routing decorators
// ------------------------------------------

// Use an internal unique symbol that won't show up in mapping
const ROUTING_DATA: unique symbol = Symbol()

export type RouteParameter = string

/**
 * Options for controlling {@link RoutableApi} behaviors
 */
export interface RoutableApiOptions {
  pathPrefix?: string
  format?: SerializationFormat
}

/**
 * Options for controlling a specific {@link RoutableApi} route behavior
 */
export interface RouteOptions {
  template: string
  method?: HttpMethod
  format?: SerializationFormat
  parameters?: string[]
}

interface RouteInfo {
  options: RouteOptions
  // eslint-disable-next-line @typescript-eslint/ban-types
  method: Function
}

interface RoutingData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: RouteInfo[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getRoutingData = (proto: any): RoutingData => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return (proto[ROUTING_DATA] ??
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (proto[ROUTING_DATA] = { info: [] })) as RoutingData
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
type Constructor = new (...args: any[]) => {}

/**
 * This decorator will translate the class into a {@link Service} and register it for handling calls
 *
 * @param pathPrefix The optional path prefix
 * @returns An new instance of the class that has been wrapped as a {@link Service} and hooked into the global routing
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/prefer-function-type, @typescript-eslint/ban-types
export function routableApi(options: RoutableApiOptions) {
  // Wrap in a legacy decorator until Node supports the Typescript v5 format
  return <ApiClass extends Constructor>(target: ApiClass) => {
    // Return the new class cast as a RoutableApi that can be passed into a pipeline
    return class extends target implements RoutableApi {
      router: Router
      prefix: string | undefined

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(...args: any[]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument
        super(...args)

        // Hide our extra properties
        Object.defineProperty(this, "router", { enumerable: false })
        Object.defineProperty(this, "prefix", { enumerable: false })

        // Get the routing data
        const routingData = getRoutingData(target.prototype)

        if (routingData.info.length > 0) {
          // Build the service route info
          const service: Service = {
            endpoints: [],
          }

          for (const info of routingData.info) {
            service.endpoints.push({
              pathTemplate: info.options.template,
              method: info.options.method,
              handler: async (request: HttpRequest): Promise<void> => {
                try {
                  // Create a storage location for the parameter mapping
                  const args: unknown[] = []

                  // Check for body contents and push those to the contents
                  if (request.body?.contents) {
                    const bodyArgs: unknown[] = []
                    for await (const obj of request.body.contents) {
                      bodyArgs.push(obj)
                    }

                    if (bodyArgs.length === 1) {
                      args.push(bodyArgs[0])
                    } else if (bodyArgs.length > 0) {
                      args.push(bodyArgs)
                    }
                  }

                  // Check for parameters
                  if (request.path.parameters && info.options.parameters) {
                    args.push(
                      ...info.options.parameters.map(
                        (p) => request.path.parameters!.get(p) ?? undefined
                      )
                    )
                  }

                  // Invoke the method
                  const resp: unknown = await info.method.call(
                    this,
                    args.length === 1 ? args[0] : args
                  )

                  if (
                    resp &&
                    (typeof resp === "object" || Array.isArray(resp))
                  ) {
                    request.respond({
                      status: HttpStatus.OK,
                      headers: emptyHeaders(),
                      body: {
                        mediaType: parseMediaType("application/json"),
                        contents: Readable.from(
                          Buffer.from(JSON.stringify(resp), "utf-8")
                        ),
                      },
                    })
                  } else {
                    request.respond({
                      status: HttpStatus.OK,
                      headers: emptyHeaders(),
                    })
                  }
                } catch (err) {
                  console.log(`Error: ${JSON.stringify(err)}`)
                  request.respond({
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                    headers: emptyHeaders(),
                  })
                }

                return
              },
            })
          }

          this.router = serviceToRouter(service)
          this.prefix = options.pathPrefix
        } else this.router = createRouter()
      }
    }
  }
}

export function route(options: RouteOptions) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    classPrototype: any,
    methodName: string,
    descriptor: PropertyDescriptor
  ): void => {
    // Check to see if our symbol is already loaded
    const data = getRoutingData(classPrototype)
    // eslint-disable-next-line @typescript-eslint/ban-types
    const method = descriptor.value as Function

    data.info.push({
      options,
      method,
    })
  }
}
