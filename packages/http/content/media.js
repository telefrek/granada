"use strict";
/**
 * Package for handling media type operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileToMediaType = void 0;
const _1 = require(".");
let EXTENSION_MAP;
/**
 * Attempts to map the file extension to a {@link MediaType}
 *
 * @param filename The file to extract a {@link MediaType} for
 * @returns The {@link MediaType} or undefined for the filename
 */
const fileToMediaType = async (filename) => {
    // Load the map the first time through
    if (EXTENSION_MAP === undefined) {
        const entry = await import("./mimeTypes.json", { assert: { type: "json" } });
        EXTENSION_MAP = {};
        for (const [key, value] of Object.entries(entry.default)) {
            const type = (0, _1.parseMediaType)(value);
            if (type) {
                EXTENSION_MAP[key] = type;
            }
        }
    }
    return EXTENSION_MAP[filename.replace(/^.*[\\.\\/\\]/, "").toLowerCase()];
};
exports.fileToMediaType = fileToMediaType;
