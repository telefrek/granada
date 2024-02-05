/**
 * Custom time manipulations
 */
/**
 * Wait for a period of time
 *
 * @param milliseconds The amount of time to delay
 * @returns A {@link Promise} that will be scheduled after at least that many milliseconds
 */
export declare function delay(milliseconds: number): Promise<void>;
/**
 * Custom class that tracks elapsed {@link Duration}
 */
export declare class Timer {
    running: boolean;
    started: bigint;
    stopped: bigint;
    /**
     * Starts the timer
     */
    start(): void;
    /**
     * Stop the timer
     *
     * @returns The {@link Duration} the timer was running or {@link Duration.ZERO} if it was not started
     */
    stop(): Duration;
    /**
     * Check the current elapsed {@link Duration}
     *
     * @returns The {@link Duration} the timer has been running or {@link Duration.ZERO} if it was not started
     */
    elapsed(): Duration;
}
/**
 * Represents a duration of time
 */
export declare class Duration {
    #private;
    private constructor();
    /**
     *
     * @returns The number of seconds with 6 decimal places for microsecond resolution
     */
    seconds(): number;
    /**
     *
     * @returns the number of milliseconds with 3 decimal places for microsecond resolution
     */
    milliseconds(): number;
    /**
     *
     * @returns The number of microseconds
     */
    microseconds(): number;
    /**
     * Create a {@link Duration} from the nanosecond measurement (from something like {@link process.hrtime.bigint()})
     *
     * @param nanoseconds The number of nanoseconds elapsed
     * @returns A new {@link Duration} object
     */
    static fromNano(nanoseconds: bigint): Duration;
    /**
     * Create a {@link Duration} from the millisecond measurement (from something like {@link Date.now()})
     *
     * @param milliseconds The number of milliseconds elapsed
     * @returns A new {@link Duration} object
     */
    static fromMilli(milliseconds: number): Duration;
    /**
     * Helper to identify an empty or zero time elapsed duration
     */
    static ZERO: Duration;
}
