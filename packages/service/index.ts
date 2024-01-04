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
import { Router, createRouter } from "@telefrek/http/routing"

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
    router.register(endpoint.pathTemplate, endpoint.handler, endpoint.method)
  }

  // Return the router
  return router
}

// ------------------------------------------
// Custom Routing decorators
// ------------------------------------------

// Use an internal unique symbol that won't show up in mapping
const ROUTING_DATA: unique symbol = Symbol()

interface RoutableApiOptions {
  pathPrefix?: string
  format?: SerializationFormat
}

interface RouteOptions {
  template: string
  method?: HttpMethod
  format?: SerializationFormat
}

interface RouteInfo {
  options: RouteOptions
  // eslint-disable-next-line @typescript-eslint/ban-types
  method: Function
}

interface RoutingData {
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
export function routableApi(_options: RoutableApiOptions) {
  // Wrap in a legacy decorator until Node supports the Typescript v5 format
  return <ApiClass extends Constructor>(target: ApiClass) => {
    // Return the new class cast as a RoutableApi that can be passed into a pipeline
    return class extends target {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(...args: any[]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument
        super(...args)

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
                  const _resp: unknown = await info.method.call(this, [])
                  request.respond({
                    status: HttpStatus.OK,
                    headers: emptyHeaders(),
                  })
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

          const router = serviceToRouter(service)
          // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
          console.log(`Created router: ${router}`)
        }
      }
    }
  }
}

export function route(options: RouteOptions) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    classPrototype: any,
    methodName: string,
    descriptor: PropertyDescriptor,
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
