/**
 * Http Server Pipeline defaults
 */

import type { HttpPipelineConfiguration } from "../pipeline.js"
import { PARSE_REQUEST_BODY } from "../pipeline/contents.js"

export const DEFAULT_CLIENT_PIPELINE_CONFIGURATION: HttpPipelineConfiguration =
  {
    requestTransforms: [PARSE_REQUEST_BODY],
  }
