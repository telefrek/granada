import { randomInt } from "crypto"
import EventEmitter from "events"
import { LimitAlgorithm } from "."
import { Duration } from "../../time"

// Memoize the lookup for the first 1000 values
const _LOG_10_LOOKUP: number[] = Array.from(Array(1000).keys()).map(k => Math.max(1, Math.log10(k)))

/**
 * Memoized Log10 function for the first 1000 values
 * 
 * @param n The value to calculate the log of 10 for
 * @returns The value of log10(n)
 */
function LOG10(n: number): number {
    return n < 1000 ? _LOG_10_LOOKUP[n] : Math.log10(n)
}

/**
 * Base class for all implementations of the {@link LimitAlgorithm}
 */
abstract class AbstractLimitAlgorithm extends EventEmitter implements LimitAlgorithm {

    #limit: number

    constructor(initialLimit: number) {
        super()
        if (initialLimit <= 0) {
            throw new Error(`Invalid initialLimit: ${initialLimit}`)
        }

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected _update(_duration: Duration, _inFlight: number, _dropped: boolean): number {
        return this.getLimit()
    }
}

/**
 * Definition for the estimate function
 */
export type VegasEstimate = (estimate: number) => number

/**
 * Builder class to help create Vegas {@link LimitAlgorithm} instances
 */
export class VegasLimitBuilder {

    #limit: number
    #limitMax: number
    #alpha: VegasEstimate
    #beta: VegasEstimate
    #threshold: VegasEstimate
    #increase: VegasEstimate
    #decrease: VegasEstimate

    #smoothing: number
    #probeMultiplier: number

    constructor(limit: number) {
        this.#limit = limit
        this.#limitMax = 512
        this.#alpha = e => 3 * LOG10(e)
        this.#beta = e => 6 * LOG10(e)
        this.#threshold = LOG10
        this.#increase = e => e + LOG10(e)
        this.#decrease = e => e - LOG10(e)
        this.#probeMultiplier = 30
        this.#smoothing = 1.0
    }

    /**
     * The current limit
     */
    public get limit(): number {
        return this.#limit
    }

    /** 
     * The max value for the limit
     */
    public get max(): number {
        return this.#limitMax
    }

    /**
     * The smoothing value for changing limits
     */
    public get smoothing(): number {
        return this.#smoothing
    }

    /**
     * The multiplier for probes in level changes
     */
    public get probeMultiplier(): number {
        return this.#probeMultiplier
    }

    /**
     * The alpha estimate
     */
    public get alpha(): VegasEstimate {
        return this.#alpha
    }

    /**
     * The beta estimate
     */
    public get beta(): VegasEstimate {
        return this.#beta
    }

    /**
     * The threshold estimate
     */
    public get threshold(): VegasEstimate {
        return this.#threshold
    }

    /**
     * The limit increase function
     */
    public get increase(): VegasEstimate {
        return this.#increase
    }

    /**
     * The limit decrease function
     */
    public get decrease(): VegasEstimate {
        return this.#decrease
    }

    /**
     * Update the maximum limit
     * @param max The maximum limit amount
     * @returns An updated {@link VegasLimitBuilder}
     */
    public withMax(max: number): VegasLimitBuilder {
        this.#limitMax = max
        return this
    }

    /**
     * Update the smoothing ratio
     * @param smoothing The smoothing ratio
     * @returns An updated {@link VegasLimitBuilder}
     */
    public withSmoothing(smoothing: number): VegasLimitBuilder {
        this.#smoothing = smoothing
        return this
    }

    /**
     * Update the probe multiplier
     * @param multiplier The frequency of probe checks
     * @returns An updated {@link VegasLimitBuilder}
     */
    public withProbeMultiplier(multiplier: number): VegasLimitBuilder {
        this.#probeMultiplier = multiplier
        return this
    }

    /**
     * Estimate using the alpha function
     * @param alpha The alpha estimate
     * @returns An updated {@link VegasLimitBuilder}
     */
    public withAlpha(alpha: VegasEstimate): VegasLimitBuilder {
        this.#alpha = alpha
        return this
    }

    /**
     * Estimate using the beta function
     * @param beta The beta estimate
     * @returns An updated {@link VegasLimitBuilder}
     */
    public withBeta(beta: VegasEstimate): VegasLimitBuilder {
        this.#beta = beta
        return this
    }

    /**
     * Checks the limit thresholds for change
     * @param threshold The limit threshold function
     * @returns An updated {@link VegasLimitBuilder}
     */
    public withThreshold(threshold: VegasEstimate): VegasLimitBuilder {
        this.#threshold = threshold
        return this
    }

    /**
     * Function to increase the limit
     * @param increase The limit increase function
     * @returns An updated {@link VegasLimitBuilder}
     */
    public withIncrease(increase: VegasEstimate): VegasLimitBuilder {
        this.#increase = increase
        return this
    }

    /**
     * Function to decrease the limit
     * @param decrease The limit decrease function
     * @returns An updated {@link VegasLimitBuilder}
     */
    public withDecrease(decrease: VegasEstimate): VegasLimitBuilder {
        this.#decrease = decrease
        return this
    }

    /**
     * Builds the limit algorithm
     * @returns A new {@link LimitAlgorithm}
     */
    build(): LimitAlgorithm {
        return new VegasLimitAlgorithm(this)
    }
}

/**
 * Uses a variant of the Vegas TCP congestion algorithm ({@link https://en.wikipedia.org/wiki/TCP_Vegas})
 */
class VegasLimitAlgorithm extends AbstractLimitAlgorithm {

    readonly #alpha: VegasEstimate
    readonly #beta: VegasEstimate
    readonly #threshold: VegasEstimate
    readonly #increase: VegasEstimate
    readonly #decrease: VegasEstimate
    readonly #maxLimit: number

    readonly #smoothing: number
    readonly #probeMultiplier: number

    #estimatedLimit = 0
    #probeCount = 0
    #probeJitter = 0
    #rttNoLoad = 0

    constructor(builder: VegasLimitBuilder) {
        super(builder.limit)

        this.#estimatedLimit = builder.limit
        this.#maxLimit = builder.max
        this.#alpha = builder.alpha
        this.#beta = builder.beta
        this.#threshold = builder.threshold
        this.#increase = builder.increase
        this.#decrease = builder.decrease
        this.#smoothing = builder.smoothing
        this.#probeMultiplier = builder.probeMultiplier

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
            return this.#estimatedLimit
        }

        // Check new rtt min
        if (this.#rttNoLoad === 0 || rtt < this.#rttNoLoad) {
            this.#rttNoLoad = rtt
            return this.#estimatedLimit
        }

        // Update the actual estimate
        const size = ~~Math.ceil(this.#estimatedLimit * (1 - this.#rttNoLoad / rtt))
        let newLimit: number

        if (dropped) {
            newLimit = this.#decrease(this.#estimatedLimit)
        } else if (inFlight * 2 < this.#estimatedLimit) {
            return this.#estimatedLimit
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
                return this.#estimatedLimit
            }
        }

        // Cap the new limit
        newLimit = Math.max(1, Math.min(this.#maxLimit, newLimit))

        // Update the estimate and return it
        this.#estimatedLimit = ~~((1 - this.#smoothing) * this.#estimatedLimit + this.#smoothing * newLimit)
        return this.#estimatedLimit
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

/**
 * Creates a new {@link VegasLimitBuilder} for building the Vegas {@link LimitAlgorithm}
 * 
 * @param limit The concurrency limit
 * @returns A new {@link VegasLimitBuilder} for building the {@link LimitAlgorithm}
 */
export function vegasBuilder(limit: number): VegasLimitBuilder {
    return new VegasLimitBuilder(limit)
}