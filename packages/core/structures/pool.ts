/**
 * This package provides the basic building blocks for managing Pools of
 * resources (connections, handlers, etc.) along with some useful mechanisms
 * around timeouts, rebuilding and circuit breakers
 */

import { ValueType } from "@opentelemetry/api"
import {
  BreakerState,
  createBreaker,
  type CircuitBreaker,
  type CircuitBreakerOptions,
} from "../backpressure/circuits/breaker"
import { Signal } from "../concurrency/index"
import { type MaybeAwaitable } from "../index"
import { FRAMEWORK_METRICS_METER } from "../observability/metrics"
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
  /** The name of the pool to be used for instrumentation */
  name: string
  /** Default value is 1 */
  initialSize?: number
  /** Default value is 4 */
  maxSize?: number
}

const PoolMetrics = {
  PoolWaitTime: FRAMEWORK_METRICS_METER.createHistogram("pool.wait.time", {
    description:
      "Measures long a consumer waits for a pool item to be available",
    valueType: ValueType.DOUBLE,
    unit: "s",
  }),
  PoolSize: FRAMEWORK_METRICS_METER.createObservableGauge("pool.size", {
    description: "The current size of the pool",
    valueType: ValueType.INT,
  }),
  PoolRetrievalFailure: FRAMEWORK_METRICS_METER.createCounter(
    "pool.retrieval.failure",
    {
      description:
        "The number of times the pool was unable to provide an item under the timeout",
      valueType: ValueType.INT,
    },
  ),
} as const

/**
 * The abstract base class that implements the {@link Pool} with appropriate
 * circuit breakers and rate limiting on pool size to grow/shrink with the load
 */
export abstract class PoolBase<T> implements Pool<T> {
  #items: T[] = []
  #signal: Signal = new Signal()
  #circuit: CircuitBreaker
  #floatingLimit: number
  #size: number
  #maximum: number
  #name: string

  constructor(options: PoolOptions) {
    // Set the initial sizing parameters
    this.#maximum = Math.max(options.maxSize ?? 4, 2)

    // Start with half the maximum allowed
    this.#floatingLimit = this.#maximum >> 1

    // There are no items in the pool to start
    this.#size = 0

    // Create the circuit breaker
    this.#circuit = createBreaker(this, options)

    this.#name = options.name

    // Add the size callback
    PoolMetrics.PoolSize.addCallback((r) => {
      r.observe(this.size, { name: this.#name })
    })
  }

  get size(): number {
    return this.#size
  }

  static counter: number = 0

  get(): PoolItem<T>
  get(timeout: Duration): MaybeAwaitable<PoolItem<T>>
  get(timeout?: Duration): MaybeAwaitable<PoolItem<T>> {
    // Check to see if others are waiting, if so get in line
    if (this.#signal.waiting === 0) {
      // Try to get the next item from the available set
      const item = this.#items.shift()
      if (item) {
        // Return the item
        return new PoolBaseItem(item, this)
      }
    }

    // Check to see if they want to wait and our breaker is open
    if (timeout && this.#circuit.state !== BreakerState.OPEN) {
      if (this.#size < this.#floatingLimit) {
        this.#size++
        void this.#tryCreateItem().then(
          (success) => (this.#size += success ? 0 : -1),
        )
      }

      return this.#getNextItem(timeout)
    }

    // Fail the request since the caller doesn't want to wait
    throw new NoItemAvailableError("Unable to retrieve an item")
  }

  async #getNextItem(timeout: Duration): Promise<PoolItem<T>> {
    // Start a timer to track how long this takes
    const timer = Timer.startNew()

    const expires = Date.now() + timeout.milliseconds()
    while (Date.now() < expires) {
      // Wait for the signal to fire before trying again
      if (await this.#signal.wait(Duration.fromMilli(expires - Date.now()))) {
        // Due to the nature of process.nextTick() it is difficult to guarantee
        // this always is available, hence a check for the next item to ensure
        // we don't pass false items around
        const item = this.#items.shift()
        if (item) {
          PoolMetrics.PoolWaitTime.record(timer.stop().seconds(), {
            name: this.#name,
          })
          return new PoolBaseItem(item, this)
        }

        // Get back in line...
        continue
      }

      // Stop
      break
    }

    PoolMetrics.PoolRetrievalFailure.add(1, { name: this.#name })

    throw new NoItemAvailableError(
      "No item was available in the pool before the timeout",
    )
  }

  reclaim(item: PoolItem<T>, reason?: unknown): void {
    // Check if the item is still valid and we have room to keep it alive
    if (
      this.checkIfValid(item.item, reason) &&
      this.size <= this.#floatingLimit
    ) {
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

    this.#size--
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
