/**
 * Default client pipeline operations
 */

import type { HttpPipelineConfiguration } from "../pipeline.js"
import { createClientContentMiddleware } from "../pipeline/contents.js"

export const DEFAULT_CLIENT_PIPELINE_CONFIGURATION: HttpPipelineConfiguration =
  {
    transforms: [],
    middleware: [createClientContentMiddleware()],
  }
