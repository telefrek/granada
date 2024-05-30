import { consumeJsonStream } from "@telefrek/core/json.js"
import { consumeStream } from "@telefrek/core/streams.js"
import type {
  AnyArgs,
  Constructor,
  Optional,
  Provider,
  Split,
} from "@telefrek/core/type/utils.js"
import type { HttpClient } from "@telefrek/http/client.js"
import {
  HttpBody,
  HttpMethod,
  HttpRequest,
  HttpStatusCode,
  type HttpHandler,
  type HttpResponse,
} from "@telefrek/http/index.js"
import {
  createRouter,
  getRoutingParameters,
  type Router,
} from "@telefrek/http/routing.js"
import {
  DefaultHttpMethodStatus,
  createRequest,
  emptyHeaders,
  jsonBody,
  jsonContents,
  noContents,
} from "@telefrek/http/utils.js"
import {
  SerializationFormat,
  ServiceResponse,
  isServiceError,
  type RoutableApi,
  type RoutableApiOptions,
  type Service,
  type ServiceError,
} from "./index.js"
import { serviceToRouter } from "./util.js"

/**
 * Defines the signature of an api call
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceApiCall = (...args: AnyArgs) => any

/**
 * Type to extract function keys
 */
type ApiCallKeys<T> = {
  [K in keyof T]: T[K] extends ServiceApiCall ? K : never
}[keyof T]

/**
 * Define the shape of a service API
 */
type ServiceApi<Api> = {
  [K in ApiCallKeys<Api>]: Api[K]
}

type Path<Template extends string> = Split<Template, "/">

type PathParams<Template extends string[]> = Template extends [
  infer Head,
  ...infer Rest,
]
  ? Head extends `:${infer P}`
    ? Rest extends string[]
      ? `${P}` | PathParams<Rest>
      : `${P}`
    : Rest extends string[]
      ? PathParams<Rest>
      : never
  : never

type ParameterDetails<Template extends string> = {
  [K in PathParams<Path<Template>>]: unknown
} & {
  body?: unknown
}

type ParameterMapping<
  Template extends string,
  ApiCall extends ServiceApiCall,
> = (...args: Parameters<ApiCall>) => ParameterDetails<Template>

type ParameterExtractor<
  Template extends string,
  ApiCall extends ServiceApiCall,
> = (details: ParameterDetails<Template>) => Parameters<ApiCall>

type ApiServiceRoute<
  Template extends string,
  ApiCall extends ServiceApiCall,
> = {
  extractor: ParameterExtractor<Template, ApiCall>
  target: ApiCall
  template: Template
  method: HttpMethod
  statusCode?: HttpStatusCode
}

type HttpClientProvider = Provider<HttpClient>

const CLIENT_SYMBOL: unique symbol = Symbol()
const SERVICE_ROUTES: unique symbol = Symbol()

function getServiceRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prototype: any,
): ApiServiceRoute<string, ServiceApiCall>[] {
  return (prototype[SERVICE_ROUTES] ??
    (prototype[SERVICE_ROUTES] = [])) as ApiServiceRoute<
    string,
    ServiceApiCall
  >[]
}

interface ClientHttpRequestOptions<Template extends string> {
  method: HttpMethod
  template: Template

  // TODO: How to get the host info into this...
  host?: string
  format?: SerializationFormat
}

function createClientRequest<
  Template extends string,
  ApiCall extends ServiceApiCall,
>(
  options: ClientHttpRequestOptions<Template>,
  parameterMapping: ParameterMapping<Template, ApiCall>,
  ...args: Parameters<ApiCall>
): HttpRequest {
  let path = options.template as string
  const details = parameterMapping(...args)

  for (const key in details) {
    if (key !== "body") {
      path = path.replace(
        `:${key}`,
        String(details[key as PathParams<Path<Template>>]),
      )
    }
  }

  let body: Optional<HttpBody>
  if (details.body) {
    switch (options.format ?? SerializationFormat.JSON) {
      case SerializationFormat.JSON:
        body = jsonBody(details.body)
        break
      default:
        throw new Error(`Unsupported serialization format: ${options.format}`)
    }
  }

  return createRequest({
    method: options.method,
    host: options.host,
    path,
    body,
  })
}

type ServiceApiCallDecorator<T extends ServiceApiCall> = (
  target: object,
  methodName: string | symbol,
  descriptor: TypedPropertyDescriptor<T>,
) => TypedPropertyDescriptor<T> | void

function proxyCall<Template extends string, ApiCall extends ServiceApiCall>(
  template: Template,
  parameterMapping: ParameterMapping<Template, ApiCall>,
  method: HttpMethod,
): ApiCall {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async function (this: any, ...args) {
    const clientProvider = this[CLIENT_SYMBOL] as HttpClientProvider

    if (clientProvider === undefined) {
      return <ServiceError>{
        message: `No HttpClientProvider located, please enable or bind the api`,
        code: HttpStatusCode.BAD_GATEWAY,
      }
    }

    try {
      const client = await clientProvider()
      const response = await client.submit(
        createClientRequest(
          {
            method,
            format: SerializationFormat.JSON,
            template,
          },
          parameterMapping,
          ...(args as Parameters<ApiCall>),
        ),
      )

      // TODO: Better handle error states
      switch (response.status.code) {
        case HttpStatusCode.OK:
        case HttpStatusCode.CREATED:
        case HttpStatusCode.ACCEPTED:
          if (response.body) {
            // TODO: For now we always send json...
            return await consumeJsonStream(response.body.contents)
          }
          return
        case HttpStatusCode.NO_CONTENT:
          return // Nothing to respond with...
        default:
          throw <ServiceError>{
            ...response.status,
          }
      }
    } catch (err) {
      throw <ServiceError>{
        message: `Unexpected error during processing`,
        code: HttpStatusCode.INTERNAL_SERVER_ERROR,
      }
    }
  } as ApiCall
}

/**
 * Class for manipulating {@link HttpClient} backed API
 */
export class HttpClientApi {
  /**
   * Class decorator to indicate this can be used as a {@link HttpClient} backed API
   *
   * @param clientProvider The {@link HttpClientProvider} to use
   * @returns An updated class that has the provider
   */
  static enable<ApiClass extends Constructor>(
    clientProvider: HttpClientProvider,
  ) {
    return (target: ApiClass) => {
      return class extends target {
        readonly [CLIENT_SYMBOL]: HttpClientProvider

        constructor(...args: AnyArgs) {
          super(...args)
          this[CLIENT_SYMBOL] = clientProvider
        }
      }
    }
  }

  static get<Template extends string, ApiCall extends ServiceApiCall>(
    template: Template,
    parameterMapping: ParameterMapping<Template, ApiCall>,
  ): ServiceApiCallDecorator<ApiCall> {
    return (_prototype, _methodName, descriptor) => {
      descriptor.value = proxyCall(template, parameterMapping, HttpMethod.GET)
    }
  }

  static post<Template extends string, ApiCall extends ServiceApiCall>(
    template: Template,
    parameterMapping: ParameterMapping<Template, ApiCall>,
  ): ServiceApiCallDecorator<ApiCall> {
    return (_prototype, _methodName, descriptor) => {
      descriptor.value = proxyCall(template, parameterMapping, HttpMethod.POST)
    }
  }

  static httpGet<Template extends string, ApiCall extends ServiceApiCall>(
    template: Template,
    parameterMapping: ParameterMapping<Template, ApiCall>,
  ): ApiCall {
    return proxyCall(template, parameterMapping, HttpMethod.GET) as ApiCall
  }

  static httpPost<Template extends string, ApiCall extends ServiceApiCall>(
    template: Template,
    parameterMapping: ParameterMapping<Template, ApiCall>,
  ): ApiCall {
    return proxyCall(template, parameterMapping, HttpMethod.POST) as ApiCall
  }
}

function buildHandler<
  ThisArg,
  Template extends string,
  ApiCall extends ServiceApiCall,
>(service: ThisArg, route: ApiServiceRoute<Template, ApiCall>): HttpHandler {
  return async (request: HttpRequest): Promise<HttpResponse> => {
    const details: ParameterDetails<Template> = {}
    if (request.body) {
      // Note at this point the middleware should have decoded anything...
      details.body = await consumeStream(request.body.contents)
    }

    const parameters = getRoutingParameters()
    if (parameters) {
      for (const entry of parameters.entries()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(details as any)[entry[0]] = entry[1]
      }
    }

    let response: Optional<ServiceResponse<unknown>>
    try {
      response = await route.target.call(service, ...route.extractor(details))
    } catch (err) {
      response = <ServiceError>{
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
    } else if (response === undefined || response === null) {
      return noContents()
    } else {
      return jsonContents(
        response,
        route.statusCode ?? DefaultHttpMethodStatus[request.method],
      )
    }
  }
}

export class HttpServerApi {
  static get<Template extends string, ApiCall extends ServiceApiCall>(
    template: Template,
    extractor: ParameterExtractor<Template, ApiCall>,
    statusCode?: HttpStatusCode,
  ): ServiceApiCallDecorator<ApiCall> {
    return (prototype, _methodName, descriptor) => {
      if (descriptor.value && typeof descriptor.value === "function") {
        const routeInfo = getServiceRoutes(prototype)
        routeInfo.push({
          template,
          extractor,
          method: HttpMethod.GET,
          target: descriptor.value!,
          statusCode,
        })
      }

      return
    }
  }

  static post<Template extends string, ApiCall extends ServiceApiCall>(
    template: Template,
    extractor: ParameterExtractor<Template, ApiCall>,
    statusCode?: HttpStatusCode,
  ): ServiceApiCallDecorator<ApiCall> {
    return (prototype, _methodName, descriptor) => {
      if (descriptor.value && typeof descriptor.value === "function") {
        const routeInfo = getServiceRoutes(prototype)
        routeInfo.push({
          template,
          extractor,
          method: HttpMethod.POST,
          target: descriptor.value!,
          statusCode,
        })
      }

      return
    }
  }

  static enable<ApiClass extends Constructor>(options?: RoutableApiOptions) {
    return (target: ApiClass) => {
      return class extends target implements RoutableApi {
        readonly router: Router
        readonly pathPrefix: Optional<string>
        constructor(...args: AnyArgs) {
          super(...args)

          // Suppress our properties from normal enumeration
          Object.defineProperty(this, "router", { enumerable: false })
          Object.defineProperty(this, "pathPrefix", { enumerable: false })

          this.pathPrefix = options?.pathPrefix

          // Get the routes that have been configured
          const routes = getServiceRoutes(target.prototype)
          if (routes.length > 0) {
            // Create our service
            const service = <Service>{
              endpoints: [],
            }

            // Hook up all the endpoints
            for (const route of routes) {
              service.endpoints.push({
                pathTemplate: route.template,
                method: route.method,
                handler: buildHandler(this, route),
              })
            }

            // Build the router
            this.router = serviceToRouter(service)
          } else {
            // Create an empty router
            this.router = createRouter()
          }
        }
      }
    }
  }
}

export function bindApi<Api>(
  provider: HttpClientProvider,
  definition: ServiceApi<Api>,
): Api {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api: any = {
    ...definition,
  }
  api[CLIENT_SYMBOL] = provider

  return api as Api
}
