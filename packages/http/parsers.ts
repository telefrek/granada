/**
 * Package that handles content parsing
 */

import { MaybeAwaitable } from "@telefrek/core/index.js"
import type { Optional } from "@telefrek/core/type/utils"
import { Readable, Transform } from "stream"
import { MediaType, TopLevelMediaTypes, parseMediaType } from "./content.js"
import { HttpBody, HttpHeaders } from "./index.js"

/**
 * The content type header
 */
export const CONTENT_TYPE_HEADER = "content-type"
export const CONTENT_TYPE_HEADER_2 = "Content-Type"

/**
 * Try to extract the content type from the given headers
 * @param headers The {@link HttpHeaders} to examine
 * @returns The content type header or undefined
 */
export function getContentType(headers: HttpHeaders): Optional<MediaType> {
  let value: Optional<string | string[]>

  // Fast path is that we have it already lowercase
  if (headers.has(CONTENT_TYPE_HEADER)) {
    value = headers.get(CONTENT_TYPE_HEADER)
  } else if (headers.has(CONTENT_TYPE_HEADER_2)) {
    value = headers.get(CONTENT_TYPE_HEADER_2)
  }

  // If undefined, may be that we got a headers collection without lowercase somehow
  if (value === undefined) {
    // Iterate the headers trying to find a match
    for (const header of headers.keys()) {
      if (header.toLowerCase() === CONTENT_TYPE_HEADER) {
        value = headers.get(header)
        break
      }
    }
  }

  // Return the value if it was found
  return typeof value === "string"
    ? parseMediaType(value)
    : typeof value === "object" && Array.isArray(value)
      ? parseMediaType(value[0])
      : undefined
}

export type ContentTypeParser = (body: HttpBody) => MaybeAwaitable<void>

/**
 * The set of content parsers
 */
export const CONTENT_PARSERS: Partial<
  Record<TopLevelMediaTypes, ContentTypeParser>
> = {
  application: (_body: HttpBody): MaybeAwaitable<void> => {
    return
  },
}

export function parseBody(mediaType: MediaType, body: Readable): Readable {
  if (mediaType) {
    switch (mediaType.type) {
      case "application":
        switch (true) {
          case "json" === mediaType.subType:
            return readBodyAsJson(body)
        }
        break
    }
  }

  return body
}

export function readBodyAsJson(readable: Readable): Readable {
  let data = ""
  const transform = new Transform({
    writableObjectMode: true,
    readableObjectMode: true,
    objectMode: true,
    transform(chunk, encoding, callback) {
      data += Buffer.isBuffer(chunk) ? chunk.toString(encoding) : chunk
      callback()
    },
    final(callback) {
      this.push(JSON.parse(data))
      callback()
    },
  })

  return readable.pipe(transform, { end: true })
}
