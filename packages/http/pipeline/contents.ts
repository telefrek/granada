/**
 * Common content pipeline operations
 */

import { streamToJson } from "@telefrek/core/json.js"
import { pipe } from "@telefrek/core/streams.js"
import {
  createBrotliCompress,
  createBrotliDecompress,
  createDeflate,
  createGunzip,
  createGzip,
  createInflate,
} from "zlib"
import { HttpErrorCode, type HttpError } from "../errors.js"
import {
  CommonHttpHeaders,
  HttpRequestHeaders,
  type HttpResponse,
  type MediaType,
} from "../index.js"
import { getMediaType } from "../media.js"
import type { HttpPipelineMiddleware } from "../pipeline.js"

export function createClientContentMiddleware(): HttpPipelineMiddleware {
  return {
    name: "clientContentParsing",
    modifyRequest(request) {
      if (request.body?.mediaType) {
        request.headers.set(
          CommonHttpHeaders.ContentType,
          request.body.mediaType.toString(),
        )
      }

      return undefined
    },
    modifyResponse(_, response) {
      parseResponseBody(response)
    },
  }
}

export const createServerContentMiddleware: (
  classifier?: (mediaType?: MediaType) => string,
) => HttpPipelineMiddleware = (
  classifier = (_) => {
    return "br"
  },
) => {
  return {
    name: "serverContentParsing",
    modifyRequest(request) {
      const mediaType = getMediaType(request.headers)
      if (mediaType && request.body) {
        request.body.mediaType = mediaType
        if (mediaType.type === "application" && "json" === mediaType.subType) {
          request.body.contents = streamToJson(request.body.contents)
        }
      }

      return undefined
    },
    modifyResponse(request, response) {
      if (response.body) {
        if (request.headers.has(HttpRequestHeaders.AcceptEncoding)) {
          const target = classifier(response.body?.mediaType) ?? "gzip"

          const encoding = request.headers.get(
            HttpRequestHeaders.AcceptEncoding,
          )!

          const values = (
            Array.isArray(encoding)
              ? encoding.flatMap((e) => e.split(",")).join(",")
              : encoding
          ).split(",")

          // Try the ideal, fallback to gzip
          if (values.indexOf(target) >= 0) {
            compressBody(response, [target])
          } else if (values.indexOf("gzip") >= 0) {
            compressBody(response, ["gzip"])
          }
        }
      }
    },
  }
}

/**
 * Verify there is a body and compress any information if allowed
 *
 * @param response The {@link HttpResponse} to compress
 * @param encoders The set of accepted encodings to apply
 */
function compressBody(response: HttpResponse, encoders: string[]): void {
  // Check if there is a body
  if (response.body) {
    // Set the media type header if available and not already done
    if (
      response.body.mediaType &&
      !response.headers.has(CommonHttpHeaders.ContentType)
    ) {
      response.headers.set(
        CommonHttpHeaders.ContentType,
        response.body.mediaType.toString(),
      )
    }

    // Check for supported encoders
    // TODO: Make this something that can more intelligently target types, for
    // now just sort so we get br if it's there...
    for (const encoding of encoders.sort()) {
      const e = encoding.split(";")[0]
      switch (e) {
        case "br":
          response.headers.delete(CommonHttpHeaders.ContentLength)
          response.headers.set(CommonHttpHeaders.ContentEncoding, e)
          response.body.contents = pipe(
            response.body.contents,
            createBrotliCompress(),
          )
          return
        case "gzip":
          response.headers.delete(CommonHttpHeaders.ContentLength)
          response.headers.set(CommonHttpHeaders.ContentEncoding, e)
          response.body.contents = pipe(response.body.contents, createGzip())
          return
        case "deflate":
          response.headers.delete(CommonHttpHeaders.ContentLength)
          response.headers.set(CommonHttpHeaders.ContentEncoding, e)
          response.body.contents = pipe(response.body.contents, createDeflate())
          return
      }
    }
  }
}

/**
 * Parses the content type information of the body and removes and compression
 *
 * @param response The {@link HttpResponse} to parse
 */
function parseResponseBody(response: HttpResponse): void {
  const { headers, body } = response

  // Verify the body exists
  if (body) {
    // Ensure the media type is available
    body.mediaType = getMediaType(headers)

    // Get the content encoding and decode if necessary
    const encoding = headers.get(CommonHttpHeaders.ContentEncoding)
    if (encoding) {
      // Apply the decode operations for each encoding
      for (const encoder of Array.isArray(encoding) ? encoding : [encoding]) {
        switch (encoder) {
          case "br":
            body.contents = pipe(body.contents, createBrotliDecompress())
            break
          case "gzip":
            body.contents = pipe(body.contents, createGunzip())
            break
          case "deflate":
            body.contents = pipe(body.contents, createInflate())
            break
          default:
            throw <HttpError>{
              errorCode: HttpErrorCode.UNSUPPORTED_ENCODING,
              description: `Unsupported encoding ${encoder} found on content-encoding`,
            }
        }
      }
    }
  }
}
