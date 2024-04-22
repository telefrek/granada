/**
 * Core package definitions and interfaces
 */

import { Emitter } from "@telefrek/core/events.js"
import { LifecycleEvents } from "@telefrek/core/lifecycle.js"
import type { TraceableContext } from "@telefrek/core/observability/tracing"
import type { TransformFunc } from "@telefrek/core/streams.js"
import type { Readable } from "stream"
import type { MediaType } from "./content.js"

export type StringOrArray = string | string[]

export type SegmentValue = string | number | boolean

// TODO: Replace references with this for parameters...
export type ParameterMap = Map<string, SegmentValue>

/**
 * Supported methods for HTTP operations
 */
export enum HttpMethod {
  DELETE = "DELETE",
  GET = "GET",
  HEAD = "HEAD",
  OPTIONS = "OPTIONS",
  PATCH = "PATCH",
  POST = "POST",
  PUT = "PUT",
}

/**
 * Valid {@link HttpMethod} values as an array
 */
export const HTTP_METHODS = [
  HttpMethod.DELETE,
  HttpMethod.GET,
  HttpMethod.HEAD,
  HttpMethod.OPTIONS,
  HttpMethod.PATCH,
  HttpMethod.POST,
  HttpMethod.PUT,
] as HttpMethod[]

/**
 * Supported HTTP Versions
 */
export enum HttpVersion {
  HTTP1_1 = "HTTP1.1",
  HTTP_2 = "HTTP2",
}

/**
 * HttpHeaders are collections of key, value pairs where the value can be singular or an array
 */
export type HttpHeaders = Map<string, StringOrArray>

/**
 * Create an empty set of {@link HttpHeaders}
 * @returns An empty set of {@link HttpHeaders}
 */
export function emptyHeaders(): HttpHeaders {
  return new Map()
}

/**
 * An interface defining the query portion of a request
 */
export interface HttpQuery {
  readonly original: string
  parameters: Map<string, StringOrArray>
}

/**
 * An interface defining the path portion of a request
 */
export interface HttpPath {
  readonly original: string
  segments: string[]
  parameters?: Map<string, SegmentValue>
}

/**
 * An interface defining the body that is transmitted as part of the request/response cycle
 */
export interface HttpBody {
  mediaType?: MediaType
  contents?: Readable
}

/**
 * Set of states that a {@link HttpRequest} can be in
 */
export enum HttpRequestState {
  /** The request is waiting to be processed */
  PENDING = "pending",
  /** The request is being read but not processed via handler */
  READING = "reading",
  /** The request is being processed via a handler */
  PROCESSING = "processing",
  /** The request has response data being written to it */
  WRITING = "writing",
  /**  The request was fully written and completed */
  COMPLETED = "completed",
  /** The request timed out before being handled */
  TIMEOUT = "timeout",
  /** The request encountered some error */
  ERROR = "error",
  /** The request was dropped (shed) for some reason */
  DROPPED = "dropped",
}

/**
 * Specific extra
 */
export interface HttpRequestEvents extends LifecycleEvents {
  stateChanged: (from: HttpRequestState, to: HttpRequestState) => void
}

/**
 * An interface defining the behavior of an HTTP Request
 */
export interface HttpRequest
  extends Emitter<HttpRequestEvents>,
    TraceableContext {
  path: HttpPath
  method: HttpMethod
  headers: HttpHeaders
  version: HttpVersion
  state: HttpRequestState
  query?: HttpQuery
  body?: HttpBody

  respond(response: HttpResponse, state?: HttpRequestState): void
}

/**
 * Set of status codes with names
 */
export enum HttpStatus {
  CONTINUE = 100,
  SWITCH_PROTOCOLS = 101,
  PROCESSING = 102,
  EARLY_HINTS = 103,
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NON_AUTHORITIVE_INFORMATION = 203,
  NO_CONTENT = 204,
  RESET_CONTENT = 205,
  PARTIAL_CONTENT = 206,
  MULTI_STATUS = 207,
  ALREADY_REPORTED = 208,
  IM_USED = 226,
  MULTIPLE_CHOICES = 300,
  MOVED_PERMANENTLY = 301,
  FOUND = 302,
  SEE_OTHER = 303,
  NOT_MODIFIED = 304,
  USE_PROXY = 305,
  SWITCH_PROXY = 306,
  TEMPORARY_REDIRECT = 307,
  PERMANENT_REDIRECT = 308,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  PAYMENT_REQUIRED = 402,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  NOT_ACCEPTABLE = 406,
  PROXY_AUTHENTICATION_REQUIRED = 407,
  REQUEST_TIMEOUT = 408,
  CONFLICT = 409,
  GONE = 410,
  LENGTH_REQUIRED = 411,
  PRECONDITION_FAILED = 412,
  PAYLOAD_TOO_LARGE = 413,
  URI_TOO_LONG = 414,
  UNSUPPORTED_MEDIA_TYPE = 415,
  RANGE_NOT_SATISFIABLE = 416,
  EXPECTATION_FAILED = 417,
  TEAPOT = 418,
  MISDIRECTED_REQUEST = 421,
  UNPROCESSABLE_ENTITY = 422,
  LOCKED = 423,
  FAILED_DEPENDENCY = 424,
  TOO_EARLY = 425,
  UPGRADE_REQUIRED = 426,
  PRECONDITION_REQUIRED = 428,
  TOO_MANY_REQUESTS = 429,
  REQUEST_HEADER_FIELDS_TOO_LARGE = 431,
  UNAVAILABLE_FOR_LEGAL_REASONS = 451,
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
  HTTP_VERSION_NOT_SUPPORTED = 505,
  VARIANT_ALSO_NEGOTIATES = 506,
  INSUFFICIENT_STORAGE = 507,
  LOOP_DETECTED = 508,
  NOT_EXTENDED = 510,
  NETWORK_AUTHENTICATION_REQUIRED = 511,
}

/**
 * An interface defining the shape of an HTTP Response
 */
export interface HttpResponse {
  /** The {@link HttpStatus} to return */
  status: HttpStatus
  /** The {@link HttpHeaders} to include in the response */
  headers?: HttpHeaders
  /** The optional status message to return */
  statusMessage?: string
  /** The {@link HttpBody} to return */
  body?: HttpBody
}

/**
 * Default {@link HttpStatus} for each {@link HttpMethod}
 */
export const DefaultHttpMethodStatus = {
  [HttpMethod.DELETE]: HttpStatus.NO_CONTENT,
  [HttpMethod.GET]: HttpStatus.OK,
  [HttpMethod.HEAD]: HttpStatus.NO_CONTENT,
  [HttpMethod.OPTIONS]: HttpStatus.OK,
  [HttpMethod.PATCH]: HttpStatus.ACCEPTED,
  [HttpMethod.POST]: HttpStatus.CREATED,
  [HttpMethod.PUT]: HttpStatus.ACCEPTED,
} as const

/**
 * Utility method to check for {@link FileContentResponse} objects
 *
 * @param response A {@link HttpResponse} to inspect
 * @returns True if the response is a {@link FileContentResponse}
 */
export function isFileContent(
  response: HttpResponse,
): response is FileContentResponse {
  return (
    response !== undefined &&
    "filePath" in response &&
    typeof response.filePath === "string"
  )
}

/**
 * An interface for defining the shape of a file HTTP Response
 */
export interface FileContentResponse extends HttpResponse {
  filePath: string
}

/**
 * Simple type for contracting the async model for an HTTP request/response operation
 */
export type HttpHandler = (request: HttpRequest) => Promise<void>

export type HttpTransform = TransformFunc<HttpRequest, HttpRequest>

/**
 * Parse the path string into it's corresponding {@link HttpPath} and {@link HttpQuery}
 *
 * @param path The path to parse
 * @returns A {@link HttpPath} and {@link HttpQuery} representing the path
 */
export function parsePath(path: string): { path: HttpPath; query?: HttpQuery } {
  // Remove any URI encoding
  const uri = decodeURI(path).split("?")

  // Parse out the path and the query, removing leading and trailing '/' characters
  return {
    path: {
      original: uri[0],
      segments: uri[0].replace(/^\//, "").replace(/\/$/, "").split("/"),
      parameters: new Map(),
    },
    query:
      uri.length > 1
        ? {
            original: uri[1],
            parameters: uri[1].split("&").reduce((map, segment) => {
              const kv = segment.split("=")
              if (kv.length === 2) {
                if (map.has(kv[0])) {
                  if (Array.isArray(map.get(kv[0]))) {
                    ;(map.get(kv[0])! as string[]).push(kv[1])
                  } else {
                    map.set(kv[0], [map.get(kv[0])! as string, kv[1]])
                  }
                } else {
                  map.set(kv[0], kv[1])
                }
              }
              return map
            }, new Map<string, StringOrArray>()),
          }
        : undefined,
  }
}

/**
 * Check to see if the request is in a terminal state (should not require
 * further processing))
 *
 * @param request The {@link HttpRequest} to check
 *
 * @returns True if the request is in a state indicating no further processing
 * is allowed
 */
export function isTerminal(request: HttpRequest): boolean {
  switch (request.state) {
    case HttpRequestState.COMPLETED:
    case HttpRequestState.TIMEOUT:
    case HttpRequestState.ERROR:
    case HttpRequestState.DROPPED:
      return true
    default:
      return false
  }
}
