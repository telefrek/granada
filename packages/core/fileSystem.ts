/** Utilities for file system operations */
import { existsSync, statSync } from "fs"
import { getDebugInfo } from "./index.js"
import { info } from "./logging.js"

export function fileExists(fileName: string): boolean {
  // File might exist but have no valid stats
  if (existsSync(fileName)) {
    const stats = statSync(fileName, { throwIfNoEntry: false })
    info(getDebugInfo(stats))
    return stats ? stats.birthtimeMs !== 0 : false
  }

  return false
}
