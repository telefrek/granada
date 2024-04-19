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
} from "../index.js"
import { fileToMediaType } from "../media.js"
import {
  BaseHttpPipelineTransform,
  HttpPipelineStage,
  HttpPipelineTransform,
  type PipelineRequest,
} from "./pipeline.js"

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
  // Verify the flie exists
  if (!existsSync(options.baseDir)) {
    throw new Error(`${options.baseDir} does not exist`)
  }

  return new HostingTransform(options)
}

/**
 * Handles hosting files
 */
class HostingTransform extends BaseHttpPipelineTransform {
  protected override async processRequest(
    request: PipelineRequest,
  ): Promise<void> {
    if (
      request.method === HttpMethod.GET ||
      request.method === HttpMethod.HEAD
    ) {
      const target =
        request.path.original === "/" || request.path.original === ""
          ? this._defaultFile
          : request.path.original

      const check = join(this._sanitizedBaseDir, target)

      // See if we can find the file
      const filePath = resolve(check)

      if (filePath.startsWith(this._sanitizedBaseDir)) {
        if (existsSync(filePath)) {
          request.respond(
            request.method === HttpMethod.HEAD
              ? { status: HttpStatus.NO_CONTENT }
              : await createFileContentResponse(filePath),
          )
        }
      } else if (filePath !== check) {
        this._logger.error(
          `Attempt to traverse file system detected: ${request.path.original}`,
        )

        // Someone is doing something shady, stop it here
        request.respond({
          status: HttpStatus.NOT_FOUND,
        })
      }
    }
  }

  private _sanitizedBaseDir: string
  private _defaultFile: string

  constructor(options: HostingOptions) {
    super(HttpPipelineStage.ROUTING)

    // Sanitize our base directory
    this._sanitizedBaseDir = resolve(options.baseDir)

    // Set the default file
    this._defaultFile = options.defaultFile ?? "index.html"
  }
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
