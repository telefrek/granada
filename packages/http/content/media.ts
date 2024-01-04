/**
 * Package for handling media type operations
 */

import { isEmpty } from "@telefrek/core"
import { MediaType, parseMediaType } from "."
import { MIME_MAP } from "./mime-extension"

const EXTENSION_MAP: Partial<Record<string, MediaType>> = {}

/**
 * Attempts to map the file extension to a {@link MediaType}
 *
 * @param filename The file to extract a {@link MediaType} for
 * @returns The {@link MediaType} or undefined for the filename
 */
export const fileToMediaType = (filename: string): MediaType | undefined => {
  // Load the map the first time through
  if (isEmpty(EXTENSION_MAP)) {
    for (const [key, value] of Object.entries(MIME_MAP)) {
      const type = parseMediaType(value)
      if (type) {
        EXTENSION_MAP[key] = type
      }
    }
  }

  return EXTENSION_MAP[filename.replace(/^.*[\\.\\/\\]/, "").toLowerCase()]
}
