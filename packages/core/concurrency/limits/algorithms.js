"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.vegasBuilder = exports.fixedLimit = exports.VegasLimitBuilder = void 0;
const crypto_1 = require("crypto");
const events_1 = __importDefault(require("events"));
const _1 = require("./");
/**
 * Base class for all implementations of the {@link LimitAlgorithm}
 */
class AbstractLimitAlgorithm extends events_1.default {
    #limit;
    constructor(initialLimit) {
        super();
        if (initialLimit <= 0) {
            throw new Error(`Invalid initialLimit: ${initialLimit}`);
        }
        this.#limit = initialLimit;
    }
    update(duration, inFlight, dropped) {
        this.setLimit(this._update(duration, inFlight, dropped));
    }
    /**
     * @returns The current limit value
     */
    getLimit() {
        return this.#limit;
    }
    /**
     * Protected method to allow the algorithms to update the limit as they see fit
     *
     * @param newLimit The new limit to set
     */
    setLimit(newLimit) {
        // Check if the limit is updated and fire the event if so
        if (newLimit !== this.#limit) {
            this.#limit = newLimit;
            this.emit("changed", newLimit);
        }
    }
}
/**
 * Fixed limit that never changes
 */
class FixedLimitAlgorithm extends AbstractLimitAlgorithm {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _update(_duration, _inFlight, _dropped) {
        return this.getLimit();
    }
}
/**
 * Builder class to help create Vegas {@link LimitAlgorithm} instances
 */
class VegasLimitBuilder {
    #limit;
    #limitMax;
    #alpha;
    #beta;
    #threshold;
    #increase;
    #decrease;
    #smoothing;
    #probeMultiplier;
    constructor(limit) {
        this.#limit = limit;
        this.#limitMax = 512;
        this.#alpha = (e) => 3 * (0, _1.LOG10)(e);
        this.#beta = (e) => 6 * (0, _1.LOG10)(e);
        this.#threshold = _1.LOG10;
        this.#increase = (e) => e + (0, _1.LOG10)(e);
        this.#decrease = (e) => e - (0, _1.LOG10)(e);
        this.#probeMultiplier = 30;
        this.#smoothing = 1.0;
    }
    /**
     * The current limit
     */
    get limit() {
        return this.#limit;
    }
    /**
     * The max value for the limit
     */
    get max() {
        return this.#limitMax;
    }
    /**
     * The smoothing value for changing limits
     */
    get smoothing() {
        return this.#smoothing;
    }
    /**
     * The multiplier for probes in level changes
     */
    get probeMultiplier() {
        return this.#probeMultiplier;
    }
    /**
     * The alpha estimate
     */
    get alpha() {
        return this.#alpha;
    }
    /**
     * The beta estimate
     */
    get beta() {
        return this.#beta;
    }
    /**
     * The threshold estimate
     */
    get threshold() {
        return this.#threshold;
    }
    /**
     * The limit increase function
     */
    get increase() {
        return this.#increase;
    }
    /**
     * The limit decrease function
     */
    get decrease() {
        return this.#decrease;
    }
    /**
     * Update the maximum limit
     * @param max The maximum limit amount
     * @returns An updated {@link VegasLimitBuilder}
     */
    withMax(max) {
        this.#limitMax = max;
        return this;
    }
    /**
     * Update the smoothing ratio
     * @param smoothing The smoothing ratio
     * @returns An updated {@link VegasLimitBuilder}
     */
    withSmoothing(smoothing) {
        this.#smoothing = smoothing;
        return this;
    }
    /**
     * Update the probe multiplier
     * @param multiplier The frequency of probe checks
     * @returns An updated {@link VegasLimitBuilder}
     */
    withProbeMultiplier(multiplier) {
        this.#probeMultiplier = multiplier;
        return this;
    }
    /**
     * Estimate using the alpha function
     * @param alpha The alpha estimate
     * @returns An updated {@link VegasLimitBuilder}
     */
    withAlpha(alpha) {
        this.#alpha = alpha;
        return this;
    }
    /**
     * Estimate using the beta function
     * @param beta The beta estimate
     * @returns An updated {@link VegasLimitBuilder}
     */
    withBeta(beta) {
        this.#beta = beta;
        return this;
    }
    /**
     * Checks the limit thresholds for change
     * @param threshold The limit threshold function
     * @returns An updated {@link VegasLimitBuilder}
     */
    withThreshold(threshold) {
        this.#threshold = threshold;
        return this;
    }
    /**
     * Function to increase the limit
     * @param increase The limit increase function
     * @returns An updated {@link VegasLimitBuilder}
     */
    withIncrease(increase) {
        this.#increase = increase;
        return this;
    }
    /**
     * Function to decrease the limit
     * @param decrease The limit decrease function
     * @returns An updated {@link VegasLimitBuilder}
     */
    withDecrease(decrease) {
        this.#decrease = decrease;
        return this;
    }
    /**
     * Builds the limit algorithm
     * @returns A new {@link LimitAlgorithm}
     */
    build() {
        return new VegasLimitAlgorithm(this);
    }
}
exports.VegasLimitBuilder = VegasLimitBuilder;
/**
 * Uses a variant of the Vegas TCP congestion algorithm ({@link https://en.wikipedia.org/wiki/TCP_Vegas})
 */
class VegasLimitAlgorithm extends AbstractLimitAlgorithm {
    #alpha;
    #beta;
    #threshold;
    #increase;
    #decrease;
    #maxLimit;
    #smoothing;
    #probeMultiplier;
    #estimatedLimit = 0;
    #probeCount = 0;
    #probeJitter = 0;
    #rttNoLoad = 0;
    constructor(builder) {
        super(builder.limit);
        this.#estimatedLimit = builder.limit;
        this.#maxLimit = builder.max;
        this.#alpha = builder.alpha;
        this.#beta = builder.beta;
        this.#threshold = builder.threshold;
        this.#increase = builder.increase;
        this.#decrease = builder.decrease;
        this.#smoothing = builder.smoothing;
        this.#probeMultiplier = builder.probeMultiplier;
        this._resetJitter();
    }
    _resetJitter() {
        this.#probeJitter = (0, crypto_1.randomInt)(5_000_000, 10_000_000) / 10_000_000;
    }
    _update(duration, inFlight, dropped) {
        const rtt = duration.microseconds();
        // Check probe count barrier
        if (this.#estimatedLimit * this.#probeJitter * this.#probeMultiplier <=
            ++this.#probeCount) {
            this._resetJitter();
            this.#probeCount = 0;
            this.#rttNoLoad = rtt;
            return this.#estimatedLimit;
        }
        // Check new rtt min
        if (this.#rttNoLoad === 0 || rtt < this.#rttNoLoad) {
            this.#rttNoLoad = rtt;
            return this.#estimatedLimit;
        }
        // Update the actual estimate
        const size = ~~Math.ceil(this.#estimatedLimit * (1 - this.#rttNoLoad / rtt));
        let newLimit;
        if (dropped) {
            newLimit = this.#decrease(this.#estimatedLimit);
        }
        else if (inFlight * 2 < this.#estimatedLimit) {
            return this.#estimatedLimit;
        }
        else {
            const alpha = this.#alpha(this.#estimatedLimit);
            const beta = this.#beta(this.#estimatedLimit);
            const threshold = this.#threshold(this.#estimatedLimit);
            // Check threshold values against alpha/beta to detect increase or decrease
            if (size <= threshold) {
                newLimit = this.#estimatedLimit + beta;
            }
            else if (size < alpha) {
                newLimit = this.#increase(this.#estimatedLimit);
            }
            else if (size > beta) {
                newLimit = this.#decrease(this.#estimatedLimit);
            }
            else {
                return this.#estimatedLimit;
            }
        }
        // Cap the new limit
        newLimit = Math.max(1, Math.min(this.#maxLimit, newLimit));
        // Update the estimate and return it
        this.#estimatedLimit = ~~((1 - this.#smoothing) * this.#estimatedLimit +
            this.#smoothing * newLimit);
        return this.#estimatedLimit;
    }
}
/**
 * Creates a {@link LimitAlgorithm} that never changes size
 *
 * @param limit The concurrency limit
 * @returns A new {@link LimitAlgorithm}
 */
function fixedLimit(limit) {
    return new FixedLimitAlgorithm(limit);
}
exports.fixedLimit = fixedLimit;
/**
 * Creates a new {@link VegasLimitBuilder} for building the Vegas {@link LimitAlgorithm}
 *
 * @param limit The concurrency limit
 * @returns A new {@link VegasLimitBuilder} for building the {@link LimitAlgorithm}
 */
function vegasBuilder(limit) {
    return new VegasLimitBuilder(limit);
}
exports.vegasBuilder = vegasBuilder;
