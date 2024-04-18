/**
 * Expose the ability to host a folder on a given path
 */

import { type LoggerOptions } from "@telefrek/core/logging"
import { createReadStream, existsSync } from "fs"
import { join, resolve } from "path"
import {
  FileContentResponse,
  HttpMethod,
  HttpResponse,
  HttpStatus,
  emptyHeaders,
  type HttpHandler,
  type HttpRequest,
} from "../index.js"
import { fileToMediaType } from "../media.js"
import { HttpPipelineTransform, RoutingTransform } from "./pipeline.js"
import { createRouter } from "./routing.js"

/**
 * Options for configuring hosting
 */
export interface HostingOptions extends LoggerOptions {
  /** The base directory for files to come from */
  baseDir: string
  /** The default file to serve (index.html if unspecified) */
  defaultFile?: string
  /** The path to host at (default is '/') */
  urlPath?: string
}

/**
 * Create a {@link HttpPipelineTransform} for hosting a folder
 *
 * @param options The {@link HostingOptions} for this operation
 *
 * @returns A new {@link HttpPipelineTransform}
 */
export function hostFolder(options: HostingOptions): HttpPipelineTransform {
  if (!existsSync(options.baseDir)) {
    throw new Error(`${options.baseDir} does not exist`)
  }

  // Sanitize our base directory
  const sanitizedBaseDir = resolve(options.baseDir)

  // Set the default file
  const defaultFile = options.defaultFile ?? "index.html"

  // Create a router for handling requests
  const router = createRouter()

  //
  const handler: HttpHandler = async (request: HttpRequest) => {
    const target =
      request.path.original === "/" || request.path.original === ""
        ? defaultFile
        : request.path.original

    // See if we can find the file
    const filePath = resolve(join(sanitizedBaseDir, target))

    // Ensure we didn't try to traverse out...
    if (filePath.startsWith(sanitizedBaseDir) && existsSync(filePath)) {
      if (request.method === HttpMethod.GET) {
        request.respond(await createFileContentResponse(filePath))
      } else {
        // TODO: Probably should add some headers with useful contents
        request.respond({ status: HttpStatus.OK })
      }
    } else {
      request.respond({
        status: HttpStatus.NOT_FOUND,
        headers: emptyHeaders(),
      })
    }
  }

  router.addHandler(options.urlPath ?? "/", handler, HttpMethod.GET)
  router.addHandler(options.urlPath ?? "/", handler, HttpMethod.HEAD)

  return new RoutingTransform(router)
}

async function createFileContentResponse(
  filePath: string,
): Promise<FileContentResponse | HttpResponse> {
  // Calculate the media type
  const mediaType = await fileToMediaType(filePath)

  // Ensure encoding is set
  if (!mediaType?.parameters.has("charset")) {
    mediaType?.parameters.set("charset", "utf-8")
  }

  // Send back the file content response
  return {
    status: HttpStatus.OK,
    filePath,
    body: {
      contents: createReadStream(filePath, "utf-8"),
      mediaType,
    },
  }
}
