/**
 * Core package definitions and interfaces
 */

import type { EventMap } from "@telefrek/core/events.js"
import type { MaybeAwaitable } from "@telefrek/core/index.js"
import { LifecycleEvents } from "@telefrek/core/lifecycle.js"
import type { Duration } from "@telefrek/core/time.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import { EventEmitter } from "events"
import { Stream, type Readable } from "stream"
import type { HttpError } from "./errors.js"

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

export enum HttpRequestHeaders {
  AcceptableInstanceManipulators = "A-IM",
  Accept = "Accept",
  AcceptCharset = "Accept-Charset",
  AcceptDatetime = "Accept-Datetime",
  AcceptEncoding = "Accept-Encoding",
  AcceptLanguage = "Accept-Language",
  AccessControlMethod = "Access-Control-Request-Method",
  AccessControlHeader = "Access-Control-Request-Headers",
  Authorization = "Authorization",
  CacheControl = "Cache-Control",
  Connection = "Connection",
  ContentEncoding = "Content-Encoding",
  ContentLength = "Content-Length",
  ContentType = "Content-Type",
  Cookie = "Cookie",
  Date = "Date",
  Forwarded = "Forwarded",
  From = "From",
  Host = "Host",
  IfMatch = "If-Match",
  IfModifiedSince = "If-Modified-Since",
  IfNoneMatch = "If-None-Match",
  IfRange = "If-Range",
  IfUnmodifiedSince = "If-Unmodified-Since",
  MaxForwards = "Max-Forwards",
  Origin = "Origin",
  Pragma = "Pragma",
  Prefer = "Prefer",
  ProxyAuthorization = "Proxy-Authorization",
  Range = "Range",
  Referrer = "Referrer",
  TransferEncodings = "TE",
  Trailer = "Trailer",
  TransferEncoding = "Transfer-Encoding",
  UserAgent = "User-Agent",
  Upgrade = "Upgrade",
  Via = "Via",
}

export enum HttpResponseHeaders {
  AccessControlAllowOrigin = "Access-Control-Allow-Origin",
  AccessControlAllowCredentials = "Access-Control-Allow-Credentials",
  AccessControlExposeHeaders = "Access-Control-Expose-Headers",
  AccessControlMaxAge = "Access-Control-Max-Age",
  AccessControlAllowMethods = "Access-Control-Allow-Methods",
  AccessControlAllowHeaders = "Access-Control-Allow-Headers",
  AcceptPatch = "Accept-Patch",
  AcceptRange = "Accept-Ranges",
  Age = "Age",
  Allow = "Allow",
  AlternativeServices = "Alt-Svc",
  CacheControl = "Cache-Control",
  Connection = "Connection",
  ContentDisposition = "Content-Disposition",
  ContentEncoding = "Content-Encoding",
  ContentLanguage = "Content-Language",
  ContentLength = "Content-Length",
  ContentLocation = "Content-Location",
  ContentRange = "Content-Range",
  ContentSecurityPolicy = "Content-Security-Policy",
  ContentType = "Content-Type",
  Date = "Date",
  DeltaBase = "Delta-Base",
  ETag = "ETag",
  Expires = "Expires",
  InstanceManipulations = "IM",
  LastModified = "Last-Modified",
  Link = "Link",
  Location = "Location",
  Pragma = "Pragma",
  PreferenceApplied = "Preference-Applied",
  ProxyAuthenticate = "Proxy-Authenticate",
  PublicKeyPins = "Public-Key-Pins",
  RetryAfter = "Retry-After",
  Server = "Server",
  SetCookie = "Set-Cookie",
  StrictTransportSecurity = "Strict-Transport-Security",
  Trailer = "Trailer",
  TransferEncoding = "Transfer-Encoding",
  TrackingStatus = "Tk",
  Upgrade = "Upgrade",
  Vary = "Vary",
  Via = "Via",
  WWWAuthenticate = "WWW-Authenticate",
}

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
export interface HttpOperation
  extends EventEmitter<EventMap<HttpOperationEvents>> {
  /** The current {@link HttpOperationState} */
  readonly state: HttpOperationState
  /** The {@link HttpRequest} that initiated the operation */
  readonly request: Readonly<HttpRequest>
  /** The {@link AbortSignal} for this operation */
  readonly signal?: AbortSignal
  /** The {@link HttpError} associated with failure if available */
  readonly error?: HttpError
  /** The {@link HttpResponse} that was paired with the operation */
  readonly response?: Readonly<HttpResponse>

  /**
   * Move the operation out of a queued {@link HttpOperationState}
   */
  dequeue(): boolean

  /**
   * Move the operation into a complete {@link HttpOperationState}
   */
  complete(response: HttpResponse): boolean

  /**
   * Handle failures in processing the operation
   *
   * @param cause The optional cause for the state change
   */
  fail(cause?: HttpError): void
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
  readonly headers: HttpHeaders
  /** The {@link HttpBody} to return */
  readonly body?: HttpBody
}

/**
 * Simple type for handling a {@link HttpRequest}
 */
export type HttpHandler = (
  request: HttpRequest,
  abort?: AbortSignal,
) => MaybeAwaitable<HttpResponse>

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
export type HttpOperationSource = EventEmitter<
  EventMap<HttpOperationSourceEvents>
>

/**
 * Create a new {@link HttpOperation} that moves through the expected state machine
 *
 * @param request The {@link HttpRequest} that started the operation
 * @param timeout The optional {@link Duration} before the request should timeout
 * @returns A new {@link HttpOperation}
 */
export function createHttpOperation(
  request: HttpRequest,
  timeout: Optional<Duration>,
): HttpOperation {
  return new DefaultHttpOperation(request, timeout)
}

class DefaultHttpOperation
  extends EventEmitter<EventMap<HttpOperationEvents>>
  implements HttpOperation
{
  private readonly _request: HttpRequest

  private _state: HttpOperationState
  private _abortController: AbortController
  private _error: Optional<HttpError>
  private _response: Optional<HttpResponse>
  private _timer?: NodeJS.Timeout

  get signal(): Optional<AbortSignal> {
    return this._abortController.signal
  }

  get state(): HttpOperationState {
    return this._state
  }

  get response(): HttpResponse | undefined {
    return this._response
  }

  get request(): Readonly<HttpRequest> {
    return this._request
  }

  get error(): Optional<HttpError> {
    return this._error
  }

  dequeue(): boolean {
    return this._read()
  }

  fail(cause?: HttpError): boolean {
    this._error = cause

    if (cause) {
      this.emit("error", cause)
    }

    // Stop any further processing
    return this._abort()
  }

  complete(response: HttpResponse): boolean {
    if (this._response === undefined) {
      this._response = response

      return this._write()
    }

    return false
  }

  constructor(request: HttpRequest, timeout?: Duration) {
    super({ captureRejections: true })

    this._request = request
    this._state = HttpOperationState.QUEUED
    this._abortController = new AbortController()

    if (timeout) {
      this._timer = setTimeout(() => {
        // Try to abort the call
        this._timeout()
      }, ~~timeout.milliseconds())
    }
  }

  /**
   * Private setter the changes the state and emits the status change
   */
  private set state(newState: HttpOperationState) {
    const previousState = this._state
    this._state = newState
    this.emit("changed", previousState)

    // Fire the finished event
    switch (newState) {
      case HttpOperationState.ABORTED:
      case HttpOperationState.COMPLETED:
      case HttpOperationState.TIMEOUT:
        this.emit("finished")
        break
      case HttpOperationState.WRITING:
        this.emit("started")
        break
    }
  }

  private _write(): boolean {
    // Make sure it's valid to switch this to writing
    if (this._check(HttpOperationState.WRITING)) {
      // Clear any pending timeouts
      clearTimeout(this._timer)

      // Check for a body and hook the consumption events
      if (this._response?.body) {
        const complete = this._complete.bind(this)
        Stream.finished(
          this._response.body.contents,
          (err: NodeJS.ErrnoException | null | undefined) => {
            if (!err) {
              complete()
            }
          },
        )
        return true
      } else {
        // Try to complete it now
        return this._complete()
      }
    }

    return false
  }

  private _read(): boolean {
    // Verify we can move to a reading state
    if (this._check(HttpOperationState.READING)) {
      // Check for a body and hook the consumption events
      if (this._request?.body) {
        const process = this._process.bind(this)
        Stream.finished(
          this._request.body.contents,
          (err: NodeJS.ErrnoException | null | undefined) => {
            if (!err) {
              process()
            }
          },
        )
        return true
      } else {
        // Try to complete it now
        return this._process()
      }
    }

    return false
  }

  /**
   * Aborts the request if it is valid to do so
   *
   * @returns True if the operation was successful
   */
  private _abort(): boolean {
    if (this._check(HttpOperationState.ABORTED)) {
      // Abort with a message from the root cause or generic message
      this._abortController.abort(
        this._error?.description ?? "Operation was aborted",
      )
      return true
    }

    return false
  }

  /**
   * Times the request out if it is valid to do so
   *
   * @returns True if the operation was successful
   */
  private _timeout(): boolean {
    if (this._check(HttpOperationState.TIMEOUT)) {
      this._abortController.abort("Operation timed out")
      return true
    }

    return false
  }

  /**
   * Completes the request if it is valid to do so
   *
   * @returns True if the operation was successful
   */
  private _complete(): boolean {
    return this._check(HttpOperationState.COMPLETED)
  }

  /**
   * Indicates the {@link HttpRequest} has been fully written
   *
   * @returns True if the operation was successful
   */
  private _process(): boolean {
    return this._check(HttpOperationState.PROCESSING)
  }

  /**
   * Check if the state transition is valid
   *
   * @param state The state to transition to
   * @returns True if the transition was successful
   */
  private _check(state: HttpOperationState): boolean {
    if (this._verifyTransition(this._state, state)) {
      this.state = state
      return true
    }

    return false
  }

  /**
   * Verify state transitions
   *
   * @param current The current state
   * @param target The target state
   * @returns True if the transition is valid
   */
  private _verifyTransition(
    current: HttpOperationState,
    target: HttpOperationState,
  ): boolean {
    switch (target) {
      case HttpOperationState.QUEUED:
        return false // You can never move backwards
      case HttpOperationState.READING:
        return current === HttpOperationState.QUEUED
      case HttpOperationState.PROCESSING:
        return current === HttpOperationState.READING
      case HttpOperationState.WRITING:
        return current === HttpOperationState.PROCESSING

      // These are terminal states and should be reachable by any other
      // non-terminal state
      case HttpOperationState.ABORTED:
      case HttpOperationState.TIMEOUT:
      case HttpOperationState.COMPLETED:
        return (
          current !== HttpOperationState.COMPLETED &&
          current !== HttpOperationState.TIMEOUT &&
          current !== HttpOperationState.ABORTED
        )
      default:
        return false
    }
  }
}

/**
 * Common TLS Options
 */
export interface TLSConfig {
  certificateAuthority?: Buffer | string
  privateKey?: Buffer | string
  publicCertificate: Buffer | string
  mutualAuthentication?: boolean
}

/**
 * Represents a MediaType (alternatively MimeType)
 *
 * {@link https://www.rfc-editor.org/rfc/rfc2046.html}
 */
export interface MediaType {
  type: TopLevelMediaTypes
  tree?: MediaTreeTypes
  subType?: string
  suffix?: string
  /** Note it's up to the type implementation to verify the parameters after parsing */
  parameters: Map<string, string>
  toString(): string
}

/**
 * Handling composite media types with special handling
 */
export interface CompositeMediaType extends MediaType {
  type: CompositeMediaTypes
}

/**
 * Represents multipart content types
 */
export class MultipartMediaType implements CompositeMediaType {
  readonly type: CompositeMediaTypes = "multipart"
  readonly parameters = new Map<string, string>()
}

/**
 * Represents message content types
 */
export class MessageMediaType implements CompositeMediaType {
  readonly type: CompositeMediaTypes = "message"
  readonly parameters = new Map<string, string>()
}
/**
 * The official composite types
 */
export type CompositeMediaTypes = "multipart" | "message"

/**
 * The simple and composite type set for all top level MediaTypes
 */
export type TopLevelMediaTypes =
  | "application"
  | "text"
  | "image"
  | "audio"
  | "video"
  | "model"
  | "font"
  | CompositeMediaTypes

/**
 * Supported media tree types
 */
export type MediaTreeTypes = "vnd" | "prs" | "x"
