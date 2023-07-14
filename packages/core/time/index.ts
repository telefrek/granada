/**
 * Custom time manipulations
 */

/**
 * Custom class that tracks elapsed {@link Duration}
 */
export class Timer {

    running: boolean
    started: bigint = 0n
    stopped: bigint = 0n

    /**
     * Starts the timer
     */
    start(): void {
        if (!this.running) {
            this.started = process.hrtime.bigint()
            this.running = true
        }
    }

    /**
     * Stop the timer
     * 
     * @returns The {@link Duration} the timer was running or {@link Duration.ZERO} if it was not started
     */
    stop(): Duration {
        if (this.running) {
            this.stopped = process.hrtime.bigint()
            this.running = false
            return Duration.fromNano(this.stopped - this.started)
        }

        return Duration.ZERO
    }

    /**
     * Check the current elapsed {@link Duration}
     * 
     * @returns The {@link Duration} the timer has been running or {@link Duration.ZERO} if it was not started
     */
    elapsed(): Duration {
        return this.running ? Duration.fromNano(process.hrtime.bigint() - this.started) : Duration.ZERO
    }
}

/** Factors for translating nanoseconds -> microseconds */
const NANO_PER_SECOND = 1_000_000_000n

const NANO_TO_MICRO = 1_000_000n / NANO_PER_SECOND
const MICRO_PER_SECOND = 1_000_000

const MICRO_PER_MILLI = 1_000

/**
 * Represents a duration of time
 */
export class Duration {
    #microseconds: number

    private constructor(nanoseconds: bigint) {
        this.#microseconds = Number(nanoseconds * NANO_TO_MICRO)
    }

    /**
     * 
     * @returns The number of seconds with 6 decimal places for microsecond resolution
     */
    public seconds(): number {
        return this.#microseconds / MICRO_PER_SECOND
    }

    /**
     * 
     * @returns the number of milliseconds with 3 decimal places for microsecond resolution
     */
    public milliseconds(): number {
        return this.#microseconds / MICRO_PER_MILLI
    }

    /**
     * 
     * @returns The number of microseconds
     */
    public microseconds(): number {
        return this.#microseconds
    }

    /**
     * Create a {@link Duration} from the nanosecond measurement (from something like {@link process.hrtime.bigint()})
     * 
     * @param nanoseconds The number of nanoseconds elapsed
     * @returns A new {@link Duration} object
     */
    static fromNano(nanoseconds: bigint): Duration {
        return new Duration(nanoseconds)
    }

    /**
     * Create a {@link Duration} from the millisecond measurement (from something like {@link Date.now()})
     * 
     * @param milliseconds The number of milliseconds elapsed
     * @returns A new {@link Duration} object
     */
    static fromMill(milliseconds: number): Duration {
        return new Duration(BigInt(MICRO_PER_MILLI * milliseconds))
    }

    /**
     * Helper to identify an empty or zero time elapsed duration
     */
    static ZERO: Duration = Duration.fromNano(0n)
}