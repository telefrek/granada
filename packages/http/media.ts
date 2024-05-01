/**
 * Package for handling media type operations
 */

import type { Optional } from "@telefrek/core/type/utils.js"
import { createReadStream, promises } from "fs"
import {
  CommonHttpHeaders,
  HttpStatusCode,
  type HttpHeaders,
  type HttpResponse,
  type MediaTreeTypes,
  type MediaType,
  type TopLevelMediaTypes,
} from "./index.js"
import { emptyHeaders } from "./utils.js"

/**
 * Represents valid MediaType values including parameters
 */
export const MEDIA_TYPE_REGEX =
  /^(application|text|image|audio|video|model|font|multipart|message)\/(vnd\.|prs\.|x\.)?([-\w.]+)(\+[-\w]+)?(;.*)?$/

/**
 * Common media types for fast access
 */
export const CommonMediaTypes = {
  HTML: parseMediaType("text/html")!,
  JSON: parseMediaType("application/json")!,
  OCTET: parseMediaType("application/octet-stream")!,
} as const

/**
 * Attempts to validate and parse the media type
 *
 * @param mediaType The string to parse
 * @returns An {@link Optional} valid {@link MediaType}
 */
export function parseMediaType(mediaType: string): Optional<MediaType> {
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
        toString() {
          return mediaTypeToString(this)
        },
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

let EXTENSION_MAP: Optional<Record<string, MediaType>>

/**
 * Attempts to map the file extension to a {@link MediaType}
 *
 * @param filename The file to extract a {@link MediaType} for
 * @returns The {@link MediaType} or undefined for the filename
 */
export const fileToMediaType = async (
  filename: string,
): Promise<Optional<MediaType>> => {
  // Load the map the first time through
  if (EXTENSION_MAP === undefined) {
    const entry = await import("./mimeTypes.json", { with: { type: "json" } })

    EXTENSION_MAP = {}
    for (const [key, value] of Object.entries(entry.default)) {
      const type = parseMediaType(value)
      if (type) {
        EXTENSION_MAP[key] = type
      }
    }
  }

  return EXTENSION_MAP[filename.replace(/^.*[\\.\\/\\]/, "").toLowerCase()]
}

/**
 * The content type header
 */
export const CONTENT_TYPE_HEADER = "content-type"
export const CONTENT_TYPE_HEADER_2 = "Content-Type"

/**
 * Try to extract the content type from the given headers
 *
 * @param headers The {@link HttpHeaders} to examine
 * @returns The content type header or undefined
 */
export function getMediaType(headers: HttpHeaders): Optional<MediaType> {
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

export async function createFileContentResponse(
  filePath: string,
): Promise<HttpResponse> {
  const headers = emptyHeaders()

  // Calculate the media type
  const mediaType = (await fileToMediaType(filePath)) ?? CommonMediaTypes.OCTET

  // Ensure encoding is set
  if (!mediaType.parameters.has("charset")) {
    mediaType.parameters.set("charset", "utf-8")
  }

  // Get the stats to report file size information
  const stats = await promises.stat(filePath, { bigint: true })
  headers.set(CommonHttpHeaders.ContentType, mediaType.toString())
  headers.set(CommonHttpHeaders.ContentLength, stats.size.toString())

  // Send back the file content response
  return {
    status: {
      code: HttpStatusCode.OK,
    },
    body: {
      contents: createReadStream(filePath, "utf-8"),
      mediaType,
    },
    headers,
  }
}
