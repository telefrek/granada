/**
 * Load shedding components
 */

import { DeferredPromise, type MaybeAwaitable } from "@telefrek/core/index.js"
import {
  DefaultMultiLevelPriorityQueue,
  TaskPriority,
} from "@telefrek/core/structures/multiLevelQueue.js"
import { Duration } from "@telefrek/core/time.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import type { HttpOperationContext } from "../context.js"
import { HttpErrorCode, translateHttpError } from "../errors.js"
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
    const queue = new DefaultMultiLevelPriorityQueue() // TODO: More testing to see if this is necessary as stream parallelism required

    this.transform = async (context: HttpOperationContext) => {
      try {
        if (
          context.operation.started.duration.milliseconds() >
          options.thresholdMs
        ) {
          context.operation.fail({ errorCode: HttpErrorCode.TIMEOUT })
          return
        }

        const deferred = new DeferredPromise<Optional<HttpOperationContext>>()

        queue.queue(
          {
            // TODO: Map this to context hints
            priority: TaskPriority.LOW,
            timeout: Duration.ofMilli(options.thresholdMs),
            cancel: () => {
              context.operation.fail({ errorCode: HttpErrorCode.TIMEOUT })
              deferred.resolve(undefined)
            },
          },
          () => deferred.resolve(context),
        )

        return await deferred
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
