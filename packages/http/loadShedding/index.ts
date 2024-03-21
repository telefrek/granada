/**
 * Package for managing load shedding within an application
 */

import { Limiter, createSimpleLimiter } from "@telefrek/core/concurrency/limits"
import { vegasBuilder } from "@telefrek/core/concurrency/limits/algorithms"
import { Timer } from "@telefrek/core/time"
import { HttpStatus, emptyHeaders } from ".."
import { HttpPipelineTransform } from "../pipeline"

export function enableLoadShedding(
  thresholdMs = 1_000,
  limiter: Limiter | undefined = undefined,
): HttpPipelineTransform {
  // Get the limiter
  const limit =
    limiter ??
    createSimpleLimiter(
      vegasBuilder(10)
        .build()
        .on("changed", (l) => {
          console.log(`new limit: ${l}`)
        }),
      10,
    )

  return (request) => {
    const l = limit.tryAcquire()
    if (l) {
      const timer = new Timer()
      request.on("finished", () => {
        const end = timer.stop()
        if (end.milliseconds() > thresholdMs) {
          l.dropped()
          console.log("dropped due to exceeding timeout")
        } else {
          l.success()
        }
      })
      return request
    } else {
      console.log(`failed to get... ${limit.limit}`)
      // Load shedding...
      request.respond({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        headers: emptyHeaders(),
      })

      return
    }
  }
}
