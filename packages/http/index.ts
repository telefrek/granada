/**
 * Core package definitions and interfaces
 */

import { type MaybeAwaitable } from "@telefrek/core/index.js"
import type { Optional } from "@telefrek/core/type/utils"
import { type Readable } from "stream"

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
export interface HttpHeaders {
  /**
   * Get the header with the given name
   * @param name The header name
   */
  get(name: string): Optional<string>

  /**
   * Check if the header with the name exists
   * @param name The header name
   */
  has(name: string): boolean

  /**
   * Set the name of the header
   *
   * @param name The header to set
   * @param value The value to set
   */
  set(name: string, value: string): void

  /**
   * Delete the header with the given name
   *
   * @param name The header to delete
   */
  delete(name: string): void

  /**
   * Gets the raw underlying headers
   */
  readonly raw: NodeJS.Dict<string | string[]>
}

/**
 * Common headers for requests and responses (lowercase)
 */
export enum CommonHttpHeaders {
  CacheControl = "cache-control",
  ContentEncoding = "content-encoding",
  ContentLength = "content-length",
  ContentType = "content-type",
  Date = "date",
  Upgrade = "upgrade",
  Via = "via",
}

/**
 * Headers for requests (lowercase)
 */
export enum HttpRequestHeaders {
  AcceptableInstanceManipulators = "a-im",
  Accept = "accept",
  AcceptCharset = "accept-charset",
  AcceptDatetime = "accept-datetime",
  AcceptEncoding = "accept-encoding",
  AcceptLanguage = "accept-language",
  AccessControlMethod = "access-control-request-method",
  AccessControlHeader = "access-control-request-headers",
  Authorization = "authorization",
  Connection = "connection",
  Cookie = "cookie",
  Forwarded = "forwarded",
  From = "from",
  Host = "host",
  IfMatch = "if-match",
  IfModifiedSince = "if-modified-since",
  IfNoneMatch = "if-none-match",
  IfRange = "if-range",
  IfUnmodifiedSince = "if-unmodified-since",
  MaxForwards = "max-forwards",
  Origin = "origin",
  Pragma = "pragma",
  Prefer = "prefer",
  ProxyAuthorization = "proxy-authorization",
  Range = "range",
  Referrer = "referrer",
  TransferEncodings = "te",
  Trailer = "trailer",
  TransferEncoding = "transfer-encoding",
  UserAgent = "user-agent",
}

/**
 * Headers for responses (lowercase)
 */
export enum HttpResponseHeaders {
  AccessControlAllowOrigin = "access-control-allow-origin",
  AccessControlAllowCredentials = "access-control-allow-credentials",
  AccessControlExposeHeaders = "access-control-expose-headers",
  AccessControlMaxAge = "access-control-max-age",
  AccessControlAllowMethods = "access-control-allow-methods",
  AccessControlAllowHeaders = "access-control-allow-headers",
  AcceptPatch = "accept-patch",
  AcceptRange = "accept-ranges",
  Age = "age",
  Allow = "allow",
  AlternativeServices = "alt-svc",
  Connection = "connection",
  ContentDisposition = "content-disposition",
  ContentLanguage = "content-language",
  ContentLocation = "content-location",
  ContentRange = "content-range",
  ContentSecurityPolicy = "content-security-policy",
  DeltaBase = "delta-base",
  ETag = "etag",
  Expires = "expires",
  InstanceManipulations = "im",
  LastModified = "last-modified",
  Link = "link",
  Location = "location",
  Pragma = "pragma",
  PreferenceApplied = "preference-applied",
  ProxyAuthenticate = "proxy-authenticate",
  PublicKeyPins = "public-key-pins",
  RetryAfter = "retry-after",
  Server = "server",
  SetCookie = "set-cookie",
  StrictTransportSecurity = "strict-transport-security",
  Trailer = "trailer",
  TransferEncoding = "transfer-encoding",
  TrackingStatus = "tk",
  Vary = "vary",
  WWWAuthenticate = "www-authenticate",
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
}

/**
 * An interface defining the body that is transmitted as part of the request/response cycle
 */
export interface HttpBody {
  /** The {@link MediaType} if known */
  mediaType?: MediaType
  /** The {@link Readable} contents */
  contents: Readable
}

/**
 * An interface defining the behavior of an HTTP Request
 */
export interface HttpRequest {
  readonly path: HttpPath
  readonly method: HttpMethod
  readonly headers: HttpHeaders
  readonly version?: HttpVersion
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
 * Common TLS Options
 */
export interface TLSConfig {
  certificateAuthority?: Buffer | string
  privateKey?: Buffer | string
  publicCertificate?: Buffer | string
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
  /** Encode the media type */
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
