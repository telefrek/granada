/**
 * Package that handles content parsing
 */

import { MaybeAwaitable } from "@telefrek/core/index.js"
import type { Optional } from "@telefrek/core/type/utils"
import { Readable } from "stream"
import { MediaType, TopLevelMediaTypes, parseMediaType } from "./content.js"
import { HttpBody, HttpHeaders, StringOrArray } from "./index.js"

/**
 * The content type header
 */
export const CONTENT_TYPE_HEADER = "content-type"

/**
 * Try to extract the content type from the given headers
 * @param headers The {@link HttpHeaders} to examine
 * @returns The content type header or undefined
 */
export function getContentType(headers: HttpHeaders): Optional<MediaType> {
  let value: Optional<StringOrArray>

  // Fast path is that we have it already lowercase
  if (headers.has(CONTENT_TYPE_HEADER)) {
    value = headers.get(CONTENT_TYPE_HEADER)
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
  application: async (body: HttpBody) => {
    switch (body.mediaType?.subType ?? "") {
      case "json":
        await JSON_CONTENT_PARSER(body)
        break
      default: // Do nothing
        break
    }
  },
}

/**
 *
 * @param body The {@link HttpBody} to parse
 */
export const JSON_CONTENT_PARSER: ContentTypeParser = (
  body: HttpBody,
): MaybeAwaitable<void> => {
  // Verify we have a body
  if (body.contents) {
    const readableStream = body.contents
    const encoding =
      (body.mediaType?.parameters.get("charset") as BufferEncoding) ?? "utf-8"

    // Setup the reader
    const bodyReader = async function* () {
      yield await new Promise((resolve, reject) => {
        let bodyStr = ""
        const readBody = (chunk: string | Buffer) => {
          bodyStr +=
            typeof chunk === "string" ? chunk : chunk.toString(encoding)
        }
        readableStream
          .on("data", readBody)
          .once("end", () => {
            readableStream.off("data", readBody)
            resolve(JSON.parse(bodyStr))
          })
          .once("error", (err) => {
            readableStream.off("data", readBody)
            reject(err)
          })
      })
    }

    body.contents = Readable.from(bodyReader())
  }
}
