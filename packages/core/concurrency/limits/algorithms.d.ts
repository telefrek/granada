import { LimitAlgorithm } from "./";
/**
 * Definition for the estimate function
 */
export type VegasEstimate = (estimate: number) => number;
/**
 * Builder class to help create Vegas {@link LimitAlgorithm} instances
 */
export declare class VegasLimitBuilder {
    #private;
    constructor(limit: number);
    /**
     * The current limit
     */
    get limit(): number;
    /**
     * The max value for the limit
     */
    get max(): number;
    /**
     * The smoothing value for changing limits
     */
    get smoothing(): number;
    /**
     * The multiplier for probes in level changes
     */
    get probeMultiplier(): number;
    /**
     * The alpha estimate
     */
    get alpha(): VegasEstimate;
    /**
     * The beta estimate
     */
    get beta(): VegasEstimate;
    /**
     * The threshold estimate
     */
    get threshold(): VegasEstimate;
    /**
     * The limit increase function
     */
    get increase(): VegasEstimate;
    /**
     * The limit decrease function
     */
    get decrease(): VegasEstimate;
    /**
     * Update the maximum limit
     * @param max The maximum limit amount
     * @returns An updated {@link VegasLimitBuilder}
     */
    withMax(max: number): VegasLimitBuilder;
    /**
     * Update the smoothing ratio
     * @param smoothing The smoothing ratio
     * @returns An updated {@link VegasLimitBuilder}
     */
    withSmoothing(smoothing: number): VegasLimitBuilder;
    /**
     * Update the probe multiplier
     * @param multiplier The frequency of probe checks
     * @returns An updated {@link VegasLimitBuilder}
     */
    withProbeMultiplier(multiplier: number): VegasLimitBuilder;
    /**
     * Estimate using the alpha function
     * @param alpha The alpha estimate
     * @returns An updated {@link VegasLimitBuilder}
     */
    withAlpha(alpha: VegasEstimate): VegasLimitBuilder;
    /**
     * Estimate using the beta function
     * @param beta The beta estimate
     * @returns An updated {@link VegasLimitBuilder}
     */
    withBeta(beta: VegasEstimate): VegasLimitBuilder;
    /**
     * Checks the limit thresholds for change
     * @param threshold The limit threshold function
     * @returns An updated {@link VegasLimitBuilder}
     */
    withThreshold(threshold: VegasEstimate): VegasLimitBuilder;
    /**
     * Function to increase the limit
     * @param increase The limit increase function
     * @returns An updated {@link VegasLimitBuilder}
     */
    withIncrease(increase: VegasEstimate): VegasLimitBuilder;
    /**
     * Function to decrease the limit
     * @param decrease The limit decrease function
     * @returns An updated {@link VegasLimitBuilder}
     */
    withDecrease(decrease: VegasEstimate): VegasLimitBuilder;
    /**
     * Builds the limit algorithm
     * @returns A new {@link LimitAlgorithm}
     */
    build(): LimitAlgorithm;
}
/**
 * Creates a {@link LimitAlgorithm} that never changes size
 *
 * @param limit The concurrency limit
 * @returns A new {@link LimitAlgorithm}
 */
export declare function fixedLimit(limit: number): LimitAlgorithm;
/**
 * Creates a new {@link VegasLimitBuilder} for building the Vegas {@link LimitAlgorithm}
 *
 * @param limit The concurrency limit
 * @returns A new {@link VegasLimitBuilder} for building the {@link LimitAlgorithm}
 */
export declare function vegasBuilder(limit: number): VegasLimitBuilder;
