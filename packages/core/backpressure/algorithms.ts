import { randomInt } from "crypto"
import { EmitterFor } from "../events.js"
import { Duration } from "../time.js"
import { LOG10, LimitAlgorithm, type LimitEvents } from "./limits.js"

/**
 * Base class for all implementations of the {@link LimitAlgorithm}
 */
abstract class AbstractLimitAlgorithm
  extends EmitterFor<LimitEvents>
  implements LimitAlgorithm
{
  _limit: number

  constructor(initialLimit: number) {
    super()
    if (initialLimit <= 0) {
      throw new Error(`Invalid initialLimit: ${initialLimit}`)
    }

    this._limit = initialLimit
  }

  update(duration: Duration, inFlight: number, dropped: boolean): void {
    this.setLimit(this._update(duration, inFlight, dropped))
  }

  /**
   * @returns The current limit value
   */
  getLimit(): number {
    return this._limit
  }

  /**
   * Protected method to allow the algorithms to update the limit as they see fit
   *
   * @param newLimit The new limit to set
   */
  protected setLimit(newLimit: number) {
    // Check if the limit is updated and fire the event if so
    if (newLimit !== this._limit) {
      this._limit = newLimit
      this.emit("changed", newLimit)
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
  protected abstract _update(
    duration: Duration,
    inFlight: number,
    dropped: boolean,
  ): number
}

/**
 * Fixed limit that never changes
 */
class FixedLimitAlgorithm extends AbstractLimitAlgorithm {
  protected _update(
    _duration: Duration,
    _inFlight: number,
    _dropped: boolean,
  ): number {
    return this.getLimit()
  }
}

/**
 * Definition for the estimate function
 */
export type VegasEstimate = (estimate: number) => number

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

/**
 * Builder class to help create Vegas {@link LimitAlgorithm} instances
 */
export class VegasLimitBuilder {
  _limit: number
  _limitMax: number
  _alpha: VegasEstimate
  _beta: VegasEstimate
  _threshold: VegasEstimate
  _increase: VegasEstimate
  _decrease: VegasEstimate

  _smoothing: number
  _probeMultiplier: number

  constructor(limit: number) {
    this._limit = limit
    this._limitMax = 512
    this._alpha = (e) => 3 * LOG10(e)
    this._beta = (e) => 6 * LOG10(e)
    this._threshold = LOG10
    this._increase = (e) => e + LOG10(e)
    this._decrease = (e) => e - LOG10(e)
    this._probeMultiplier = 30
    this._smoothing = 1.0
  }

  /**
   * The current limit
   */
  get limit(): number {
    return this._limit
  }

  /**
   * The max value for the limit
   */
  get max(): number {
    return this._limitMax
  }

  /**
   * The smoothing value for changing limits
   */
  get smoothing(): number {
    return this._smoothing
  }

  /**
   * The multiplier for probes in level changes
   */
  get probeMultiplier(): number {
    return this._probeMultiplier
  }

  /**
   * The alpha estimate
   */
  get alpha(): VegasEstimate {
    return this._alpha
  }

  /**
   * The beta estimate
   */
  get beta(): VegasEstimate {
    return this._beta
  }

  /**
   * The threshold estimate
   */
  get threshold(): VegasEstimate {
    return this._threshold
  }

  /**
   * The limit increase function
   */
  get increase(): VegasEstimate {
    return this._increase
  }

  /**
   * The limit decrease function
   */
  get decrease(): VegasEstimate {
    return this._decrease
  }

  /**
   * Update the maximum limit
   * @param max The maximum limit amount
   * @returns An updated {@link VegasLimitBuilder}
   */
  withMax(max: number): VegasLimitBuilder {
    this._limitMax = max
    return this
  }

  /**
   * Update the smoothing ratio
   * @param smoothing The smoothing ratio
   * @returns An updated {@link VegasLimitBuilder}
   */
  withSmoothing(smoothing: number): VegasLimitBuilder {
    this._smoothing = smoothing
    return this
  }

  /**
   * Update the probe multiplier
   * @param multiplier The frequency of probe checks
   * @returns An updated {@link VegasLimitBuilder}
   */
  withProbeMultiplier(multiplier: number): VegasLimitBuilder {
    this._probeMultiplier = multiplier
    return this
  }

  /**
   * Estimate using the alpha function
   * @param alpha The alpha estimate
   * @returns An updated {@link VegasLimitBuilder}
   */
  withAlpha(alpha: VegasEstimate): VegasLimitBuilder {
    this._alpha = alpha
    return this
  }

  /**
   * Estimate using the beta function
   * @param beta The beta estimate
   * @returns An updated {@link VegasLimitBuilder}
   */
  withBeta(beta: VegasEstimate): VegasLimitBuilder {
    this._beta = beta
    return this
  }

  /**
   * Checks the limit thresholds for change
   * @param threshold The limit threshold function
   * @returns An updated {@link VegasLimitBuilder}
   */
  withThreshold(threshold: VegasEstimate): VegasLimitBuilder {
    this._threshold = threshold
    return this
  }

  /**
   * Function to increase the limit
   * @param increase The limit increase function
   * @returns An updated {@link VegasLimitBuilder}
   */
  withIncrease(increase: VegasEstimate): VegasLimitBuilder {
    this._increase = increase
    return this
  }

  /**
   * Function to decrease the limit
   * @param decrease The limit decrease function
   * @returns An updated {@link VegasLimitBuilder}
   */
  withDecrease(decrease: VegasEstimate): VegasLimitBuilder {
    this._decrease = decrease
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
  readonly _alpha: VegasEstimate
  readonly _beta: VegasEstimate
  readonly _threshold: VegasEstimate
  readonly _increase: VegasEstimate
  readonly _decrease: VegasEstimate
  readonly _maxLimit: number

  readonly _smoothing: number
  readonly _probeMultiplier: number

  _estimatedLimit = 0
  _probeCount = 0
  _probeJitter = 0
  _rttNoLoad = 0

  constructor(builder: VegasLimitBuilder) {
    super(builder.limit)

    this._estimatedLimit = builder.limit
    this._maxLimit = builder.max
    this._alpha = builder.alpha
    this._beta = builder.beta
    this._threshold = builder.threshold
    this._increase = builder.increase
    this._decrease = builder.decrease
    this._smoothing = builder.smoothing
    this._probeMultiplier = builder.probeMultiplier

    this._resetJitter()
  }

  private _resetJitter(): void {
    this._probeJitter = randomInt(5_000_000, 10_000_000) / 10_000_000
  }

  protected _update(
    duration: Duration,
    inFlight: number,
    dropped: boolean,
  ): number {
    const rtt = duration.microseconds()

    // Check probe count barrier
    if (
      this._estimatedLimit * this._probeJitter * this._probeMultiplier <=
      ++this._probeCount
    ) {
      this._resetJitter()
      this._probeCount = 0
      this._rttNoLoad = rtt
      return this._estimatedLimit
    }

    // Check new rtt min
    if (this._rttNoLoad === 0 || rtt < this._rttNoLoad) {
      this._rttNoLoad = rtt
      return this._estimatedLimit
    }

    // Update the actual estimate
    const size = ~~Math.ceil(this._estimatedLimit * (1 - this._rttNoLoad / rtt))
    let newLimit: number

    if (dropped) {
      newLimit = this._decrease(this._estimatedLimit)
    } else if (inFlight * 2 < this._estimatedLimit) {
      return this._estimatedLimit
    } else {
      const alpha = this._alpha(this._estimatedLimit)
      const beta = this._beta(this._estimatedLimit)
      const threshold = this._threshold(this._estimatedLimit)

      // Check threshold values against alpha/beta to detect increase or decrease
      if (size <= threshold) {
        newLimit = this._estimatedLimit + beta
      } else if (size < alpha) {
        newLimit = this._increase(this._estimatedLimit)
      } else if (size > beta) {
        newLimit = this._decrease(this._estimatedLimit)
      } else {
        return this._estimatedLimit
      }
    }

    // Cap the new limit
    newLimit = Math.max(1, Math.min(this._maxLimit, newLimit))

    // Update the estimate and return it
    this._estimatedLimit = ~~(
      (1 - this._smoothing) * this._estimatedLimit +
      this._smoothing * newLimit
    )
    return this._estimatedLimit
  }
}
