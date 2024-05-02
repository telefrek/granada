/**
 * Pipeline operations to help with hosting
 */

/**
 * Expose the ability to host a folder on a given path
 */

import { fatal, type LoggerOptions } from "@telefrek/core/logging.js"
import { existsSync } from "fs"
import { join, resolve } from "path"
import { isInRequestPhase, type HttpOperationContext } from "../context.js"
import { HttpMethod, HttpStatusCode } from "../index.js"
import { createFileContentResponse } from "../media.js"
import { type HttpTransform } from "../pipeline.js"
import { emptyHeaders } from "../utils.js"

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
export function hostFolder(options: HostingOptions): HttpTransform {
  // Verify the flie exists
  if (!existsSync(options.baseDir)) {
    throw new Error(`${options.baseDir} does not exist`)
  }

  // Sanitize our base directory
  const sanitizedBaseDir = resolve(options.baseDir)

  // Set the default file
  const defaultFile = options.defaultFile ?? "index.html"

  return async (
    context: HttpOperationContext,
  ): Promise<HttpOperationContext> => {
    if (isInRequestPhase(context)) {
      const request = context.operation.request
      if (
        request.method === HttpMethod.GET ||
        request.method === HttpMethod.HEAD
      ) {
        const target =
          request.path.original === "/" || request.path.original === ""
            ? defaultFile
            : request.path.original

        const check = join(sanitizedBaseDir, target)

        // See if we can find the file
        const filePath = resolve(check)

        if (filePath.startsWith(sanitizedBaseDir)) {
          if (existsSync(filePath)) {
            context.response =
              request.method === HttpMethod.HEAD
                ? {
                    status: { code: HttpStatusCode.NO_CONTENT },
                    headers: emptyHeaders(),
                  }
                : await createFileContentResponse(filePath)
          }
        } else if (filePath !== check) {
          fatal(
            `Attempt to traverse file system detected: ${request.path.original}`,
          )

          // Someone is doing something shady, stop it here
          context.response = {
            status: {
              code: HttpStatusCode.FORBIDDEN,
            },
            headers: emptyHeaders(),
          }
        }
      }
    }

    return context
  }
}
