import type { Optional } from "@telefrek/core/type/utils"
import {
  createRouter,
  type RoutableApi,
  type Router,
} from "@telefrek/http/server/routing.js"
import {
  type RoutableApiOptions,
  type RoutableMethod,
  type RouteOptions,
  type Service,
  type ServiceRouteInfo,
} from "./index.js"
import { buildHandler, serviceToRouter } from "./util.js"

// Use an internal unique symbol that won't show up in mapping
const ROUTING_DATA: unique symbol = Symbol()

interface RoutingData {
  info: ServiceRouteInfo<unknown>[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getRoutingData = (proto: any): RoutingData => {
  return (proto[ROUTING_DATA] ??
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
export function routableApi(options: RoutableApiOptions) {
  // Wrap in a legacy decorator until Node supports the Typescript v5 format
  return <ApiClass extends Constructor>(target: ApiClass) => {
    // Return the new class cast as a RoutableApi that can be passed into a pipeline
    return class extends target implements RoutableApi {
      router: Router
      prefix: Optional<string>

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(...args: any[]) {
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
              handler: buildHandler(this, info),
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
    descriptor: PropertyDescriptor,
  ): void => {
    // Check to see if our symbol is already loaded
    const data = getRoutingData(classPrototype)

    if (typeof descriptor.value === "function") {
      const method = descriptor.value as RoutableMethod<unknown>

      data.info.push({
        options,
        method,
        name: methodName,
      })
    } else {
      throw new Error("Invalid target for decorator!")
    }
  }
}
