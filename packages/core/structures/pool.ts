/**
 * This package provides the basic building blocks for managing Pools of
 * resources (connections, handlers, etc.) along with some useful mechanisms
 * around timeouts, rebuilding and circuit breakers
 */

import {
  BreakerState,
  createBreaker,
  type CircuitBreaker,
  type CircuitBreakerOptions,
} from "../backpressure/circuits/breaker"
import { vegasBuilder } from "../backpressure/limits/algorithms"
import { type LimitAlgorithm } from "../backpressure/limits/index"
import { Signal } from "../concurrency/index"
import { asPromise, type MaybeAwaitable } from "../index"
import { Duration, Timer } from "../time/index"

/**
 * Custom error raised when there is no value available in the {@link Pool}
 */
export class NoItemAvailableError extends Error {
  constructor(message?: string) {
    super(message)
  }
}

/**
 * Represents an item that is returned by a {@link Pool}
 */
export interface PoolItem<T> extends Disposable {
  /** The underlying item */
  readonly item: T

  /**
   * Release the item back to it's pool
   *
   * @param reason The reason the item is being released
   */
  release(reason?: unknown): void
}

/**
 * Represents a generic pool
 */
export interface Pool<T> {
  /** Get the current size of the pool */
  readonly size: number

  /**
   * Check to see if the pool has an item available for immediate use
   */
  available(): boolean

  /**
   * Try to get another item from the pool immediately
   */
  get(): PoolItem<T>

  /**
   * Try to get another item from the pool, waiting up to the timeout duration
   *
   * @param timeout The amount of time the caller can wait
   */
  get(timeout: Duration): MaybeAwaitable<PoolItem<T>>

  /**
   * Reclaim the item for the pool
   *
   * @param item The {@link PoolItem} to return to the pool
   * @param reason The reason the item was reclaimed in case of errors
   */
  reclaim(item: PoolItem<T>, reason?: unknown): void
}

export interface PoolOptions extends CircuitBreakerOptions {
  /** Default value is 1 */
  initialSize?: number
  /** Default value is 4 */
  maxSize?: number
}

/**
 * The abstract base class that implements the {@link Pool} with appropriate
 * circuit breakers and rate limiting on pool size to grow/shrink with the load
 */
export abstract class PoolBase<T> implements Pool<T> {
  protected currentSize: number = 0

  #items: T[] = []
  #signal: Signal = new Signal()
  #algorithm: LimitAlgorithm
  #circuit: CircuitBreaker
  #size: number
  #maximum: number

  constructor(options: PoolOptions) {
    // Set the initial sizing parameters
    this.#maximum = Math.max(options.maxSize ?? 4, 2)

    // Start with half the maximum allowed
    this.#size = this.#maximum >> 1

    // Setup the limit algorithm and allow it to scale to max-1 (we need at
    // least one connection to work...)
    this.#algorithm = vegasBuilder(this.#size)
      .withMax(this.#maximum - 1)
      .build()

    /**
     * Calcluate the new limit based on the maximum size subtracting the new limit
     *
     * @param newLimit The updated limit
     */
    const updateLimit = (newLimit: number) => {
      // We get the max - the limit calculated so far
      //this.#size = this.#maximum - newLimit

      console.log(`updating limit... ${newLimit}`)
    }

    this.#algorithm.on("changed", updateLimit)

    // Create the circuit breaker
    this.#circuit = createBreaker(this, options)
  }

  get size(): number {
    return this.currentSize
  }

  available(): boolean {
    return this.#items.length > 0
  }

  static counter: number = 0

  get(): PoolItem<T>
  get(timeout: Duration): MaybeAwaitable<PoolItem<T>>
  get(timeout?: Duration): MaybeAwaitable<PoolItem<T>> {
    // Start a timer
    const timer = new Timer()

    // Try to get an item if it already exists
    const item = this.#items.shift()
    if (item) {
      // We have too many connections open, indicate a drop
      this.#algorithm.update(timer.stop(), this.currentSize, true)

      // Return the item
      return new PoolBaseItem(item, this)
    }

    // Check to see if they want to wait and our breaker is open
    if (timeout && this.#circuit.state !== BreakerState.OPEN) {
      try {
        return asPromise(this.#signal.wait(timeout)).then((success) => {
          if (success) {
            const item = this.#items.shift()
            if (!item) {
              console.trace("failed") /// WTF...
            } else {
              return new PoolBaseItem(item, this)
            }
          } else {
            this.#algorithm.update(timer.stop(), this.currentSize, false)
          }

          throw new NoItemAvailableError(
            "Unable to retrieve an item before timeout",
          )
        })
      } finally {
        if (this.currentSize < this.#size) {
          // Start another thread to try and create a connection
          this.currentSize++

          void this.#tryCreateItem().then((created) => {
            // If we didn't create it roll back the count
            if (!created) {
              this.currentSize--
            }
          })
        }
      }
    }

    console.log(`Breaker status: ${this.#circuit.state}`)

    // Fail the request since the caller doesn't want to wait
    throw new NoItemAvailableError("Unable to retrieve an item")
  }

  reclaim(item: PoolItem<T>, reason?: unknown): void {
    // Check if the item is still valid and we have room to keep it alive
    if (this.checkIfValid(item.item, reason) && this.currentSize <= this.size) {
      this.#addToPool(item.item)
    } else {
      this.#destroyItem(item.item)
    }
  }

  #addToPool(item: T): void {
    // Add the item back to the pool
    this.#items.push(item)

    // Notify the next waiter that we are ready for them
    this.#signal.notify()
  }

  #destroyItem(item: T): void {
    try {
      this.recycleItem(item)
    } catch {
      // Swallow the errors for now
    }

    this.currentSize--
  }

  async #tryCreateItem(): Promise<boolean> {
    try {
      // Create the item and add it to the pool
      const newItem = await this.#circuit.invoke(this.createItem)
      this.#addToPool(newItem)
    } catch (err) {
      return false
    }

    return true
  }

  /**
   * Allows the implementation to check for bad item states
   *
   * @param item The item
   * @param reason The reason the item was reclaimed
   */
  abstract checkIfValid(item: T, reason?: unknown): boolean

  /**
   * Allows the implementation to release any resources associated with the item
   *
   * @param item The item to recycle
   */
  abstract recycleItem(item: T): void

  /**
   * Creates a new item for the pool
   *
   * @returns The new item
   */
  abstract createItem(): MaybeAwaitable<T>
}

/**
 * Default implementation of a {@link PoolItem} that handles
 * returning to the {@link PoolBase}
 */
class PoolBaseItem<T> implements PoolItem<T> {
  readonly #item: T
  readonly #pool: PoolBase<T>

  get item(): T {
    return this.#item
  }

  constructor(item: T, pool: PoolBase<T>) {
    this.#item = item
    this.#pool = pool
  }

  [Symbol.dispose](): void {
    this.release()
  }

  release(reason?: unknown): void {
    this.#pool.reclaim(this, reason)
  }
}
