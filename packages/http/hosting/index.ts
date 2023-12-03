/**
 * Expose the ability to host a folder on a given path
 */

import fs from "fs";
import mime from "mime";
import path from "path";
import { HttpMethod, HttpRequest, HttpStatus } from "..";
import { parseMediaType } from "../content";
import { HttpPipelineTransform } from "../pipeline";

export function hostFolder(
  baseDir: string,
  defaultFile = "index.html"
): HttpPipelineTransform {
  const sanitizedBaseDir = path.resolve(baseDir);
  return (requests) =>
    requests.pipeThrough(new PathTransform(sanitizedBaseDir, defaultFile));
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
        const target =
          request.path.original === "/" || request.path.original === ""
            ? defaultFile
            : request.path.original;

        // See if we can find the file
        const filePath = path.resolve(path.join(baseDir, target));

        // Ensure we didn't traverse out...
        if (
          request.method === HttpMethod.GET &&
          filePath.startsWith(baseDir) &&
          fs.existsSync(filePath)
        ) {
          request.respond({
            status: HttpStatus.OK,
            headers: new Map(),
            body: {
              contents: fs.createReadStream(filePath, "utf-8"),
              mediaType: parseMediaType(mime.lookup(filePath))!,
            },
          });
        } else {
          controller.enqueue(request);
        }
      },
    });

    this.#baseDir = baseDir;
  }
}
