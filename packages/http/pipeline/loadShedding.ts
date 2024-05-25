/**
 * Load shedding components
 */

import type { HttpOperationContext } from "../context.js"
import { HttpErrorCode } from "../errors.js"
import { HttpPipelineLoadShedder, HttpPipelineStage } from "../pipeline.js"

export interface LoadSheddingOptions {
  /** The max wait time to start a request before it is shed */
  thresholdMs: number

  /** The maximum number of outstanding requests */
  maxOutstandingRequests: number
}

export function createLoadSheddingTransform(
  options: LoadSheddingOptions,
): HttpPipelineLoadShedder {
  return {
    stage: HttpPipelineStage.LOAD_SHEDDING,
    transformName: "loadShedding",
    cancellation: (context: HttpOperationContext) =>
      context.operation.fail({ errorCode: HttpErrorCode.TIMEOUT }),
    prioritize: (context: HttpOperationContext) => context.priority ?? 5,
    tasktimeoutMs: (context: HttpOperationContext) =>
      Math.max(
        1,
        options.thresholdMs -
          ~~context.operation.started.duration.milliseconds(),
      ),
    maxOutstandingRequests: options.maxOutstandingRequests,
  }
}
