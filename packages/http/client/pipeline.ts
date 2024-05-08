/**
 * Default client pipeline operations
 */

import type { HttpPipelineConfiguration } from "../pipeline.js"
import { RESPONSE_PARSING_MIDDLEWARE } from "../pipeline/contents.js"

export const DEFAULT_CLIENT_PIPELINE_CONFIGURATION: HttpPipelineConfiguration =
  {
    transforms: [],
    middleware: [RESPONSE_PARSING_MIDDLEWARE],
  }
