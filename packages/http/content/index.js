"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageMediaType = exports.MultipartMediaType = exports.mediaTypeToString = exports.parseMediaType = exports.MEDIA_TYPE_REGEX = void 0;
/**
 * Represents valid MediaType values including parameters
 */
exports.MEDIA_TYPE_REGEX = /^(application|text|image|audio|video|model|font|multipart|message)\/(vnd\.|prs\.|x\.)?([-\w.]+)(\+[-\w]+)?(;.*)?$/;
/**
 * Attempts to validate and parse the media type
 *
 * @param mediaType The string to parse
 * @returns A valid {@link MediaType} or undefined
 */
function parseMediaType(mediaType) {
    // Verify we didn't get null
    if (mediaType) {
        // Try to parse the media type
        const typeInfo = exports.MEDIA_TYPE_REGEX.exec(mediaType);
        if (typeInfo) {
            return {
                type: typeInfo[1],
                tree: typeInfo[2]
                    ? typeInfo[2].slice(0, -1)
                    : undefined,
                subType: typeInfo[3],
                suffix: typeInfo[4] ? typeInfo[4].slice(1) : undefined,
                parameters: new Map((typeInfo[5] ?? "")
                    .split(";")
                    .filter((p) => p)
                    .map((p) => p
                    .trim()
                    .split("=")
                    .map((s) => s.trim()))),
                toString() {
                    return mediaTypeToString(this);
                },
            };
        }
    }
    return;
}
exports.parseMediaType = parseMediaType;
function mediaTypeToString(media) {
    if (media.subType ?? media.tree) {
        return `${media.type}/${media.tree ? `${media.tree}.` : ""}${media.subType}${media.suffix ? `+${media.suffix}` : ""}${media.parameters.size > 0
            ? Array.from(media.parameters.keys())
                .map((k) => `;${k}=${media.parameters.get(k)}`)
                .join("")
            : ""}`;
    }
    else {
        return `${media.type}${media.parameters.size > 0
            ? Array.from(media.parameters.keys())
                .map((k) => `;${k}=${media.parameters.get(k)}`)
                .join("")
            : ""}`;
    }
}
exports.mediaTypeToString = mediaTypeToString;
/**
 * Represents multipart content types
 */
class MultipartMediaType {
    type = "multipart";
    parameters = new Map();
}
exports.MultipartMediaType = MultipartMediaType;
/**
 * Represents message content types
 */
class MessageMediaType {
    type = "message";
    parameters = new Map();
}
exports.MessageMediaType = MessageMediaType;
