import { isEmpty } from "@telefrek/core"
import { Readable } from "stream"
import { HttpHeaders, StringOrArray } from "../"
import { HttpPipelineTransform } from "../pipeline"

/**
 * Represents valid MediaType values including parameters
 */
export const MEDIA_TYPE_REGEX =
  /^(application|text|image|audio|video|model|font|multipart|message)\/(vnd\.|prs\.|x\.)?([-\w.]+)(\+[-\w]+)?(;.*)?$/

/**
 * The content type header
 */
export const CONTENT_TYPE_HEADER = "content-type"

/**
 * {@link HttpPipelineTransform} for handling content parsing
 *
 * @param readable The {@link ReadableStream} of {@link HttpRequest}
 * @returns A {@link ReadableStream} of {@link HttpRequest} where body contents are parsed
 */
export const CONTENT_PARSING_TRANSFORM: HttpPipelineTransform = (request) => {
  // Check if there is a body and if so process the contents
  if (request.body) {
    // Parse out the media type
    request.body.mediaType = getContentType(request.headers)

    // If we know how to decode this, go ahead
    if (request.body.mediaType) {
      // TODO: We should be able to inject a media type mapper for streams...
      if (
        isJson(request.body.mediaType) &&
        request.body.contents instanceof Readable &&
        !request.body.contents.readableEnded
      ) {
        const readableStream = request.body.contents
        const encoding =
          (request.body.mediaType.parameters.get(
            "charset",
          ) as BufferEncoding) ?? "utf-8"

        const bodyReader = async function* () {
          yield await new Promise((resolve, reject) => {
            let bodyStr = ""
            readableStream
              .on("data", (chunk: string | Buffer) => {
                bodyStr +=
                  typeof chunk === "string" ? chunk : chunk.toString(encoding)
              })
              .on("end", () => {
                resolve(JSON.parse(bodyStr))
              })
              .on("error", (err) => {
                reject(err)
              })
          })
        }

        request.body.contents = Readable.from(bodyReader())
      } else {
        console.log("no body reading today...")
      }
    }
  }

  return request
}

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

/**
 * Attempts to validate and parse the media type
 *
 * @param mediaType The string to parse
 * @returns A valid {@link MediaType} or undefined
 */
export function parseMediaType(mediaType: string): MediaType | undefined {
  // Verify we didn't get null
  if (mediaType) {
    // Try to parse the media type
    const typeInfo = MEDIA_TYPE_REGEX.exec(mediaType)
    if (typeInfo) {
      return {
        type: typeInfo[1] as TopLevelMediaTypes,
        tree: typeInfo[2]
          ? (typeInfo[2].slice(0, -1) as MediaTreeTypes)
          : undefined,
        subType: typeInfo[3],
        suffix: typeInfo[4] ? typeInfo[4].slice(1) : undefined,
        parameters: new Map(
          (typeInfo[5] ?? "")
            .split(";")
            .filter((p) => p)
            .map(
              (p) =>
                p
                  .trim()
                  .split("=")
                  .map((s) => s.trim()) as [string, string],
            ),
        ),
      }
    }
  }
  return
}

export function mediaTypeToString(media: MediaType): string {
  if (media.subType ?? media.tree) {
    return `${media.type}/${media.tree ? `${media.tree}.` : ""}${
      media.subType
    }${media.suffix ? `+${media.suffix}` : ""}${
      media.parameters.size > 0
        ? Array.from(media.parameters.keys())
            .map((k) => `;${k}=${media.parameters.get(k)}`)
            .join("")
        : ""
    }`
  } else {
    return `${media.type}${
      media.parameters.size > 0
        ? Array.from(media.parameters.keys())
            .map((k) => `;${k}=${media.parameters.get(k)}`)
            .join("")
        : ""
    }`
  }
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
}

/**
 * Check to see if the media type is JSON encoded
 *
 * @param media The {@link MediaType} to test for JSON
 * @returns True if the contents are JSON formatted
 */
export function isJson(media: MediaType): boolean {
  // Simple check for JSON, need to extend this out more
  if (media.type === "application" && media.subType === "json") {
    return true
  }

  return false
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

const EXTENSION_MAP: Partial<Record<string, MediaType>> = {}

/* eslint-disable @typescript-eslint/no-unsafe-argument */
export const fileToMediaType = async (
  filename: string,
): Promise<MediaType | undefined> => {
  // Load the map the first time through
  if (isEmpty(EXTENSION_MAP)) {
    const mime = await import("./mime-extension.js")
    for (const [key, value] of Object.entries(mime.MIME_MAP)) {
      const type = parseMediaType(value)
      if (type) {
        EXTENSION_MAP[key] = type
      }
    }
  }

  console.log(
    `Checking ${filename} [${filename
      .replace(/^.*[\\.\\/\\]/, "")
      .toLowerCase()}]`,
  )

  return EXTENSION_MAP[filename.replace(/^.*[\\.\\/\\]/, "").toLowerCase()]
}

/* eslint-enable @typescript-eslint/no-unsafe-argument */
