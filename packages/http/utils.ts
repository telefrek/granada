/**
 * Utilities for HTTP operations
 */

import { urlToHttpOptions } from "url"
import {
  HttpMethod,
  HttpStatusCode,
  HttpVersion,
  type HttpBody,
  type HttpHeaders,
  type HttpPath,
  type HttpQuery,
  type HttpRequest,
} from "./index.js"

import { randomUUID as v4 } from "crypto"

import type { Optional } from "@telefrek/core/type/utils.js"
import { assert } from "console"
import { type IncomingHttpHeaders, type OutgoingHttpHeaders } from "http"

export function createHttpRequest(
  destination: string = "/",
  method: HttpMethod = HttpMethod.GET,
  version: HttpVersion = HttpVersion.HTTP1_1,
  headers: HttpHeaders = emptyHeaders(),
  body: Optional<HttpBody> = undefined,
): HttpRequest {
  const url = new URL(decodeURI(destination), "http://localhost")
  assert(url !== undefined, "URL should be valid")

  const { path, query } = parsePath(urlToHttpOptions(url).path ?? "/")
  return {
    id: v4(),
    method,
    version,
    path,
    query,
    headers,
    body,
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
      segments: uri[0].replace(/^\//, "").replace(/\/$/, "").split("/"),
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
