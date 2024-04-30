/**
 * Default client pipeline operations
 */

import type { HttpPipelineConfiguration } from "../pipeline.js"
import { PARSE_RESPONSE_BODY } from "../pipeline/contents.js"

export const DEFAULT_CLIENT_PIPELINE_CONFIGURATION: HttpPipelineConfiguration =
  {
    responseTransforms: [PARSE_RESPONSE_BODY],
  }
