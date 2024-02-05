"use strict";
/**
 * Custom time manipulations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Duration = exports.Timer = exports.delay = void 0;
/**
 * Wait for a period of time
 *
 * @param milliseconds The amount of time to delay
 * @returns A {@link Promise} that will be scheduled after at least that many milliseconds
 */
function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
exports.delay = delay;
/**
 * Custom class that tracks elapsed {@link Duration}
 */
class Timer {
    running = false;
    started = 0n;
    stopped = 0n;
    /**
     * Starts the timer
     */
    start() {
        if (!this.running) {
            this.started = process.hrtime.bigint();
            this.running = true;
        }
    }
    /**
     * Stop the timer
     *
     * @returns The {@link Duration} the timer was running or {@link Duration.ZERO} if it was not started
     */
    stop() {
        if (this.running) {
            this.stopped = process.hrtime.bigint();
            this.running = false;
            try {
                return Duration.fromNano(this.stopped - this.started);
            }
            finally {
                // Clear the timings
                this.started = 0n;
                this.stopped = 0n;
            }
        }
        return Duration.ZERO;
    }
    /**
     * Check the current elapsed {@link Duration}
     *
     * @returns The {@link Duration} the timer has been running or {@link Duration.ZERO} if it was not started
     */
    elapsed() {
        return this.running
            ? Duration.fromNano(process.hrtime.bigint() - this.started)
            : Duration.ZERO;
    }
}
exports.Timer = Timer;
/** Factors for translating nanoseconds -> microseconds */
const NANO_PER_SECOND = 1000000000n;
const MICRO_PER_SECOND = 1_000_000;
const MICRO_PER_MILLI = 1_000;
/**
 * Represents a duration of time
 */
class Duration {
    #microseconds;
    constructor(nanoseconds) {
        this.#microseconds = Number((nanoseconds * 1000000n) / NANO_PER_SECOND);
    }
    /**
     *
     * @returns The number of seconds with 6 decimal places for microsecond resolution
     */
    seconds() {
        return this.#microseconds / MICRO_PER_SECOND;
    }
    /**
     *
     * @returns the number of milliseconds with 3 decimal places for microsecond resolution
     */
    milliseconds() {
        return this.#microseconds / MICRO_PER_MILLI;
    }
    /**
     *
     * @returns The number of microseconds
     */
    microseconds() {
        return this.#microseconds;
    }
    /**
     * Create a {@link Duration} from the nanosecond measurement (from something like {@link process.hrtime.bigint()})
     *
     * @param nanoseconds The number of nanoseconds elapsed
     * @returns A new {@link Duration} object
     */
    static fromNano(nanoseconds) {
        return new Duration(nanoseconds);
    }
    /**
     * Create a {@link Duration} from the millisecond measurement (from something like {@link Date.now()})
     *
     * @param milliseconds The number of milliseconds elapsed
     * @returns A new {@link Duration} object
     */
    static fromMilli(milliseconds) {
        return new Duration(BigInt(1_000_000 * milliseconds));
    }
    /**
     * Helper to identify an empty or zero time elapsed duration
     */
    static ZERO = Duration.fromNano(0n);
}
exports.Duration = Duration;
