/**
 * Expose the ability to host a folder on a given path
 */

import { createReadStream, existsSync } from "fs"
import { join, resolve } from "path"
import {
  FileContentResponse,
  HttpMethod,
  HttpResponse,
  HttpStatus,
  emptyHeaders,
  type HttpRequest,
} from "../index.js"
import { fileToMediaType } from "../media.js"
import { HttpPipelineTransform } from "./pipeline.js"

/**
 * Create a {@link HttpPipelineTransform} for hosting a folder
 *
 * @param baseDir The directory to host
 * @param defaultFile The file to send if requesting `/` (default is `index.html`)
 * @returns A new {@link HttpPipelineTransform}
 */
export function hostFolder(
  baseDir: string,
  defaultFile = "index.html",
): HttpPipelineTransform {
  if (!existsSync(baseDir)) {
    throw new Error(`${baseDir} does not exist`)
  }

  // Sanitize our base directory
  const sanitizedBaseDir = resolve(baseDir)

  // Return the transform
  return async (request: HttpRequest) => {
    // Only serve GET requests
    if (request.method === HttpMethod.GET) {
      const target =
        request.path.original === "/" || request.path.original === ""
          ? defaultFile
          : request.path.original

      // See if we can find the file
      const filePath = resolve(join(sanitizedBaseDir, target))

      // Ensure we didn't try to traverse out...
      if (filePath.startsWith(sanitizedBaseDir)) {
        request.respond(await createFileContentResponse(filePath))
      } else {
        request.respond({
          status: HttpStatus.NOT_FOUND,
          headers: emptyHeaders(),
        })
      }

      return undefined
    }

    // Let someone else handle it
    return request
  }
}

async function createFileContentResponse(
  filePath: string,
): Promise<FileContentResponse | HttpResponse> {
  if (!existsSync(filePath)) {
    return {
      status: HttpStatus.NOT_FOUND,
      headers: emptyHeaders(),
    }
  }

  // Calculate the media type
  const mediaType = await fileToMediaType(filePath)

  // Ensure encoding is set
  if (!mediaType?.parameters.has("charset")) {
    mediaType?.parameters.set("charset", "utf-8")
  }

  // Send back the file content response
  return {
    status: HttpStatus.OK,
    headers: emptyHeaders(),
    filePath,
    body: {
      contents: createReadStream(filePath, "utf-8"),
      mediaType,
    },
  }
}
