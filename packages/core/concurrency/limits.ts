/**
 * Port of a subset of the Netflix Concurrency Limits functionality {@link https://github.com/Netflix/concurrency-limits}
 */

import EventEmitter from "events";
import { Emitter } from "../events";
import { Duration, Timer } from "../time";
import { Semaphore } from "./primitives";

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
 * Creates a {@link LimitAlgorithm} that never changes size
 * 
 * @param limit The concurrency limit
 * @returns A new {@link LimitAlgorithm}
 */
export function fixedLimit(limit: number): LimitAlgorithm {
    return new FixedLimitAlgorithm(limit)
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
 * Create a simple {@link Limiter} using a {@link Semaphore} as the backing limit
 * 
 * @param limitAlgorithm The {@link LimitAlgorithm} to use (default is a fixed limit of 1)
 * @param initialLimit The initial limit value to use (default is 1)
 * @returns A newly initialized {@link Limiter}
 */
export function simpleLimiter(limitAlgorithm: LimitAlgorithm = fixedLimit(1), initialLimit: number = 1) {
    return new SimpleLimiter(limitAlgorithm, initialLimit)
}

/**
 * Base class for all implementations of the {@link LimitAlgorithm}
 */
abstract class AbstractLimitAlgorithm extends EventEmitter implements LimitAlgorithm {

    #limit: number

    constructor(initialLimit: number) {
        if (initialLimit <= 0) {
            throw new Error(`Invalid initialLimit: ${initialLimit}`)
        }

        super()
        this.#limit = initialLimit
    }

    update(duration: Duration, inFlight: number, dropped: boolean): void {
        this.setLimit(this._update(duration, inFlight, dropped))
    }

    /**
     * @returns The current limit value
     */
    getLimit(): number {
        return this.#limit
    }

    /**
     * Protected method to allow the algorithms to update the limit as they see fit
     * 
     * @param newLimit The new limit to set
     */
    protected setLimit(newLimit: number) {

        // Check if the limit is updated and fire the event if so
        if (newLimit !== this.#limit) {
            this.#limit = newLimit
            this.emit('changed', newLimit)
        }
    }

    /**
     * Protected implementation specific update method
     * 
     * @param duration The {@link Duration} the operation took
     * @param inFlight The number of other operations that were currently running
     * @param dropped Flag to indicate if the operation was dropped
     * 
     * @returns The limit value
     */
    protected abstract _update(duration: Duration, inFlight: number, dropped: boolean): number
}

/**
 * Fixed limit that never changes
 */
class FixedLimitAlgorithm extends AbstractLimitAlgorithm {
    protected _update(_duration: Duration, _inFlight: number, _dropped: boolean): number {
        return this.getLimit()
    }
}

/**
 * Base class for all implementations of the {@link Limiter}
 */
abstract class AbstractLimiter implements Limiter {

    #limitAlgorithm: LimitAlgorithm
    #limit: number
    #inFlight: number

    /**
     * Base constructor for all {@link Limiter} abstractions built from this class
     * 
     * @param limitAlgorithm The {@link LimitAlgorithm} to utilize
     * @param initialLimit The initial limit
     */
    constructor(limitAlgorithm: LimitAlgorithm, initialLimit: number) {

        if (initialLimit <= 0) {
            throw new Error(`Invalid initialLimit: ${initialLimit}`)
        }

        this.#limitAlgorithm = limitAlgorithm
        this.#limit = initialLimit
        this.#inFlight = 0

        this.#limitAlgorithm.on('changed', this.onChange.bind(this))
    }

    /**
     * @returns The current limit
     */
    getLimit(): number {
        return this.#limit
    }

    tryAcquire(): LimitedOperation | undefined {
        return
    }

    /**
     * Handler for the {@link LimitAlgorithm} `changed` event
     * 
     * @param newLimit The new limit to use
     */
    protected onChange(newLimit: number) {
        this.#limit = newLimit
    }

    /**
     * Create a {@link LimitedOperation} to manipulate the state of the current {@link Limiter}
     * 
     * @returns A basic {@link LimitedOperation}
     */
    protected createOperation(): LimitedOperation {
        return new this.AbstractLimitOperation(this)
    }

    /**
     * Base {@link LimitedOperation} that handles state tracking and mainpulation of the underlying {@link AbstractLimiter}
     */
    AbstractLimitOperation = class implements LimitedOperation {

        #limiter: AbstractLimiter
        #finished: boolean
        #timer: Timer
        #running: number

        /**
         * Requires the base {@link AbstractLimiter} which can be updated
         * 
         * @param limiter The {@link AbstractLimiter} to update
         */
        constructor(limiter: AbstractLimiter) {
            this.#limiter = limiter
            this.#finished = false
            this.#running = limiter.#inFlight
            this.#timer = new Timer()
            this.#timer.start()
        }

        success(): void {
            this.#update()
            this.#limiter.#limitAlgorithm.update(this.#timer.stop(), this.#running, false)
        }

        ignore(): void {
            this.#update()
        }

        dropped(): void {
            this.#update()
            this.#limiter.#limitAlgorithm.update(this.#timer.stop(), this.#running, true)
        }

        /**
         * Private method to update the finished state and limiter inFlight value
         */
        #update(): void {
            // Ensure we only finish this once for any state
            if (!this.#finished) {
                this.#finished = true
                this.#limiter.#inFlight--
            } else {
                throw new Error('This operation has already been finished!')
            }
        }
    }
}

/**
 * Simple {@link Limiter} that uses a {@link Semaphore} to gate access
 */
class SimpleLimiter extends AbstractLimiter {

    #semaphore: Semaphore

    /**
     * SimpleLimiter requires at least a {@link LimitAlgorithm} and optional limit (default is 1)
     * 
     * @param limitAlgorithm The {@link LimitAlgorithm} to use
     * @param initialLimit The optional initial limit (default is 1)
     */
    constructor(limitAlgorithm: LimitAlgorithm, initialLimit: number = 1) {
        super(limitAlgorithm, initialLimit)

        this.#semaphore = new Semaphore(initialLimit)
    }

    override tryAcquire(): LimitedOperation | undefined {

        // Use the non-blocking version
        if (this.#semaphore.tryAcquire()) {
            return new this.SimpleLimitedOperation(this.#semaphore, this.createOperation())
        }
    }

    protected override onChange(newLimit: number): void {
        super.onChange(newLimit)
    }

    SimpleLimitedOperation = class implements LimitedOperation {
        #delegate: LimitedOperation
        #semaphore: Semaphore

        constructor(semaphore: Semaphore, delegate: LimitedOperation) {
            this.#delegate = delegate
            this.#semaphore = semaphore
        }

        success(): void {
            this.#semaphore.release()
            this.#delegate.success()
        }

        ignore(): void {
            this.#semaphore.release()
            this.#delegate.ignore()
        }

        dropped(): void {
            this.#semaphore.release()
            this.#delegate.dropped()
        }

    }
}