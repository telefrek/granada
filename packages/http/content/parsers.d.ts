/**
 * Package that handles content parsing
 */
import { MaybeAwaitable } from "@telefrek/core";
import { MediaType, TopLevelMediaTypes } from ".";
import { HttpBody, HttpHeaders } from "..";
import { HttpPipelineTransform } from "../pipeline";
/**
 * The content type header
 */
export declare const CONTENT_TYPE_HEADER = "content-type";
/**
 * Try to extract the content type from the given headers
 * @param headers The {@link HttpHeaders} to examine
 * @returns The content type header or undefined
 */
export declare function getContentType(headers: HttpHeaders): MediaType | undefined;
export type ContentTypeParser = (body: HttpBody) => MaybeAwaitable<void>;
/**
 * The set of content parsers
 */
export declare const CONTENT_PARSERS: Partial<Record<TopLevelMediaTypes, ContentTypeParser>>;
/**
 *
 * @param body The {@link HttpBody} to parse
 */
export declare const JSON_CONTENT_PARSER: ContentTypeParser;
/**
 * {@link HttpPipelineTransform} for handling content parsing
 *
 * @param readable The {@link ReadableStream} of {@link HttpRequest}
 * @returns A {@link ReadableStream} of {@link HttpRequest} where body contents are parsed
 */
export declare const CONTENT_PARSING_TRANSFORM: HttpPipelineTransform;
