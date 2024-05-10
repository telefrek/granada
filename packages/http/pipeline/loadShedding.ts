/**
 * Load shedding components
 */

import type { MaybeAwaitable } from "@telefrek/core"
import {
  DefaultMultiLevelPriorityQueue,
  TaskPriority,
  type MultiLevelTaskOptions,
} from "@telefrek/core/structures/multiLevelQueue"
import type { Optional } from "@telefrek/core/type/utils"
import type { HttpOperationContext } from "../context.js"
import { translateHttpError } from "../errors.js"
import { HttpRequestPipelineMetrics } from "../metrics.js"
import { HttpPipelineLoadShedder, HttpPipelineStage } from "../pipeline.js"

export interface LoadSheddingOptions {
  /** The max wait time to start a request before it is shed */
  thresholdMs: number

  /** The maximum number of outstanding requests */
  maxOutstandingRequests: number

  /** Flag to indicate if priority upgrades are allowed (default false) */
  allowPriorityUpgrade?: boolean
}

/**
 * Default implementation of the {@link HttpPipelineLoadShedder} using a
 * {@link MultiLevelPriorityQueue} to back the priority
 */
class DefaultHttpPipelineLoadShedder implements HttpPipelineLoadShedder {
  readonly transformName: string = "http.loadShedding"
  readonly stage: HttpPipelineStage.LOAD_SHEDDING =
    HttpPipelineStage.LOAD_SHEDDING

  highWatermark: number
  transform: (
    data: HttpOperationContext,
  ) => MaybeAwaitable<Optional<HttpOperationContext>>

  constructor(options: LoadSheddingOptions) {
    this.highWatermark = options.maxOutstandingRequests
    const queue = new DefaultMultiLevelPriorityQueue(4) // TODO: More testing to see if this is necessary as stream parallelism required

    this.transform = async (context) => {
      try {
        HttpRequestPipelineMetrics.LoadSheddingStageDelay.record(
          context.operation.started.duration.seconds(),
        )

        return await queue.queue(
          <MultiLevelTaskOptions>{
            // TODO: Map this to context hints
            priority: TaskPriority.LOW,
            timeoutMilliseconds: options.thresholdMs,
            delayMilliseconds: options.allowPriorityUpgrade
              ? options.thresholdMs > 1
              : undefined,
          },
          () => context,
        )
      } catch (err) {
        context.operation.fail(translateHttpError(err))
      }

      return
    }
  }
}

export function createLoadSheddingTransform(
  options: LoadSheddingOptions,
): HttpPipelineLoadShedder {
  return new DefaultHttpPipelineLoadShedder(options)
}
