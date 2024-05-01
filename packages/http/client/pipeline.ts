/**
 * Default client pipeline operations
 */

import type { HttpPipelineConfiguration } from "../pipeline.js"
import {
  PARSE_RESPONSE_BODY,
  VERIFY_REQUEST_BODY_FOR_SEND,
} from "../pipeline/contents.js"

export const DEFAULT_CLIENT_PIPELINE_CONFIGURATION: HttpPipelineConfiguration =
  {
    requestTransforms: [VERIFY_REQUEST_BODY_FOR_SEND],
    responseTransforms: [PARSE_RESPONSE_BODY],
  }
