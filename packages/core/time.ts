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
   * Start a new timer
   *
   * @returns A new {@link Timer} that has been started
   */
  public static startNew(): Timer {
    const timer = new Timer()
    timer.start()
    return timer
  }

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
        return Duration.ofNano(this.stopped - this.started)
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
      ? Duration.ofNano(process.hrtime.bigint() - this.started)
      : Duration.ZERO
  }
}

/**
 * Simple timestamp class to track timings at sub millisecond precision
 */
export class Timestamp {
  private static OFFSET: Timestamp = new Timestamp(process.hrtime.bigint())
  private static START_UTC: number = Date.now()

  private _hiRes: boolean
  private _value: bigint | number

  /**
   * Check to see if the timestamp is higher resolution (microsecond/nanosecond available)
   */
  get isHighResolution(): boolean {
    return this._hiRes
  }

  /**
   * Calculate the difference between the start and end
   *
   * @param begin The starting {@link Timestamp}
   * @param end The ending {@link Timestamp}
   * @returns The {@link Duration} between the stamps or {@link Duration.ZERO}
   * if negative
   */
  static duration(begin: Timestamp, end: Timestamp): Duration {
    return begin.difference(end)
  }

  constructor(timestamp: bigint | number = Date.now()) {
    this._hiRes = typeof timestamp === "bigint"
    this._value = timestamp
  }

  /**
   * Calculate the difference between these two timestamps
   *
   * @param other The other {@link Timestamp} to calculate the difference between
   * @returns The {@link Duration} between the two timestamps
   */
  difference(other: Timestamp): Duration {
    const currentNano = this._hiRes
      ? (this._value as bigint)
      : BigInt(this._value) * 1_000_000n
    const otherNano = other._hiRes
      ? (other._value as bigint)
      : BigInt(other._value) * 1_000_000n

    if (otherNano <= currentNano) {
      return Duration.ZERO
    }

    return Duration.ofNano(otherNano - currentNano)
  }

  /**
   *
   * @returns The {@link Timestamp} in ISO format
   */
  toISOString() {
    return new Date(
      Timestamp.START_UTC + ~~Timestamp.OFFSET.difference(this).milliseconds(),
    ).toISOString()
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
  private _microseconds: number

  private constructor(nanoseconds: bigint) {
    this._microseconds = Number((nanoseconds * 1_000_000n) / NANO_PER_SECOND)
  }

  /**
   *
   * @returns The number of seconds with 6 decimal places for microsecond resolution
   */
  public seconds(): number {
    return this._microseconds / MICRO_PER_SECOND
  }

  /**
   *
   * @returns the number of milliseconds with 3 decimal places for microsecond resolution
   */
  public milliseconds(): number {
    return this._microseconds / MICRO_PER_MILLI
  }

  /**
   *
   * @returns The number of microseconds
   */
  public microseconds(): number {
    return this._microseconds
  }

  /**
   *
   * @returns The {@link Duration} formatted as seconds
   */
  public toString(): string {
    return `${this.seconds()}`
  }

  /**
   * Create a {@link Duration} from the nanosecond measurement (from something like {@link process.hrtime.bigint()})
   *
   * @param nanoseconds The number of nanoseconds elapsed
   * @returns A new {@link Duration} object
   */
  static ofNano(nanoseconds: bigint): Duration {
    return new Duration(nanoseconds)
  }

  /**
   * Create a {@link Duration} from the millisecond measurement (from something like {@link Date.now()})
   *
   * @param milliseconds The number of milliseconds elapsed
   * @returns A new {@link Duration} object
   */
  static ofMilli(milliseconds: number): Duration {
    return new Duration(1_000_000n * BigInt(milliseconds))
  }

  /**
   * Create a {@link Duration} from the second measurement
   *
   * @param seconds The number of seconds elapsed
   * @returns A new {@link Duration} object
   */
  static ofSeconds(seconds: number): Duration {
    return new Duration(1_000_000_000n * BigInt(seconds))
  }

  /**
   * Helper to identify an empty or zero time elapsed duration
   */
  static ZERO: Duration = Duration.ofNano(0n)
}

/**
 * A clock that can be used to track time at sub-millisecond precision
 */
export class HiResClock {
  /**
   *
   * @returns The current {@link Timestamp}
   */
  public static timestamp(): Timestamp {
    return new Timestamp(process.hrtime.bigint())
  }
}
