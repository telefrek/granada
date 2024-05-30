/**
 * Pipeline operations to help with hosting
 */

/**
 * Expose the ability to host a folder on a given path
 */

import { fatal, type LoggerOptions } from "@telefrek/core/logging.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import { existsSync } from "fs"
import { join, resolve } from "path"
import { HttpMethod, type HttpHandler } from "../index.js"
import { createFileContentResponse } from "../media.js"
import { HttpPipelineStage, type HttpPipelineRouter } from "../pipeline.js"
import type { LookupRequest, RouteInfo, Router } from "../routing.js"
import { forbidden, noContents } from "../utils.js"

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

class HostingRouter implements Router {
  private _baseDir: string
  private _defaultFile: string

  constructor(baseDir: string, defaultFile: string) {
    this._baseDir = baseDir
    this._defaultFile = defaultFile
  }

  lookup(request: LookupRequest): Optional<RouteInfo> {
    // Only GET and HEAD are supported
    if (
      request.method === HttpMethod.GET ||
      request.method === HttpMethod.HEAD
    ) {
      const target =
        request.path === "/" || request.path === ""
          ? this._defaultFile
          : request.path

      const check = join(this._baseDir, target)
      const filePath = resolve(check)

      if (filePath.startsWith(this._baseDir)) {
        if (existsSync(filePath)) {
          return {
            handler: async (httpRequest) => {
              return httpRequest.method === HttpMethod.HEAD
                ? noContents()
                : await createFileContentResponse(filePath)
            },
            template: request.path,
            priority: 3, // Not the highest but should be higher than default since it affects rendering/client access
          }
        } else if (filePath !== check) {
          fatal(`Attempt to traverse file system detected: ${request.path}`)

          return {
            handler: (_) => forbidden(),
            template: request.path,
          }
        }
      }
    }

    return
  }

  addHandler(
    _template: string,
    _handler: HttpHandler,
    _method?: HttpMethod | undefined,
  ): void {
    throw new Error("Method not supported.")
  }

  addRouter(_template: string, _router: Router): void {
    throw new Error("Method not supported.")
  }
}

/**
 * Create a {@link HttpPipelineTransform} for hosting a folder
 *
 * @param options The {@link HostingOptions} for this operation
 *
 * @returns A new {@link HttpPipelineTransform}
 */
export function hostFolder(options: HostingOptions): HttpPipelineRouter {
  // Verify the flie exists
  if (!existsSync(options.baseDir)) {
    throw new Error(`${options.baseDir} does not exist`)
  }

  // Sanitize our base directory
  const sanitizedBaseDir = resolve(options.baseDir)

  // Set the default file
  const defaultFile = options.defaultFile ?? "index.html"

  return {
    router: new HostingRouter(sanitizedBaseDir, defaultFile),
    stage: HttpPipelineStage.ROUTING,
    transformName: "web.hosting",
    basePath: options.urlPath ?? "/",
  }
}
