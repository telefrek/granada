/**
 * Package for managing load shedding within an application
 */

import { vegasBuilder } from "@telefrek/core/backpressure/algorithms.js"
import {
  Limiter,
  createSimpleLimiter,
} from "@telefrek/core/backpressure/limits.js"
import { info } from "@telefrek/core/logging.js"
import { Timer } from "@telefrek/core/time.js"
import type { Optional } from "@telefrek/core/type/utils"
import { HttpStatus, emptyHeaders, type HttpRequest } from "../index.js"
import { HttpPipelineStage, HttpPipelineTransform } from "./pipeline.js"

export function enableLoadShedding(
  thresholdMs = 1_000,
  limiter: Optional<Limiter>,
): HttpPipelineTransform {
  // Get the limiter
  const limit =
    limiter ??
    createSimpleLimiter(
      vegasBuilder(10)
        .build()
        .on("changed", (l: number) => {
          info(`new limit: ${l}`)
        }),
      10,
    )

  return {
    stage: HttpPipelineStage.LOAD_SHEDDING,
    transform: (request: HttpRequest) => {
      const l = limit.tryAcquire()
      if (l) {
        const timer = new Timer()
        request.on("finished", () => {
          const end = timer.stop()
          if (end.milliseconds() > thresholdMs) {
            l.dropped()
            info("dropped due to exceeding timeout")
          } else {
            l.success()
          }
        })
        return request
      } else {
        info(`failed to get... ${limit.limit}`)
        // Load shedding...
        request.respond({
          status: HttpStatus.SERVICE_UNAVAILABLE,
          headers: emptyHeaders(),
        })

        return
      }
    },
  }
}
