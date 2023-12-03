/**
 * Expose the ability to host a folder on a given path
 */

import { createReadStream, existsSync } from "fs";
import { lookup } from "mime";
import { join, resolve } from "path";
import {
  FileContentResponse,
  HttpMethod,
  HttpRequest,
  HttpResponse,
  HttpStatus,
  emptyHeaders,
} from "..";
import { parseMediaType } from "../content";
import { HttpPipelineTransform } from "../pipeline";

/**
 * Create a {@link HttpPipelineTransform} for hosting a folder
 *
 * @param baseDir The directory to host
 * @param defaultFile The file to send if requesting `/` (default is `index.html`)
 * @returns A new {@link HttpPipelineTransform}
 */
export function hostFolder(
  baseDir: string,
  defaultFile = "index.html"
): HttpPipelineTransform {
  if (!existsSync(baseDir)) {
    throw new Error(`${baseDir} does not exist`);
  }

  const sanitizedBaseDir = resolve(baseDir);
  return (requests) =>
    requests.pipeThrough(new PathTransform(sanitizedBaseDir, defaultFile));
}

export function createFileContentResponse(
  filePath: string
): FileContentResponse | HttpResponse {
  if (!existsSync(filePath)) {
    return {
      status: HttpStatus.NOT_FOUND,
      headers: emptyHeaders(),
    };
  }

  // Calculate the media type
  const mediaType = parseMediaType(lookup(filePath));

  // Ensure encoding is set
  if (!mediaType?.parameters.has("charset")) {
    mediaType?.parameters.set("charset", "utf-8");
  }

  // Send back the file content response
  return {
    status: HttpStatus.OK,
    headers: emptyHeaders(),
    filePath,
    body: {
      contents: createReadStream(filePath, "utf-8"),
      mediaType: parseMediaType(lookup(filePath))!,
    },
  };
}

/**
 * Transform requested items to the given path
 */
class PathTransform extends TransformStream<HttpRequest, HttpRequest> {
  #baseDir: string;

  /**
   * Create the {@link PathTransform} for the given directory
   * @param baseDir The base directory to serve from
   * @param defaultFile The default file name to use in place of `/`
   */
  constructor(baseDir: string, defaultFile: string) {
    super({
      transform: (request, controller) => {
        // Only serve GET requests
        if (request.method === HttpMethod.GET) {
          const target =
            request.path.original === "/" || request.path.original === ""
              ? defaultFile
              : request.path.original;

          // See if we can find the file
          const filePath = resolve(join(baseDir, target));

          // Ensure we didn't try to traverse out...
          if (filePath.startsWith(baseDir)) {
            request.respond(createFileContentResponse(filePath));
          } else {
            // TODO: Audit this...
            request.respond({
              status: HttpStatus.NOT_FOUND,
              headers: emptyHeaders(),
            });
          }
        } else {
          controller.enqueue(request);
        }
      },
    });

    this.#baseDir = baseDir;
  }
}
