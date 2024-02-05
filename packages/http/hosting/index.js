"use strict";
/**
 * Expose the ability to host a folder on a given path
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hostFolder = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const __1 = require("..");
const media_1 = require("../content/media");
/**
 * Create a {@link HttpPipelineTransform} for hosting a folder
 *
 * @param baseDir The directory to host
 * @param defaultFile The file to send if requesting `/` (default is `index.html`)
 * @returns A new {@link HttpPipelineTransform}
 */
function hostFolder(baseDir, defaultFile = "index.html") {
    if (!(0, fs_1.existsSync)(baseDir)) {
        throw new Error(`${baseDir} does not exist`);
    }
    // Sanitize our base directory
    const sanitizedBaseDir = (0, path_1.resolve)(baseDir);
    // Return the transform
    return async (request) => {
        // Only serve GET requests
        if (request.method === __1.HttpMethod.GET) {
            const target = request.path.original === "/" || request.path.original === ""
                ? defaultFile
                : request.path.original;
            // See if we can find the file
            const filePath = (0, path_1.resolve)((0, path_1.join)(sanitizedBaseDir, target));
            // Ensure we didn't try to traverse out...
            if (filePath.startsWith(sanitizedBaseDir)) {
                request.respond(await createFileContentResponse(filePath));
            }
            else {
                request.respond({
                    status: __1.HttpStatus.NOT_FOUND,
                    headers: (0, __1.emptyHeaders)(),
                });
            }
            return undefined;
        }
        // Let someone else handle it
        return request;
    };
}
exports.hostFolder = hostFolder;
async function createFileContentResponse(filePath) {
    if (!(0, fs_1.existsSync)(filePath)) {
        return {
            status: __1.HttpStatus.NOT_FOUND,
            headers: (0, __1.emptyHeaders)(),
        };
    }
    // Calculate the media type
    const mediaType = await (0, media_1.fileToMediaType)(filePath);
    // Ensure encoding is set
    if (!mediaType?.parameters.has("charset")) {
        mediaType?.parameters.set("charset", "utf-8");
    }
    // Send back the file content response
    return {
        status: __1.HttpStatus.OK,
        headers: (0, __1.emptyHeaders)(),
        filePath,
        body: {
            contents: (0, fs_1.createReadStream)(filePath, "utf-8"),
            mediaType,
        },
    };
}
