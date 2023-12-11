import { LimitAlgorithm, LimitedOperation, Limiter } from "."
import { Semaphore } from ".."
import { Timer } from "../../time"

/**
 * Base class for all implementations of the {@link Limiter}
 */
abstract class AbstractLimiter implements Limiter {
  #limitAlgorithm: LimitAlgorithm
  #limit: number
  #inFlight: number

  // Allow retrieving the internal limit
  get limit() {
    return this.#limit
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

    this.#limitAlgorithm = limitAlgorithm
    this.#limit = initialLimit
    this.#inFlight = 0

    this.#limitAlgorithm.on("changed", this.onChange.bind(this))
  }

  /**
   * @returns The current limit
   */
  getLimit(): number {
    return this.#limit
  }

  tryAcquire(): LimitedOperation | undefined {
    return
  }

  /**
   * Handler for the {@link LimitAlgorithm} `changed` event
   *
   * @param newLimit The new limit to use
   */
  protected onChange(newLimit: number) {
    this.#limit = newLimit
  }

  /**
   * Create a {@link LimitedOperation} to manipulate the state of the current {@link Limiter}
   *
   * @returns A basic {@link LimitedOperation}
   */
  protected createOperation(): LimitedOperation {
    return new this.AbstractLimitOperation(this)
  }

  /**
   * Base {@link LimitedOperation} that handles state tracking and mainpulation of the underlying {@link AbstractLimiter}
   */
  AbstractLimitOperation = class implements LimitedOperation {
    #limiter: AbstractLimiter
    #finished: boolean
    #timer: Timer
    #running: number

    /**
     * Requires the base {@link AbstractLimiter} which can be updated
     *
     * @param limiter The {@link AbstractLimiter} to update
     */
    constructor(limiter: AbstractLimiter) {
      this.#limiter = limiter
      this.#finished = false
      this.#running = ++limiter.#inFlight
      this.#timer = new Timer()
      this.#timer.start()
    }

    success(): void {
      this.#update()
      this.#limiter.#limitAlgorithm.update(
        this.#timer.stop(),
        this.#running,
        false,
      )
    }

    ignore(): void {
      this.#update()
    }

    dropped(): void {
      this.#update()
      this.#limiter.#limitAlgorithm.update(
        this.#timer.stop(),
        this.#running,
        true,
      )
    }

    /**
     * Private method to update the finished state and limiter inFlight value
     */
    #update(): void {
      // Ensure we only finish this once for any state
      if (!this.#finished) {
        this.#finished = true
        this.#limiter.#inFlight--
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
  #semaphore: Semaphore

  /**
   * SimpleLimiter requires at least a {@link LimitAlgorithm} and optional limit (default is 1)
   *
   * @param limitAlgorithm The {@link LimitAlgorithm} to use
   * @param initialLimit The optional initial limit (default is 1)
   */
  constructor(limitAlgorithm: LimitAlgorithm, initialLimit = 1) {
    super(limitAlgorithm, initialLimit)

    this.#semaphore = new Semaphore(initialLimit)
  }

  override tryAcquire(): LimitedOperation | undefined {
    // Use the non-blocking version
    if (this.#semaphore.tryAcquire()) {
      return new this.SimpleLimitedOperation(
        this.#semaphore,
        this.createOperation(),
      )
    }
  }

  protected override onChange(newLimit: number): void {
    // Resize the semaphore
    this.#semaphore.resize(newLimit)

    // Propogate the change
    super.onChange(newLimit)
  }

  /**
   * Wrapped {@link LimitedOperation} for releasing the internal {@link Semaphore}
   */
  SimpleLimitedOperation = class implements LimitedOperation {
    #delegate: LimitedOperation
    #semaphore: Semaphore

    /**
     * Requires the objects to manage as internal state
     *
     * @param semaphore The {@link Semaphore} to release
     * @param delegate The {@link LimitedOperation} to delegate to
     */
    constructor(semaphore: Semaphore, delegate: LimitedOperation) {
      this.#delegate = delegate
      this.#semaphore = semaphore
    }

    success(): void {
      this.#semaphore.release()
      this.#delegate.success()
    }

    ignore(): void {
      this.#semaphore.release()
      this.#delegate.ignore()
    }

    dropped(): void {
      this.#semaphore.release()
      this.#delegate.dropped()
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
