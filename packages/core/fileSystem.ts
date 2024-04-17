/** Utilities for file system operations */
import { existsSync, statSync } from "fs"

export function fileExists(fileName: string): boolean {
  // File might exist but have no valid stats
  if (existsSync(fileName)) {
    const stats = statSync(fileName, { throwIfNoEntry: false })
    return stats ? stats.birthtimeMs !== 0 : false
  }

  return false
}
