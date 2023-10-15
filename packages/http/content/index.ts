import { Readable } from "stream"
import { HttpBodyProvider, NO_BODY } from "../core"

/**
 * Represents valid MediaType values including parameters
 */
export const MEDIA_TYPE_REGEX = /^(application|text|image|audio|video|model|font|multipart|message)\/(vnd\.|prs\.|x\.)?([-\w.]+)(\+[-\w]+)?(;.*)?$/

/**
 * The official composite types
 */
export type CompositeMediaTypes = "multipart" | "message"

/**
 * The simple and composite type set for all top level MediaTypes
 */
export type TopLevelMediaTypes = "application" | "text" | "image" | "audio" | "video" | "model" | "font" | CompositeMediaTypes

/**
 * Supported media tree types
 */
export type MediaTreeTypes = "vnd" | "prs" | "x"

/**
 * Parses the contents with the given type out of a buffer.
 * 
 * @param type The {@link MediaType} being parsed
 * @param buffer The {@link Readable} that has the contents
 * @returns A {@link HttpBodyProvider} that will translate the buffer into an object
 */
export function parseContents<T>(type: MediaType, buffer: Readable): HttpBodyProvider<T> {

    // Ensure it's not ended already
    if (buffer.readableEnded) {
        return NO_BODY()
    }

    // Check for a supported media types
    if (isJson(type)) {
        // TODO: Need to support streaming JSON
        return () => new Promise((resolve, reject) => {

            let str = ""

            // This is NOT efficient but works for stubbing out the work
            // TODO: Clean this mess up
            const encoding: BufferEncoding = type.parameters?.get('charset') as BufferEncoding ?? "utf-8"
            buffer.on('data', (data: string | Buffer) => {
                str += typeof data === "string" ? data : data.toString(encoding)
            }).on('end', () => {
                const j: unknown = JSON.parse(str)
                if (typeof j === "undefined")
                    resolve(undefined)
                else if (typeof j === "object")
                    resolve(Array.isArray(j) ? j as T[] : j as T)
            }).on('error', (err) => {
                reject(err)
            })
        })
    }

    // Return a promise for unsupported media type handling
    return () => {
        return Promise.reject(new Error(`Unsupported media type: ${type.type}`))
    }
}

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
                tree: typeInfo[2] ? typeInfo[2].slice(0, -1) as MediaTreeTypes : undefined,
                subType: typeInfo[3],
                suffix: typeInfo[4] ? typeInfo[4].slice(1) : undefined,
                parameters: new Map((typeInfo[5] ?? "").split(';').filter(p => p).map(p => (p.trim().split('=').map(s => s.trim()) as [string, string])))
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
    if (media.type === "application" &&
        media.subType === "json") {
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