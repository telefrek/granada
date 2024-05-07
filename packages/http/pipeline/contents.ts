/**
 * Common content pipeline operations
 */

import { getDebugInfo } from "@telefrek/core"
import { info } from "@telefrek/core/logging"
import { pipe } from "@telefrek/core/streams.js"
import {
  createBrotliCompress,
  createBrotliDecompress,
  createDeflate,
  createGunzip,
  createGzip,
  createInflate,
} from "zlib"
import type { HttpOperationContext } from "../context.js"
import { HttpErrorCode, type HttpError } from "../errors.js"
import {
  CommonHttpHeaders,
  HttpRequestHeaders,
  type HttpResponse,
} from "../index.js"
import { CommonMediaTypes, getMediaType } from "../media.js"
import type { HttpTransform } from "../pipeline.js"

/**
 * Parse the response body
 *
 * @param context The current {@link HttpOperationContext}
 * @returns A transform for manipulating that context
 */
export const PARSE_RESPONSE_BODY: HttpTransform = (
  context: HttpOperationContext,
) => {
  if (context.response) {
    parseResponseBody(context.response)
  }

  return context
}

/**
 * Compress the response body based on the request information
 *
 * @param context The current {@link HttpOperationContext}
 * @returns A transform for manipulating that context
 */
export const COMPRESS_RESPONSE_BODY: HttpTransform = (
  context: HttpOperationContext,
) => {
  if (context.response) {
    const accept = context.operation.request.headers.get(
      HttpRequestHeaders.AcceptEncoding,
    )

    info(
      `compression check headers: ${getDebugInfo(context.operation.request.headers)}`,
    )

    compressBody(
      context.response,
      accept ? (Array.isArray(accept) ? accept : [accept]) : [],
    )
  }

  return context
}

/**
 * Ensure the response body is ready for sending and has appropriate headers and information
 *
 * @param context The current {@link HttpOperationContext}
 * @returns A transform for manipulating that context
 */
export const VERIFY_RESPONSE_BODY_FOR_SEND: HttpTransform = (
  context: HttpOperationContext,
) => {
  if (context.response) {
    const { body, headers } = context.response
    if (body) {
      const mediaType = body.mediaType ?? CommonMediaTypes.OCTET

      // Make sure content type is set if we have media types
      if (!headers.has(CommonHttpHeaders.ContentType)) {
        headers.set(CommonHttpHeaders.ContentType, mediaType.toString())
      }
    }
  }

  return context
}

/**
 * Ensure the request body is ready for sending and has appropriate headers and information
 *
 * @param context The current {@link HttpOperationContext}
 * @returns A transform for manipulating that context
 */
export const VERIFY_REQUEST_BODY_FOR_SEND: HttpTransform = (
  context: HttpOperationContext,
) => {
  if (context.operation.request.body) {
    const mediaType =
      context.operation.request.body.mediaType ?? CommonMediaTypes.OCTET

    // Make sure content type is set if we have media types
    if (!context.operation.request.headers.has(CommonHttpHeaders.ContentType)) {
      context.operation.request.headers.set(
        CommonHttpHeaders.ContentType,
        mediaType.toString(),
      )
    }
  }

  // Inject compression encoding support
  if (
    !context.operation.request.headers.has(HttpRequestHeaders.AcceptEncoding)
  ) {
    context.operation.request.headers.set(
      HttpRequestHeaders.AcceptEncoding,
      "deflate",
    )
  }

  return context
}

/**
 * Parse the request body
 *
 * @param context The current {@link HttpOperationContext}
 * @returns A transform for manipulating that context
 */
export const PARSE_REQUEST_BODY: HttpTransform = (
  context: HttpOperationContext,
) => {
  const { headers, body } = context.operation.request

  if (body) {
    body.mediaType = body.mediaType ?? getMediaType(headers)
  }

  return context
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
