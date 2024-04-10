/**
 * Represents valid MediaType values including parameters
 */
export const MEDIA_TYPE_REGEX =
  /^(application|text|image|audio|video|model|font|multipart|message)\/(vnd\.|prs\.|x\.)?([-\w.]+)(\+[-\w]+)?(;.*)?$/

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
  toString(): string
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
