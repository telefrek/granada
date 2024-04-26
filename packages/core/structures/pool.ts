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
} from "../backpressure/circuits/breaker.js"
import { Signal } from "../concurrency.js"
import { type MaybeAwaitable } from "../index.js"
import { getGranadaMeter } from "../observability/metrics.js"
import { Duration, Timer } from "../time.js"
import type { Optional } from "../type/utils.js"

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
  getNow(): Optional<PoolItem<T>>

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
  PoolWaitTime: getGranadaMeter().createHistogram("pool_wait_time", {
    description:
      "Measures long a consumer waits for a pool item to be available",
    valueType: ValueType.DOUBLE,
    unit: "s",
    advice: {
      explicitBucketBoundaries: [
        0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.5, 1,
      ],
    },
  }),
  PoolSize: getGranadaMeter().createObservableGauge("pool_size", {
    description: "The current size of the pool",
    valueType: ValueType.INT,
  }),
  PoolRetrievalFailure: getGranadaMeter().createCounter(
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
  _items: T[] = []
  _signal: Signal = new Signal()
  _circuit: CircuitBreaker
  _floatingLimit: number
  _size: number
  _maximum: number
  _scaleInTolerance
  _hits: number = 0
  _attributes: Attributes
  _defaultTimeout: Duration
  _shutdown: boolean = false

  constructor(options: PoolOptions) {
    // Set the initial sizing parameters
    this._maximum = Math.max(options.maximumSize ?? 4, 2)

    // Start with half the maximum allowed
    this._floatingLimit = Math.max(options.initialSize ?? 1, 1)

    // Get the scale in tolerance value
    this._scaleInTolerance = Math.max(options.scaleInThreshold ?? 25, 1)

    // There are no items in the pool to start
    this._size = 0

    // Set the default timeout
    this._defaultTimeout = Duration.ofMilli(
      Math.max(options.defaultTimeoutMs ?? 60_000, 1),
    )

    // Create the circuit breaker
    this._circuit = createBreaker(this, options)

    this._attributes = { name: options.name }

    // Add the size callback
    PoolMetrics.PoolSize.addCallback((r) => {
      r.observe(this.size, this._attributes)
    })

    // Don't wait and do lazy creation
    if (options.lazyCreation) {
      for (let n = 0; n < this._floatingLimit; ++n) {
        void this._tryCreateItem()
      }
    }
  }

  get size(): number {
    return this._size
  }

  static counter: number = 0

  getNow(): Optional<PoolItem<T>> {
    // Check to see if others are waiting, if so get in line
    if (this._signal.waiting === 0) {
      // Try to get the next item from the available set
      const item = this._items.shift()
      if (item) {
        // If our tolerance
        if (++this._hits > this._scaleInTolerance) {
          this._floatingLimit = Math.max(1, this._floatingLimit - 1)
          this._hits = 0
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
    if (this._signal.waiting === 0) {
      // Try to get the next item from the available set
      const item = this._items.shift()
      if (item) {
        // If our tolerance
        if (++this._hits > this._scaleInTolerance) {
          this._floatingLimit = Math.max(1, this._floatingLimit - 1)
          this._hits = 0
        }

        PoolMetrics.PoolWaitTime.record(0.0001, this._attributes)

        // Return the item
        return new PoolBaseItem(item, this)
      }
    }

    // Reset the tolerance
    this._hits = 0

    // Check to see if they want to wait and our breaker is open
    if (this._circuit.state !== BreakerState.OPEN) {
      if (this._size < this._floatingLimit) {
        void this._tryCreateItem()
      }
      return this._getNextItem(timeout ?? this._defaultTimeout)
    }

    // Fail the request since the caller doesn't want to wait
    throw new NoItemAvailableError("Unable to retrieve an item")
  }

  async _getNextItem(timeout: Duration): Promise<PoolItem<T>> {
    // Start a timer to track how long this takes
    const timer = Timer.startNew()

    const expires = Date.now() + timeout.milliseconds()
    while (Date.now() < expires) {
      // Wait for the signal to fire before trying again
      if (await this._signal.wait(Duration.ofMilli(expires - Date.now()))) {
        // Try to shift the value off though because we rely on promises (which
        // also use process.nextTick() that our signals do) this might have been
        // stolen in the main get.
        const item = this._items.shift()
        if (item) {
          PoolMetrics.PoolWaitTime.record(
            timer.stop().seconds(),
            this._attributes,
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
    if (this._floatingLimit < this._maximum) {
      this._floatingLimit++

      // Try to create an item
      if (await this._tryCreateItem()) {
        const item = this._items.shift()
        if (item) {
          if (item) {
            PoolMetrics.PoolWaitTime.record(
              timer.stop().seconds(),
              this._attributes,
            )
            return new PoolBaseItem(item, this)
          }
        }
      } else {
        this._floatingLimit--
      }
    }

    PoolMetrics.PoolRetrievalFailure.add(1, this._attributes)

    throw new NoItemAvailableError(
      "No item was available in the pool before the timeout",
    )
  }

  reclaim(item: PoolItem<T>, reason?: unknown): void {
    // Check if the item is still valid and we have room to keep it alive
    if (
      !this._shutdown &&
      this.checkIfValid(item.item, reason) &&
      this.size <= this._floatingLimit
    ) {
      this._addToPool(item.item)
    } else {
      this._destroyItem(item.item)
    }
  }

  shutdown(): MaybeAwaitable<void> {
    this._shutdown = true

    while (this._items.length > 0) {
      this._destroyItem(this._items.shift()!)
    }

    return
  }

  /**
   * Add the item to the pool and signal anyone waiting
   *
   * @param item The item to add to the pool
   */
  _addToPool(item: T): void {
    // Add the item back to the pool
    this._items.push(item)

    // Notify the next waiter that we are ready for them
    this._signal.notify()
  }

  /**
   * Destroy the item and decrement the size
   *
   * @param item The item to recycle
   */
  _destroyItem(item: T): void {
    try {
      this.recycleItem(item)
    } catch {
      // Swallow the errors for now
    }

    this._size--
  }

  async _tryCreateItem(): Promise<boolean> {
    // Don't provision any new work
    if (this._shutdown) {
      return false
    }

    try {
      // Create the item and add it to the pool
      const newItem = await this._circuit.invoke(this.createItem)
      this._addToPool(newItem)
      this._size++
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
  protected abstract checkIfValid(item: T, reason?: unknown): boolean

  /**
   * Allows the implementation to release any resources associated with the item
   *
   * @param item The item to recycle
   */
  protected abstract recycleItem(item: T): void

  /**
   * Creates a new item for the pool
   *
   * @returns The new item
   */
  protected abstract createItem(): MaybeAwaitable<T>
}

/**
 * Default implementation of a {@link PoolItem} that handles
 * returning to the {@link PoolBase}
 */
class PoolBaseItem<T> implements PoolItem<T> {
  readonly _item: T
  readonly _pool: PoolBase<T>

  get item(): T {
    return this._item
  }

  constructor(item: T, pool: PoolBase<T>) {
    this._item = item
    this._pool = pool
  }

  [Symbol.dispose]() {
    this.release()
  }

  release(reason?: unknown): void {
    this._pool.reclaim(this, reason)
  }
}
