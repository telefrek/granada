/**
 * Package for handling media type operations
 */

import type { Optional } from "@telefrek/core/type/utils"
import { MediaType, parseMediaType } from "./content.js"

let EXTENSION_MAP: Optional<Record<string, MediaType>>

/**
 * Attempts to map the file extension to a {@link MediaType}
 *
 * @param filename The file to extract a {@link MediaType} for
 * @returns The {@link MediaType} or undefined for the filename
 */
export const fileToMediaType = async (
  filename: string,
): Promise<Optional<MediaType>> => {
  // Load the map the first time through
  if (EXTENSION_MAP === undefined) {
    const entry = await import("./mimeTypes.json", { with: { type: "json" } })

    EXTENSION_MAP = {}
    for (const [key, value] of Object.entries(entry.default)) {
      const type = parseMediaType(value)
      if (type) {
        EXTENSION_MAP[key] = type
      }
    }
  }

  return EXTENSION_MAP[filename.replace(/^.*[\\.\\/\\]/, "").toLowerCase()]
}
