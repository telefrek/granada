/**
 * Represents valid MediaType values including parameters
 */
export declare const MEDIA_TYPE_REGEX: RegExp;
/**
 * The official composite types
 */
export type CompositeMediaTypes = "multipart" | "message";
/**
 * The simple and composite type set for all top level MediaTypes
 */
export type TopLevelMediaTypes = "application" | "text" | "image" | "audio" | "video" | "model" | "font" | CompositeMediaTypes;
/**
 * Supported media tree types
 */
export type MediaTreeTypes = "vnd" | "prs" | "x";
/**
 * Attempts to validate and parse the media type
 *
 * @param mediaType The string to parse
 * @returns A valid {@link MediaType} or undefined
 */
export declare function parseMediaType(mediaType: string): MediaType | undefined;
export declare function mediaTypeToString(media: MediaType): string;
/**
 * Represents a MediaType (alternatively MimeType)
 *
 * {@link https://www.rfc-editor.org/rfc/rfc2046.html}
 */
export interface MediaType {
    type: TopLevelMediaTypes;
    tree?: MediaTreeTypes;
    subType?: string;
    suffix?: string;
    /** Note it's up to the type implementation to verify the parameters after parsing */
    parameters: Map<string, string>;
    toString(): string;
}
/**
 * Handling composite media types with special handling
 */
export interface CompositeMediaType extends MediaType {
    type: CompositeMediaTypes;
}
/**
 * Represents multipart content types
 */
export declare class MultipartMediaType implements CompositeMediaType {
    readonly type: CompositeMediaTypes;
    readonly parameters: Map<string, string>;
}
/**
 * Represents message content types
 */
export declare class MessageMediaType implements CompositeMediaType {
    readonly type: CompositeMediaTypes;
    readonly parameters: Map<string, string>;
}
