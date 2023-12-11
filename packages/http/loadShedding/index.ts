/**
 * Package for managing load shedding within an application
 */

import { Limiter, createSimpleLimiter } from "@telefrek/core/concurrency/limits"
import { vegasBuilder } from "@telefrek/core/concurrency/limits/algorithms"
import { HttpRequest, HttpStatus, emptyHeaders } from ".."
import { HttpPipelineTransform } from "../pipeline"

export function enableLoadShedding(
  thresholdMs = 1_000,
  limiter: Limiter | undefined = undefined,
): HttpPipelineTransform {
  if (limiter === undefined) {
    limiter = createSimpleLimiter(
      vegasBuilder(10)
        .build()
        .on("changed", (l) => {
          console.log(`new limit: ${l}`)
        }),
      10,
    )
  }

  return (readable: ReadableStream<HttpRequest>) =>
    readable.pipeThrough(new LoadSheddingTransform(limiter!, thresholdMs))
}

/**
 * Transform requested items to the given path
 */
class LoadSheddingTransform extends TransformStream<HttpRequest, HttpRequest> {
  #limit: Limiter

  /**
   * Create the {@link PathTransform} for the given directory
   * @param baseDir The base directory to serve from
   */
  constructor(limit: Limiter, timeoutMs = 100) {
    super({
      transform: (request, controller) => {
        const l = limit.tryAcquire()
        if (l) {
          const start = process.hrtime.bigint()
          request.on("finished", () => {
            const end = process.hrtime.bigint() - start
            if (Number(end / 1000000n) > timeoutMs) {
              l.dropped()
              console.log("dropped due to exceeding timeout")
            } else {
              l.success()
            }
          })
          controller.enqueue(request)
        } else {
          console.log(`failed to get... ${limit.limit}`)
          // Load shedding...
          request.respond({
            status: HttpStatus.SERVICE_UNAVAILABLE,
            headers: emptyHeaders(),
          })
        }
      },
    })

    this.#limit = limit
  }
}
