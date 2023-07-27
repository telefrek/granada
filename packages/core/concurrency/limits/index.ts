/**
 * Port of a subset of the Netflix Concurrency Limits functionality {@link https://github.com/Netflix/concurrency-limits}
 */

import { Emitter } from "../../events";
import { Duration } from "../../time";
import { Semaphore } from "../primitives";
import { fixedLimit } from "./algorithms";
import { simpleLimiter } from "./limiters";

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
     * Attempt to acquire a {@link LimitedOperation}
     */
    tryAcquire(): LimitedOperation | undefined
}

/**
 * Create a simple {@link Limiter} that works via a {@link Semaphore}
 * 
 * @param limitAlgorithm The {@link LimitAlgorithm} to use (default is a fixed limit of 1)
 * @param initialLimit The initial limit value to use (default is 1)
 * @returns A newly initialized {@link Limiter}
 */
export function createSimpleLimiter(limitAlgorithm: LimitAlgorithm = fixedLimit(1), initialLimit: number = 1): Limiter {
    return simpleLimiter(limitAlgorithm, initialLimit)
}
