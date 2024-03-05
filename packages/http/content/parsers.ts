/**
 * Package that handles content parsing
 */

import { MaybeAwaitable } from "@telefrek/core"
import { Readable } from "stream"
import { MediaType, TopLevelMediaTypes, parseMediaType } from "."
import { HttpBody, HttpHeaders, HttpRequest, StringOrArray } from ".."
import { HttpPipelineTransform } from "../pipeline"

/**
 * The content type header
 */
export const CONTENT_TYPE_HEADER = "content-type"

/**
 * Try to extract the content type from the given headers
 * @param headers The {@link HttpHeaders} to examine
 * @returns The content type header or undefined
 */
export function getContentType(headers: HttpHeaders): MediaType | undefined {
  let value: StringOrArray | undefined

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

/**
 * {@link HttpPipelineTransform} for handling content parsing
 *
 * @param readable The {@link ReadableStream} of {@link HttpRequest}
 * @returns A {@link ReadableStream} of {@link HttpRequest} where body contents are parsed
 */
export const CONTENT_PARSING_TRANSFORM: HttpPipelineTransform = async (
  request: HttpRequest,
) => {
  // Check if there is a body and if so process the contents
  if (request.body) {
    // Parse out the media type
    request.body.mediaType = getContentType(request.headers)

    // If we know how to decode this, go ahead
    if (request.body.mediaType) {
      // Get the parser
      const parser = CONTENT_PARSERS[request.body.mediaType.type]

      // If found, let it do it's thing
      if (parser) {
        await parser(request.body)
      }
    }
  }

  return request
}
