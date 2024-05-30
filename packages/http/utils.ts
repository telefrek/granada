/**
 * Utilities for HTTP operations
 */

import { urlToHttpOptions } from "url"
import {
  CommonHttpHeaders,
  HttpHeaders,
  HttpMethod,
  HttpRequestHeaders,
  HttpStatusCode,
  type HttpBody,
  type HttpPath,
  type HttpQuery,
  type HttpRequest,
  type HttpResponse,
} from "./index.js"

import { streamJson } from "@telefrek/core/json.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import { GRANADA_VERSION } from "@telefrek/core/version.js"
import { assert } from "console"
import { type IncomingHttpHeaders, type OutgoingHttpHeaders } from "http"
import { Readable } from "stream"
import { CommonMediaTypes } from "./media.js"

/**
 * Creates a new no content {@link HttpResponse}
 *
 * @returns A new {@link HttpResponse}
 */
export function noContents(): HttpResponse {
  return {
    status: {
      code: HttpStatusCode.NO_CONTENT,
    },
    headers: emptyHeaders(),
  }
}

/**
 * Creates a new forbidden {@link HttpResponse}
 *
 * @returns A new {@link HttpResponse}
 */
export function forbidden(): HttpResponse {
  return {
    status: {
      code: HttpStatusCode.FORBIDDEN,
    },
    headers: emptyHeaders(),
  }
}

/**
 * Creates a new internal server error {@link HttpResponse}
 *
 * @returns A new {@link HttpResponse}
 */
export function serverError(): HttpResponse {
  return {
    status: {
      code: HttpStatusCode.INTERNAL_SERVER_ERROR,
    },
    headers: emptyHeaders(),
  }
}

/**
 * Creates a new content not found {@link HttpResponse}
 *
 * @returns A new {@link HttpResponse}
 */
export function notFound(): HttpResponse {
  return {
    status: {
      code: HttpStatusCode.NOT_FOUND,
    },
    headers: emptyHeaders(),
  }
}

/**
 * Creates a new method not allowed {@link HttpResponse}
 *
 * @returns A new {@link HttpResponse}
 */
export function notAllowed(): HttpResponse {
  return {
    status: {
      code: HttpStatusCode.METHOD_NOT_ALLOWED,
    },
    headers: emptyHeaders(),
  }
}

/**
 * Create an error {@link HttpResponse}, optionally passing the validation errors
 *
 * @param validationErrors The optional set of validation errors to return as JSON
 * @returns A new {@link HttpResponse}
 */
export function invalidRequest(validationErrors?: unknown): HttpResponse {
  // Serialize the validation errors as JSON
  if (validationErrors) {
    return jsonContents(validationErrors, HttpStatusCode.BAD_REQUEST)
  }

  // Return an empty bad request
  return {
    status: {
      code: HttpStatusCode.BAD_REQUEST,
    },
    headers: emptyHeaders(),
  }
}

/**
 * Utility to create a JSON {@link HttpBody}
 *
 * @param body The contents to write as JSON
 * @returns A new {@link HttpBody}
 */
export function jsonBody(body: unknown): HttpBody {
  return {
    mediaType: CommonMediaTypes.JSON,
    contents: streamJson(body),
  }
}

/**
 * Utility to create a text {@link HttpBody}
 *
 * @param body The contents to write as text
 * @returns A new {@link HttpBody}
 */
export function textBody(message: string): HttpBody {
  return {
    mediaType: CommonMediaTypes.PLAIN,
    contents: Readable.from(message, { encoding: "utf-8" }),
  }
}

/**
 * Create a JSON formatted {@link HttpResponse}
 *
 * @param body The body to return as JSON
 * @param code The {@link HttpStatusCode} for the response (default is OK)
 * @returns A {@link HttpResponse} with the body in JSON format ready to process
 */
export function jsonContents(
  body: unknown,
  code: HttpStatusCode = HttpStatusCode.OK,
): HttpResponse {
  // Setup the headers and media type
  const mediaType = CommonMediaTypes.JSON
  const headers = emptyHeaders()
  headers.set(CommonHttpHeaders.ContentType, mediaType.toString())

  return {
    status: {
      code,
    },
    headers,
    body: {
      mediaType,
      contents: streamJson(body),
    },
  }
}

/**
 * Create a text/plain formatted {@link HttpResponse}
 *
 * @param body The body to return as text/plain
 * @param code The {@link HttpStatusCode} for the response (default is OK)
 * @returns A {@link HttpResponse} with the body in text/plain format ready to process
 */
export function textContents(
  body: string,
  code: HttpStatusCode = HttpStatusCode.OK,
): HttpResponse {
  // Setup the headers and media type
  const mediaType = CommonMediaTypes.PLAIN
  const headers = emptyHeaders()
  headers.set(CommonHttpHeaders.ContentType, mediaType.toString())

  return {
    status: {
      code,
    },
    headers,
    body: {
      mediaType,
      contents: Readable.from(body, { encoding: "utf-8" }),
    },
  }
}

export interface CreateRequestOptions {
  /** Flag to disable the default headers */
  disableDefaultHeaders?: boolean
  /** The request path (default is '/') */
  path?: string
  /** The host with scheme (default is http://localhost) */
  host?: string
  /** The method override (default is GET) */
  method?: HttpMethod
  /** Additional headers to include */
  customHeaders?: Map<string, string>
  /** An optional body to include */
  body?: HttpBody
}

export const GRANADA_USER_AGENT = `Granada_v${GRANADA_VERSION}`

/**
 * Creates a new {@link HttpRequest}
 *
 * @param options The {@link CreateRequestOptions} to use
 * @returns A new {@link HttpRequest}
 */
export function createRequest(options?: CreateRequestOptions): HttpRequest {
  // Create a URL and ensure valid
  const url = new URL(
    decodeURI(options?.path ?? "/"),
    options?.host ?? "http://localhost",
  )
  assert(url !== undefined, "URL should be valid")

  const headers = emptyHeaders()

  // Add default values if not explicitly specified
  if (!options?.disableDefaultHeaders) {
    // Set our accepted encodings
    headers.set(HttpRequestHeaders.AcceptEncoding, "br,deflate,gzip")
    headers.set(HttpRequestHeaders.AcceptCharset, "utf-8")
    headers.set(HttpRequestHeaders.Host, url.host)
    headers.set(HttpRequestHeaders.UserAgent, GRANADA_USER_AGENT)
  }

  // Set any custom headers that were provided
  if (options?.customHeaders) {
    for (const entry of options.customHeaders.entries()) {
      headers.set(entry[0], entry[1])
    }
  }

  // Set the content type if known
  if (options?.body?.mediaType) {
    headers.set(
      CommonHttpHeaders.ContentType,
      options.body.mediaType.toString(),
    )
  }

  return {
    ...parsePath(urlToHttpOptions(url).path ?? "/"),
    method: options?.method ?? HttpMethod.GET,
    headers,
    body: options?.body,
  }
}

/**
 * Custom class to build {@link HttpHeaders} from the given {@link NodeJS.Dict}
 */
export class IndexedHeaders implements HttpHeaders {
  private readonly _headers: NodeJS.Dict<string | string[]>

  constructor(headers: NodeJS.Dict<string | string[]>) {
    this._headers = headers
  }

  private _format(value?: string | string[] | number): Optional<string> {
    return value
      ? Array.isArray(value)
        ? value.join(",")
        : String(value)
      : undefined
  }

  get(name: string): Optional<string> {
    return this._format(this._headers[name])
  }

  has(name: string): boolean {
    return this._headers[name] !== undefined
  }

  set(name: string, value: string | string[]): void {
    this._headers[name] = value
  }

  delete(name: string): void {
    delete this._headers[name]
  }

  get raw(): NodeJS.Dict<string | string[]> {
    return this._headers
  }
}

/**
 * Create an empty set of {@link HttpHeaders}
 *
 * @returns An empty set of {@link HttpHeaders}
 */
export function emptyHeaders(): HttpHeaders {
  return new IndexedHeaders({})
}

/**
 * Default {@link HttpStatusCode} for each {@link HttpMethod}
 */
export const DefaultHttpMethodStatus = {
  [HttpMethod.DELETE]: HttpStatusCode.NO_CONTENT,
  [HttpMethod.GET]: HttpStatusCode.OK,
  [HttpMethod.HEAD]: HttpStatusCode.NO_CONTENT,
  [HttpMethod.OPTIONS]: HttpStatusCode.OK,
  [HttpMethod.PATCH]: HttpStatusCode.ACCEPTED,
  [HttpMethod.POST]: HttpStatusCode.CREATED,
  [HttpMethod.PUT]: HttpStatusCode.ACCEPTED,
} as const

/**
 * Extract the incoming headers to our framework representation
 *
 * @param incomingHttpHeaders The {@link IncomingHttpHeaders} to extract
 * @returns A new {@link HttpHeaders} object
 */
export function extractHeaders(
  incomingHttpHeaders: IncomingHttpHeaders,
): HttpHeaders {
  return new IndexedHeaders(incomingHttpHeaders)
}

/**
 * Inject the framework headers into the NodeJS header stack
 *
 * @param headers The {@link HttpHeaders} to inject
 * @param outgoingHeaders The {@link  OutgoingHttpHeaders} to write to
 */
export function injectHeaders(headers: HttpHeaders): OutgoingHttpHeaders {
  return headers.raw
}

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
      // segments: uri[0].replace(/^\//, "").replace(/\/$/, "").split("/"),
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
            }, new Map<string, string | string[]>()),
          }
        : undefined,
  }
}
