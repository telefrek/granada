/**
 * Custom time manipulations
 */

/**
 * Wait for a period of time
 *
 * @param milliseconds The amount of time to delay
 * @returns A {@link Promise} that will be scheduled after at least that many milliseconds
 */
export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * Custom class that tracks elapsed {@link Duration}
 */
export class Timer {
  running = false
  started = 0n
  stopped = 0n

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
      try {
        return Duration.fromNano(this.stopped - this.started)
      } finally {
        // Clear the timings
        this.started = 0n
        this.stopped = 0n
      }
    }

    return Duration.ZERO
  }

  /**
   * Check the current elapsed {@link Duration}
   *
   * @returns The {@link Duration} the timer has been running or {@link Duration.ZERO} if it was not started
   */
  elapsed(): Duration {
    return this.running
      ? Duration.fromNano(process.hrtime.bigint() - this.started)
      : Duration.ZERO
  }
}

/** Factors for translating nanoseconds -> microseconds */
const NANO_PER_SECOND = 1_000_000_000n
const MICRO_PER_SECOND = 1_000_000
const MICRO_PER_MILLI = 1_000

/**
 * Represents a duration of time
 */
export class Duration {
  #microseconds: number

  private constructor(nanoseconds: bigint) {
    this.#microseconds = Number((nanoseconds * 1_000_000n) / NANO_PER_SECOND)
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

  public toString(): string {
    return `${this.seconds()}`
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
  static fromMilli(milliseconds: number): Duration {
    return new Duration(BigInt(1_000_000 * milliseconds))
  }

  /**
   * Helper to identify an empty or zero time elapsed duration
   */
  static ZERO: Duration = Duration.fromNano(0n)
}

export class HiResClock {
  private static readonly INIT = process.hrtime.bigint()

  public static timestamp(): string {
    return Duration.fromNano(
      process.hrtime.bigint() - HiResClock.INIT,
    ).toString()
  }
}
