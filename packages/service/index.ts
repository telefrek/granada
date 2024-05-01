/**
 * Common components used by this package
 */

import type { Optional } from "@telefrek/core/type/utils.js"
import {
  HttpHandler,
  HttpMethod,
  type HttpBody,
  type HttpStatusCode,
} from "@telefrek/http/index.js"
import { CommonMediaTypes } from "@telefrek/http/media.js"
import { Readable } from "stream"
import type { MaybeAwaitable } from "../core/index.js"
import type { RoutingParameters } from "../http/routing.js"

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
  method: HttpMethod
}

/**
 * A service is a set of endpoints with an optional top level prefix
 */
export interface Service {
  endpoints: Endpoint[]
}

/** A service error */
export interface ServiceError {
  code: HttpStatusCode
  message?: string
  body?: HttpBody
}

export function createTextBody(message: string): HttpBody {
  return {
    mediaType: CommonMediaTypes.HTML,
    contents: Readable.from(message),
  }
}

export function createJsonBody(body: ServiceResponseType): HttpBody {
  return {
    mediaType: CommonMediaTypes.JSON,
    contents: Readable.from(JSON.stringify(body)),
  }
}

/**
 * Type guard for {@link ServiceError} instances
 *
 * @param response The unknown response
 * @returns True if the response is a {@link ServiceError}
 */
export function isServiceError(response: unknown): response is ServiceError {
  if (
    typeof response === "object" &&
    response !== null &&
    "code" in response &&
    typeof response.code === "number"
  ) {
    if ("message" in response && typeof response.message !== "string") {
      return false
    }

    if (
      "body" in response &&
      !(typeof response.body === "string" || Buffer.isBuffer(response.body))
    ) {
      return false
    }

    return true
  }

  return false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServiceResponseType = any | any[]

/** A type that is either an object or {@link ServiceError} */
export type ServiceResponse<T extends ServiceResponseType> = T | ServiceError

/** Custom type definition for a method that is routable */
export type RoutableMethod<T> = (
  ...args: unknown[]
) => MaybeAwaitable<ServiceResponse<T>>

/**
 * A service route
 */
export interface ServiceRouteInfo<T> {
  /** The {@link RouteOptions} for the route */
  options: RouteOptions
  /** The name of the route */
  name: string
  /** The {@link RoutableMethod} */
  method: RoutableMethod<T>
}

// ------------------------------------------
// Custom Routing decorators
// ------------------------------------------

export type RouteParameter = string

/**
 * Options for controlling {@link RoutableApi} behaviors
 */
export interface RoutableApiOptions {
  pathPrefix?: string
  format?: SerializationFormat
}

/**
 * Allows for mapping of parameters
 */
export type ParameterMapping = <T = unknown>(
  parameters: Optional<RoutingParameters>,
  body?: T,
) => unknown[]

export type ServiceErrorHandler = (error: unknown) => ServiceError

/**
 * Options for controlling a specific {@link RoutableApi} route behavior
 */
export interface RouteOptions {
  /** The template string for the routing */
  template: string
  /** The {@link HttpMethod} this route handles */
  method: HttpMethod
  /** The {@link SerializationFormat} for the body/response */
  format?: SerializationFormat
  /** the {@link ParameterMapping} for calling this method */
  mapping?: ParameterMapping
  /** The status code to return on success */
  statusCode?: HttpStatusCode
  /** Optional error handler */
  errorHandler?: ServiceErrorHandler
}
