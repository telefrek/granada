import EventEmitter from "events"
import { LimitAlgorithm } from "."
import { Duration } from "../../time"

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
 * Uses a variant of the Vegas TCP congestion algorithm ({@link https://en.wikipedia.org/wiki/TCP_Vegas})
 */
class VegasLimitAlgorithm extends AbstractLimitAlgorithm {

    #alpha: (estimate: number) => number
    #beta: (estimate: number) => number
    #threshold: (estimate: number) => number
    #increase: (estimate: number) => number
    #decrease: (estimate: number) => number

    protected _update(duration: Duration, inFlight: number, dropped: boolean): number {
        throw new Error("Method not implemented.")
    }

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