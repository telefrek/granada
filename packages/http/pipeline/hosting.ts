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
import {
  HttpPipelineStage,
  type HttpPipelineStageTransform,
} from "../pipeline.js"
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
export function hostFolder(
  options: HostingOptions,
): HttpPipelineStageTransform {
  // Verify the flie exists
  if (!existsSync(options.baseDir)) {
    throw new Error(`${options.baseDir} does not exist`)
  }

  // Sanitize our base directory
  const sanitizedBaseDir = resolve(options.baseDir)

  // Set the default file
  const defaultFile = options.defaultFile ?? "index.html"

  return {
    transform: async (
      context: HttpOperationContext,
    ): Promise<HttpOperationContext> => {
      if (isInRequestPhase(context)) {
        if (
          context.operation.request.method === HttpMethod.GET ||
          context.operation.request.method === HttpMethod.HEAD
        ) {
          const target =
            context.operation.request.path.original === "/" ||
            context.operation.request.path.original === ""
              ? defaultFile
              : context.operation.request.path.original

          const check = join(sanitizedBaseDir, target)

          // See if we can find the file
          const filePath = resolve(check)

          if (filePath.startsWith(sanitizedBaseDir)) {
            if (existsSync(filePath)) {
              // Set the handler
              context.handler = async (request) => {
                return request.method === HttpMethod.HEAD
                  ? {
                      status: { code: HttpStatusCode.NO_CONTENT },
                      headers: emptyHeaders(),
                    }
                  : await createFileContentResponse(filePath)
              }
            }
          } else if (filePath !== check) {
            fatal(
              `Attempt to traverse file system detected: ${context.operation.request.path.original}`,
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
    },
    name: "WebHosting",
    stage: HttpPipelineStage.ROUTING,
  }
}
