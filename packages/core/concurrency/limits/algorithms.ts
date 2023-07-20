import { randomInt } from "crypto"
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

    #smoothing: number = 1.0

    #estimatedLimit: number
    #probeCount: number = 0
    #probeJitter: number
    #probeMultiplier: number = 30
    #rttNoLoad: number = 0
    #maxLimit: number

    constructor(initialLimit: number, maxLimit: number = 100) {
        super(initialLimit)
        this.#estimatedLimit = initialLimit
        this.#maxLimit = maxLimit

        this._resetJitter()
    }

    private _resetJitter(): void {
        this.#probeJitter = randomInt(5_000_000, 10_000_000) / 10_000_000
    }

    protected _update(duration: Duration, inFlight: number, dropped: boolean): number {
        const rtt = duration.microseconds()

        // Check probe count barrier
        if (this.#estimatedLimit * this.#probeJitter * this.#probeMultiplier <= ++this.#probeCount) {
            this._resetJitter()
            this.#probeCount = 0
            this.#rttNoLoad = rtt
            return ~~this.#estimatedLimit
        }

        // Check new rtt min
        if (this.#rttNoLoad === 0 || rtt < this.#rttNoLoad) {
            this.#rttNoLoad = rtt
            return ~~this.#estimatedLimit
        }

        // Update the actual estimate
        const size = ~~Math.ceil(this.#estimatedLimit * (1 - this.#rttNoLoad / rtt))
        let newLimit: number

        if (dropped) {
            newLimit = this.#decrease(this.#estimatedLimit)
        } else if (inFlight * 2 < this.#estimatedLimit) {
            return ~~this.#estimatedLimit
        } else {
            const alpha = this.#alpha(this.#estimatedLimit)
            const beta = this.#beta(this.#estimatedLimit)
            const threshold = this.#threshold(this.#estimatedLimit)

            // Check threshold values against alpha/beta to detect increase or decrease
            if (size <= threshold) {
                newLimit = this.#estimatedLimit + beta
            } else if (size < alpha) {
                newLimit = this.#increase(this.#estimatedLimit)
            } else if (size > beta) {
                newLimit = this.#decrease(this.#estimatedLimit)
            } else {
                return ~~this.#estimatedLimit
            }
        }

        // Cap the new limit
        newLimit = Math.max(1, Math.min(this.#maxLimit, newLimit))

        // Update the estimate and return it
        this.#estimatedLimit = (1 - this.#smoothing) * this.#estimatedLimit + this.#smoothing * newLimit
        return ~~this.#estimatedLimit
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