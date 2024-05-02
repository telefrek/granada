/**
 * Utilities for HTTP operations
 */

import { urlToHttpOptions } from "url"
import {
  CommonHttpHeaders,
  HttpMethod,
  HttpRequestHeaders,
  HttpStatusCode,
  type HttpBody,
  type HttpHeaders,
  type HttpPath,
  type HttpQuery,
  type HttpRequest,
  type HttpResponse,
} from "./index.js"

import { randomUUID as v4 } from "crypto"

import { streamJson } from "@telefrek/core/json.js"
import { GRANADA_VERSION } from "@telefrek/core/version"
import { assert } from "console"
import { type IncomingHttpHeaders, type OutgoingHttpHeaders } from "http"
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

export interface CreateRequestOptions {
  /** Flag to disable the default headers */
  disableDefaultHeaders?: boolean
  /** The request path (default is '/') */
  path?: string
  /** The method override (default is GET) */
  method?: HttpMethod
  /** Additional headers to include */
  customHeaders?: HttpHeaders
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
export function createRequest(options: CreateRequestOptions): HttpRequest {
  // Create a URL and ensure valid
  const url = new URL(decodeURI(options.path ?? "/"), "http://localhost")
  assert(url !== undefined, "URL should be valid")

  const headers = emptyHeaders()

  // Add default values if not explicitly specified
  if (!options.disableDefaultHeaders) {
    // Set our accepted encodings
    headers.set(HttpRequestHeaders.AcceptEncoding, ["br", "deflate", "gzip"])
    headers.set(HttpRequestHeaders.AcceptCharset, "utf-8")
    headers.set(HttpRequestHeaders.Host, url.host)
    headers.set(HttpRequestHeaders.UserAgent, GRANADA_USER_AGENT)
    //headers.set(HttpRequestHeaders.Connection, "keep-alive")
  }

  // Set any custom headers that were provided
  if (options.customHeaders) {
    for (const entry of options.customHeaders.entries()) {
      headers.set(entry[0], entry[1])
    }
  }

  return {
    ...parsePath(urlToHttpOptions(url).path ?? "/"),
    id: v4(),
    method: options.method ?? HttpMethod.GET,
    headers,
    body: options.body,
  }
}

/**
 * Create an empty set of {@link HttpHeaders}
 * @returns An empty set of {@link HttpHeaders}
 */
export function emptyHeaders(): HttpHeaders {
  return new Map()
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
  const headers = emptyHeaders()

  for (const name of Object.keys(incomingHttpHeaders)) {
    if (incomingHttpHeaders[name] !== undefined) {
      headers.set(name, incomingHttpHeaders[name]!)
    }
  }

  return headers
}

/**
 * Inject the framework headers into the NodeJS header stack
 *
 * @param headers The {@link HttpHeaders} to inject
 * @param outgoingHeaders The {@link  OutgoingHttpHeaders} to write to
 */
export function injectHeaders(
  headers: HttpHeaders,
  outgoingHeaders: OutgoingHttpHeaders,
): void {
  for (const header of headers) {
    outgoingHeaders[header[0]] = header[1]
  }
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
