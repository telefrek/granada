"use strict";
/**
 * Package that handles content parsing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTENT_PARSING_TRANSFORM = exports.JSON_CONTENT_PARSER = exports.CONTENT_PARSERS = exports.getContentType = exports.CONTENT_TYPE_HEADER = void 0;
const stream_1 = require("stream");
const _1 = require(".");
/**
 * The content type header
 */
exports.CONTENT_TYPE_HEADER = "content-type";
/**
 * Try to extract the content type from the given headers
 * @param headers The {@link HttpHeaders} to examine
 * @returns The content type header or undefined
 */
function getContentType(headers) {
    let value;
    // Fast path is that we have it already lowercase
    if (headers.has(exports.CONTENT_TYPE_HEADER)) {
        value = headers.get(exports.CONTENT_TYPE_HEADER);
    }
    // If undefined, may be that we got a headers collection without lowercase somehow
    if (value === undefined) {
        // Iterate the headers trying to find a match
        for (const header of headers.keys()) {
            if (header.toLowerCase() === exports.CONTENT_TYPE_HEADER) {
                value = headers.get(header);
                break;
            }
        }
    }
    // Return the value if it was found
    return typeof value === "string"
        ? (0, _1.parseMediaType)(value)
        : typeof value === "object" && Array.isArray(value)
            ? (0, _1.parseMediaType)(value[0])
            : undefined;
}
exports.getContentType = getContentType;
/**
 * The set of content parsers
 */
exports.CONTENT_PARSERS = {
    application: async (body) => {
        switch (body.mediaType?.subType ?? "") {
            case "json":
                await (0, exports.JSON_CONTENT_PARSER)(body);
                break;
            default: // Do nothing
                break;
        }
    },
};
/**
 *
 * @param body The {@link HttpBody} to parse
 */
const JSON_CONTENT_PARSER = (body) => {
    // Verify we have a body
    if (body.contents) {
        const readableStream = body.contents;
        const encoding = body.mediaType?.parameters.get("charset") ?? "utf-8";
        // Setup the reader
        const bodyReader = async function* () {
            yield await new Promise((resolve, reject) => {
                let bodyStr = "";
                const readBody = (chunk) => {
                    bodyStr +=
                        typeof chunk === "string" ? chunk : chunk.toString(encoding);
                };
                readableStream
                    .on("data", readBody)
                    .once("end", () => {
                    readableStream.off("data", readBody);
                    resolve(JSON.parse(bodyStr));
                })
                    .once("error", (err) => {
                    readableStream.off("data", readBody);
                    reject(err);
                });
            });
        };
        body.contents = stream_1.Readable.from(bodyReader());
    }
};
exports.JSON_CONTENT_PARSER = JSON_CONTENT_PARSER;
/**
 * {@link HttpPipelineTransform} for handling content parsing
 *
 * @param readable The {@link ReadableStream} of {@link HttpRequest}
 * @returns A {@link ReadableStream} of {@link HttpRequest} where body contents are parsed
 */
const CONTENT_PARSING_TRANSFORM = async (request) => {
    // Check if there is a body and if so process the contents
    if (request.body) {
        // Parse out the media type
        request.body.mediaType = getContentType(request.headers);
        // If we know how to decode this, go ahead
        if (request.body.mediaType) {
            // Get the parser
            const parser = exports.CONTENT_PARSERS[request.body.mediaType.type];
            // If found, let it do it's thing
            if (parser) {
                await parser(request.body);
            }
        }
    }
    return request;
};
exports.CONTENT_PARSING_TRANSFORM = CONTENT_PARSING_TRANSFORM;
