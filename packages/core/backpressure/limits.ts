/**
 * Port of a subset of the Netflix Concurrency Limits functionality {@link https://github.com/Netflix/concurrency-limits}
 */

import { Emitter } from "../events.js"
import type { MaybeAwaitable } from "../index.js"
import { Duration } from "../time.js"
import type { Optional } from "../type/utils.js"
import { fixedLimit } from "./algorithms.js"
import { simpleLimiter } from "./limiters.js"

// Memoize the lookup for the first 1000 values
const _LOG_10_LOOKUP: number[] = Array.from(Array(1000).keys()).map((k) =>
  Math.max(1, Math.log10(k)),
)

/**
 * Memoized Log10 function for the first 1000 values capping at >= 1
 *
 * @param n The value to calculate the log of 10 for
 * @returns The value of log10(n)
 */
export function LOG10(n: number): number {
  return n < 1000 ? _LOG_10_LOOKUP[n] : Math.log10(n)
}

/**
 * Defines the events for the {@link LimitAlgorithm} class
 */
export interface LimitEvents {
  /**
   * Event fired when the {@link LimitAlgorithm} changes
   * @param newLimit The new limit
   */
  changed(newLimit: number): void
}

/**
 * Represents a dynamic limit algorithm
 */
export interface LimitAlgorithm extends Emitter<LimitEvents> {
  /**
   * Method used to determine if the limit needs to be changed
   *
   * @param duration The {@link Duration} the operation took
   * @param inFlight The number of other operations that were currently running
   * @param dropped Flag to indicate if the operation was dropped
   */
  update(duration: Duration, inFlight: number, dropped: boolean): void
}

/**
 * Represents an operation that is gated by a {@link LimitAlgorithm} which has been allowed to execute via a {@link Limiter}
 */
export interface LimitedOperation {
  /**
   * Mark the operation as successful
   */
  success(): void

  /**
   * Ignore the operation as there was an unusual outcome that might bias the {@link LimitAlgorithm}
   */
  ignore(): void

  /**
   * The operation was dropped (timed out, was rate limited, or otherwise failed due to too much load)
   */
  dropped(): void
}

/**
 * Represents an implementation of an object limiting throughput based on some {@link LimitAlgorithm}
 */
export interface Limiter {
  /**
   * Attempt to acquire an {@link Optional} {@link LimitedOperation}
   */
  tryAcquire(): Optional<LimitedOperation>

  /**
   * Acquire a {@link LimitedOperation} blocking operation until available
   */
  acquire(): MaybeAwaitable<LimitedOperation>

  /**
   * Retrieve the current limit
   */
  readonly limit: number
}

/**
 * Create a simple {@link Limiter} that works via a {@link Semaphore}
 *
 * @param limitAlgorithm The {@link LimitAlgorithm} to use (default is a fixed limit of 1)
 * @param initialLimit The initial limit value to use (default is 1)
 * @returns A newly initialized {@link Limiter}
 */
export function createSimpleLimiter(
  limitAlgorithm: LimitAlgorithm = fixedLimit(1),
  initialLimit = 1,
): Limiter {
  return simpleLimiter(limitAlgorithm, initialLimit)
}
