
/**
 * Represents valid MediaType values including parameters
 */
export const MEDIA_TYPE_REGEX = /^(application|text|image|audio|video|multipart|message)\/([-\w.]+)(\+[-\w.]+)?((;\s*[-\w]+=[-\w.]+)*)?$/

/**
 * The official composite types
 */
export type CompositeMediaTypes = "multipart" | "message"

/**
 * The simple and composite type set for all top level MediaTypes
 */
export type TopLevelMediaTypes = "application" | "text" | "image" | "audio" | "video" | CompositeMediaTypes

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
                subType: typeInfo[2],
                suffix: typeInfo[3] ? typeInfo[3].slice(1) : undefined,
                parameters: new Map((typeInfo[4] ?? "").split(';').filter(p => p).map(p => <[string, string]>p.trim().split('=')))
            }
        }
    }
    return
}

/**
 * Represents a MediaType (alternatively MimeType)
 * 
 * {@link https://www.rfc-editor.org/rfc/rfc2046.html}
 */
export interface MediaType {
    type: TopLevelMediaTypes
    subType?: string
    suffix?: string
    parameters: Map<string, string>
}

export interface CompositeMediaType extends MediaType {
    type: CompositeMediaTypes
}

export class MultipartMediaType implements CompositeMediaType {
    readonly type: CompositeMediaTypes = "multipart"
    readonly parameters: Map<string, string> = new Map()
}

export class MessageMediaType implements CompositeMediaType {
    readonly type: CompositeMediaTypes = "message"
    readonly parameters: Map<string, string> = new Map()
}