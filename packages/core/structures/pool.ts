/**
 * This package provides the basic building blocks for managing Pools of
 * resources (connections, handlers, etc.) along with some useful mechanisms
 * around timeouts, rebuilding and circuit breakers
 */

import { ValueType, type Attributes } from "@opentelemetry/api"
import {
  BreakerState,
  createBreaker,
  type CircuitBreaker,
  type CircuitBreakerOptions,
} from "../backpressure/circuits/breaker"
import { Signal } from "../concurrency/index"
import { type MaybeAwaitable } from "../index"
import { GRANADA_METRICS_METER } from "../observability/metrics"
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
  getNow(): PoolItem<T> | undefined

  /**
   * Get the next item from the pool, waiting up to the default timeout
   */
  get(): MaybeAwaitable<PoolItem<T>>

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

  /**
   * Release any held connections
   */
  shutdown(): MaybeAwaitable<void>
}

export interface PoolOptions extends CircuitBreakerOptions {
  /** The name of the pool to be used for instrumentation */
  name: string
  /** The initial size of the pool (Default value is 1) */
  initialSize?: number
  /** The maximum size of the pool (Default value is 4) */
  maximumSize?: number
  /** Successive cache hits before scale in (Default is 25) */
  scaleInThreshold?: number
  /** Flag to indicate if pool resources should be pre-allocated (Default is false) */
  lazyCreation?: boolean
  /** The default timeout milliseconds if no timeout specified (Default is 60 seconds) */
  defaultTimeoutMs?: number
}

const PoolMetrics = {
  PoolWaitTime: GRANADA_METRICS_METER.createHistogram("pool_wait_time", {
    description:
      "Measures long a consumer waits for a pool item to be available",
    valueType: ValueType.DOUBLE,
    unit: "s",
  }),
  PoolSize: GRANADA_METRICS_METER.createObservableGauge("pool_size", {
    description: "The current size of the pool",
    valueType: ValueType.INT,
  }),
  PoolRetrievalFailure: GRANADA_METRICS_METER.createCounter(
    "pool_retrieval_failure",
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
  #scaleInTolerance
  #hits: number = 0
  #attributes: Attributes
  #defaultTimeout: Duration
  #shutdown: boolean = false

  constructor(options: PoolOptions) {
    // Set the initial sizing parameters
    this.#maximum = Math.max(options.maximumSize ?? 4, 2)

    // Start with half the maximum allowed
    this.#floatingLimit = Math.max(options.initialSize ?? 1, 1)

    // Get the scale in tolerance value
    this.#scaleInTolerance = Math.max(options.scaleInThreshold ?? 25, 1)

    // There are no items in the pool to start
    this.#size = 0

    // Set the default timeout
    this.#defaultTimeout = Duration.fromMilli(
      Math.max(options.defaultTimeoutMs ?? 60_000, 1),
    )

    // Create the circuit breaker
    this.#circuit = createBreaker(this, options)

    this.#attributes = { name: options.name }

    // Add the size callback
    PoolMetrics.PoolSize.addCallback((r) => {
      r.observe(this.size, this.#attributes)
    })

    // Don't wait and do lazy creation
    if (options.lazyCreation) {
      for (let n = 0; n < this.#floatingLimit; ++n) {
        void this.#tryCreateItem()
      }
    }
  }

  get size(): number {
    return this.#size
  }

  static counter: number = 0

  getNow(): PoolItem<T> | undefined {
    // Check to see if others are waiting, if so get in line
    if (this.#signal.waiting === 0) {
      // Try to get the next item from the available set
      const item = this.#items.shift()
      if (item) {
        // If our tolerance
        if (++this.#hits > this.#scaleInTolerance) {
          this.#floatingLimit = Math.max(1, this.#floatingLimit - 1)
          this.#hits = 0
        }

        // Return the item
        return new PoolBaseItem(item, this)
      }
    }

    return
  }

  get(): MaybeAwaitable<PoolItem<T>>
  get(timeout: Duration): MaybeAwaitable<PoolItem<T>>
  get(timeout?: Duration): MaybeAwaitable<PoolItem<T>> {
    // Check to see if others are waiting, if so get in line
    if (this.#signal.waiting === 0) {
      // Try to get the next item from the available set
      const item = this.#items.shift()
      if (item) {
        // If our tolerance
        if (++this.#hits > this.#scaleInTolerance) {
          this.#floatingLimit = Math.max(1, this.#floatingLimit - 1)
          this.#hits = 0
        }

        PoolMetrics.PoolWaitTime.record(0.0001, this.#attributes)

        // Return the item
        return new PoolBaseItem(item, this)
      }
    }

    // Reset the tolerance
    this.#hits = 0

    // Check to see if they want to wait and our breaker is open
    if (this.#circuit.state !== BreakerState.OPEN) {
      if (this.#size < this.#floatingLimit) {
        void this.#tryCreateItem()
      }
      return this.#getNextItem(timeout ?? this.#defaultTimeout)
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
        // Try to shift the value off though because we rely on promises (which
        // also use process.nextTick() that our signals do) this might have been
        // stolen in the main get.
        const item = this.#items.shift()
        if (item) {
          PoolMetrics.PoolWaitTime.record(
            timer.stop().seconds(),
            this.#attributes,
          )
          return new PoolBaseItem(item, this)
        }

        // Get back in line...
        continue
      }

      // Stop
      break
    }

    // Test if we can raise our floating limit
    if (this.#floatingLimit < this.#maximum) {
      this.#floatingLimit++

      // Try to create an item
      if (await this.#tryCreateItem()) {
        const item = this.#items.shift()
        if (item) {
          if (item) {
            PoolMetrics.PoolWaitTime.record(
              timer.stop().seconds(),
              this.#attributes,
            )
            return new PoolBaseItem(item, this)
          }
        }
      } else {
        this.#floatingLimit--
      }
    }

    PoolMetrics.PoolRetrievalFailure.add(1, this.#attributes)

    throw new NoItemAvailableError(
      "No item was available in the pool before the timeout",
    )
  }

  reclaim(item: PoolItem<T>, reason?: unknown): void {
    // Check if the item is still valid and we have room to keep it alive
    if (
      !this.#shutdown &&
      this.checkIfValid(item.item, reason) &&
      this.size <= this.#floatingLimit
    ) {
      this.#addToPool(item.item)
    } else {
      this.#destroyItem(item.item)
    }
  }

  shutdown(): MaybeAwaitable<void> {
    this.#shutdown = true

    while (this.#items.length > 0) {
      this.#destroyItem(this.#items.shift()!)
    }

    return
  }

  /**
   * Add the item to the pool and signal anyone waiting
   *
   * @param item The item to add to the pool
   */
  #addToPool(item: T): void {
    // Add the item back to the pool
    this.#items.push(item)

    // Notify the next waiter that we are ready for them
    this.#signal.notify()
  }

  /**
   * Destroy the item and decrement the size
   *
   * @param item The item to recycle
   */
  #destroyItem(item: T): void {
    try {
      this.recycleItem(item)
    } catch {
      // Swallow the errors for now
    }

    this.#size--
  }

  async #tryCreateItem(): Promise<boolean> {
    // Don't provision any new work
    if (this.#shutdown) {
      return false
    }

    try {
      // Create the item and add it to the pool
      const newItem = await this.#circuit.invoke(this.createItem)
      this.#addToPool(newItem)
      this.#size++
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

  [Symbol.dispose]() {
    this.release()
  }

  release(reason?: unknown): void {
    this.#pool.reclaim(this, reason)
  }
}
