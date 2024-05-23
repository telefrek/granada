import { Semaphore } from "../concurrency.js"
import type { MaybeAwaitable } from "../index.js"
import { Timestamp, type Duration } from "../time.js"
import { type Optional } from "../type/utils.js"
import { LimitAlgorithm, LimitedOperation, Limiter } from "./limits.js"

/**
 * Base class for all implementations of the {@link Limiter}
 */
abstract class AbstractLimiter implements Limiter {
  protected _limitAlgorithm: LimitAlgorithm
  protected _limit: number
  protected _inFlight: number

  // Allow retrieving the internal limit
  get limit() {
    return this._limit
  }

  /**
   * Base constructor for all {@link Limiter} abstractions built from this class
   *
   * @param limitAlgorithm The {@link LimitAlgorithm} to utilize
   * @param initialLimit The initial limit
   */
  constructor(limitAlgorithm: LimitAlgorithm, initialLimit: number) {
    if (initialLimit <= 0) {
      throw new Error(`Invalid initialLimit: ${initialLimit}`)
    }

    this._limitAlgorithm = limitAlgorithm
    this._limit = initialLimit
    this._inFlight = 0

    this._limitAlgorithm.on("changed", this.onChange.bind(this))
  }

  /**
   * @returns The current limit
   */
  getLimit(): number {
    return this._limit
  }

  abstract tryAcquire(): Optional<LimitedOperation>

  abstract acquire(): MaybeAwaitable<LimitedOperation>
  abstract acquire(
    timeout: Duration,
  ): MaybeAwaitable<Optional<LimitedOperation>>

  /**
   * Handler for the {@link LimitAlgorithm} `changed` event
   *
   * @param newLimit The new limit to use
   */
  protected onChange(newLimit: number) {
    this._limit = newLimit
  }

  /**
   * Create a {@link LimitedOperation} to manipulate the state of the current {@link Limiter}
   *
   * @returns A basic {@link LimitedOperation}
   */
  protected createOperation(): LimitedOperation {
    return new this.DefaultLimitOperation(this)
  }

  /**
   * Base {@link LimitedOperation} that handles state tracking and mainpulation of the underlying {@link AbstractLimiter}
   */
  DefaultLimitOperation = class implements LimitedOperation {
    private _limiter: AbstractLimiter
    private _finished: boolean
    private _timestamp: Timestamp
    private _running: number

    /**
     * Requires the base {@link AbstractLimiter} which can be updated
     *
     * @param limiter The {@link AbstractLimiter} to update
     * @param onFinish The {@link EmptyCallback} to fire when completed
     */
    constructor(limiter: AbstractLimiter) {
      this._limiter = limiter
      this._finished = false
      this._running = ++limiter._inFlight
      this._timestamp = new Timestamp()
    }

    success(): void {
      this._update()
      this._limiter._limitAlgorithm.update(
        this._timestamp.duration,
        this._running,
        false,
      )
    }

    ignore(): void {
      this._update()
    }

    dropped(): void {
      this._update()
      this._limiter._limitAlgorithm.update(
        this._timestamp.duration,
        this._running,
        true,
      )
    }

    /**
     * Private method to update the finished state and limiter inFlight value
     */
    private _update(): void {
      // Ensure we only finish this once for any state
      if (!this._finished) {
        this._finished = true
        this._limiter._inFlight--
      } else {
        throw new Error("This operation has already been finished!")
      }
    }
  }
}

/**
 * Simple {@link Limiter} that uses a {@link Semaphore} to gate access
 */
class SimpleLimiter extends AbstractLimiter {
  private _semaphore: Semaphore

  /**
   * SimpleLimiter requires at least a {@link LimitAlgorithm} and optional limit (default is 1)
   *
   * @param limitAlgorithm The {@link LimitAlgorithm} to use
   * @param initialLimit The optional initial limit (default is 1)
   */
  constructor(limitAlgorithm: LimitAlgorithm, initialLimit = 1) {
    super(limitAlgorithm, initialLimit)

    this._semaphore = new Semaphore(initialLimit)
  }

  override tryAcquire(): Optional<LimitedOperation> {
    // Use the non-blocking version
    if (this._semaphore.tryAcquire()) {
      return new this.SimpleLimitedOperation(
        this._semaphore,
        this.createOperation(),
      )
    }

    return
  }

  override acquire(): Promise<LimitedOperation>
  override acquire(timeout: Duration): Promise<Optional<LimitedOperation>>
  override async acquire(
    timeout?: Duration,
  ): Promise<Optional<LimitedOperation>> {
    if (this._semaphore.acquire(timeout)) {
      return new this.SimpleLimitedOperation(
        this._semaphore,
        this.createOperation(),
      )
    }

    return
  }

  protected override onChange(newLimit: number): void {
    // Resize the semaphore
    this._semaphore.resize(newLimit)

    // Propogate the change
    super.onChange(newLimit)
  }

  /**
   * Wrapped {@link LimitedOperation} for releasing the internal {@link Semaphore}
   */
  SimpleLimitedOperation = class implements LimitedOperation {
    private _delegate: LimitedOperation
    private _semaphore: Semaphore

    /**
     * Requires the objects to manage as internal state
     *
     * @param semaphore The {@link Semaphore} to release
     * @param delegate The {@link LimitedOperation} to delegate to
     */
    constructor(semaphore: Semaphore, delegate: LimitedOperation) {
      this._delegate = delegate
      this._semaphore = semaphore
    }

    success(): void {
      this._semaphore.release()
      this._delegate.success()
    }

    ignore(): void {
      this._semaphore.release()
      this._delegate.ignore()
    }

    dropped(): void {
      this._semaphore.release()
      this._delegate.dropped()
    }
  }
}

/**
 * Create a simple {@link Limiter} using a {@link Semaphore} as the backing limit
 *
 * @param limitAlgorithm The {@link LimitAlgorithm} to use
 * @param initialLimit The initial limit value to use (default is 1)
 * @returns A newly initialized {@link Limiter}
 */
export function simpleLimiter(
  limitAlgorithm: LimitAlgorithm,
  initialLimit = 1,
): Limiter {
  return new SimpleLimiter(limitAlgorithm, initialLimit)
}
