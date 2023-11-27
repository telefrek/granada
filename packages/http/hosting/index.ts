/**
 * Expose the ability to host a folder on a given path
 */

import fs from "fs";
import mime from "mime";
import path from "path";
import { HttpMethod, HttpRequest, HttpStatus } from "..";
import { parseMediaType } from "../content";
import { HttpPipelineTransform } from "../pipeline";

export function hostFolder(baseDir: string): HttpPipelineTransform {
  const sanitizedBaseDir = path.resolve(baseDir);
  return (requests) =>
    requests.pipeThrough(new PathTransform(sanitizedBaseDir));
}

/**
 * Transform requested items to the given path
 */
class PathTransform extends TransformStream<HttpRequest, HttpRequest> {
  #baseDir: string;

  /**
   * Create the {@link PathTransform} for the given directory
   * @param baseDir The base directory to serve from
   */
  constructor(baseDir: string) {
    super({
      transform: (request, controller) => {
        // See if we can find the file
        const filePath = path.resolve(
          path.join(baseDir, request.path.original)
        );

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
