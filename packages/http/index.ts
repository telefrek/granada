/**
 * Core package definitions and interfaces
 */

import type { MaybeAwaitable } from "@telefrek/core"
import type { Emitter } from "@telefrek/core/events.js"
import { LifecycleEvents } from "@telefrek/core/lifecycle.js"
import type { TransformFunc } from "@telefrek/core/streams.js"
import type { Readable } from "stream"
import type { MediaType } from "./content.js"

// TODO: Should also consider validation of strings...

/**
 * A segment value must be a string, number or boolean
 *
 */
export type SegmentValue = string | number | boolean

/**
 * Query parameters are named parameters that can be singular or an array
 */
export type QueryParameters = Map<string, string | string[]>

/**
 * HttpHeaders are collections of key, value pairs where the value can be singular or an array
 */
export type HttpHeaders = Map<string, string | string[]>

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
 * Set of status codes with names
 */
export enum HttpStatusCode {
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
 * Represents the HTTP Status object
 */
export interface HttpStatus {
  code: HttpStatusCode
  message?: string
}

/**
 * An interface defining the query portion of a request
 */
export interface HttpQuery {
  readonly original: string
  parameters: QueryParameters
}

/**
 * An interface defining the path portion of a request
 */
export interface HttpPath {
  readonly original: string
  readonly segments: string[]
  template?: string
}

/**
 * An interface defining the body that is transmitted as part of the request/response cycle
 */
export interface HttpBody {
  mediaType?: MediaType
  contents: Readable
}

/**
 * Set of states that a {@link HttpOperation} can be in
 */
export enum HttpOperationState {
  /** The operation was aborted by either side */
  ABORTED = "aborted",
  /**  The operation has been fully completed */
  COMPLETED = "completed",
  /** The operation is being processed via a handler */
  PROCESSING = "processing",
  /** The operation is waiting to be processed */
  QUEUED = "queued",
  /** The operation contents are being read */
  READING = "reading",
  /** The operation timed out before being handled */
  TIMEOUT = "timeout",
  /** The operation contents are being written */
  WRITING = "writing",
}

/**
 * Specific operations that occur during {@link HttpOperation} processing
 */
export interface HttpOperationEvents extends LifecycleEvents {
  /**
   * Event raised when there is a state change
   *
   * @param previousState The previous {@link HttpOperationState}
   */
  changed: (previousState: HttpOperationState) => void

  /**
   * Event raised when the operation receives a {@link HttpResponse}
   *
   * @param response The {@link HttpResponse}
   */
  response: (response: HttpResponse) => void

  /**
   * Event fired on an error during the processing of the operation
   *
   * @param error The error that was encountered
   */
  error: (error: unknown) => void
}

/**
 * An operation that has a request and response pair
 */
export interface HttpOperation extends Emitter<HttpOperationEvents> {
  /** The current {@link HttpOperationState} */
  readonly state: HttpOperationState
  /** The {@link HttpRequest} that initiated the operation */
  readonly request: Readonly<HttpRequest>
  /** The {@link HttpResponse} that was paired with the operation */
  response?: Readonly<HttpResponse>
}

/**
 * An interface defining the behavior of an HTTP Request
 */
export interface HttpRequest {
  readonly id: string
  readonly path: HttpPath
  readonly method: HttpMethod
  readonly headers: HttpHeaders
  readonly version: HttpVersion
  readonly query?: HttpQuery
  readonly body?: HttpBody
}

/**
 * An interface defining the shape of an HTTP Response
 */
export interface HttpResponse {
  /** The {@link HttpStatus} to return */
  readonly status: HttpStatus
  /** The {@link HttpHeaders} to include in the response */
  readonly headers?: HttpHeaders
  /** The {@link HttpBody} to return */
  readonly body?: HttpBody
}

/**
 * Simple type for handling a {@link HttpRequest}
 */
export type HttpHandler = (
  operation: HttpRequest,
) => MaybeAwaitable<HttpResponse>

/**
 * A simple type representing a stream transform on a {@link HttpOperation}
 */
export type HttpTransform = TransformFunc<HttpOperation, HttpOperation>

/**
 * Definition of events for {@link HttpOperation} providers
 */
export interface HttpOperationSourceEvents extends LifecycleEvents {
  /**
   * Fired when a new {@link HttpOperation} is available
   *
   * @param operation The {@link HttpOperation} that was received
   */
  received: (operation: HttpOperation) => void
}

/**
 * Custom type for objects that create {@link HttpOperation} via events
 */
export type HttpOperationSource = Emitter<HttpOperationSourceEvents>

/**
 * Common TLS Options
 */
export interface TLSConfig {
  certificateAuthority?: Buffer | string
  privateKey: Buffer | string
  publicCertificate: Buffer | string
}
