/**
 * Concurrency primitives
 */

import { MaybeAwaitable } from "./index.js"
import { Duration } from "./time.js"
import type { Optional } from "./type/utils.js"

/**
 * This is a wrapper around a value that allows it to be changed and reflect
 * correctly across execution contexts
 */
export class SynchronizedValue<T> {
  private _value: T

  constructor(value: T) {
    this._value = value
  }

  get value(): T {
    return this._value
  }

  set value(newValue: T) {
    this._value = newValue
  }
}

/**
 * Simple type definition for a monitor callback that mirrors what a {@link Promise} will provide
 */
type MutexCallback = (value: MaybeAwaitable<boolean>) => void

/**
 * Class representing a simple mutex
 */
export class Mutex {
  private _locked = false
  private _callbacks: MutexCallback[] = []

  /**
   * Tries to acquire the {@link Mutex} but will not block if unavailable
   *
   * @returns True if the mutex was acquired
   */
  tryAcquire(): boolean {
    if (!this._locked) {
      this._locked = true
      return true
    }

    return false
  }

  /**
   * Acquires the {@link Mutex}, waiting if necessary
   *
   * @param timeout An optional timeout for the operation
   *
   * @returns A {@link PromiseLike} value for tracking when the mutex is acquired
   */
  acquire(timeout?: Duration): PromiseLike<boolean> | boolean {
    if (!this._locked) {
      this._locked = true
      return true
    }

    return new Promise((resolve) => {
      // Check for timeout
      if (timeout !== undefined) {
        // eslint-disable-next-line prefer-const
        let timer: Optional<NodeJS.Timeout>

        // Have to create the callback before the timeout
        const callback: MutexCallback = (v) => {
          clearTimeout(timer)
          resolve(v)
        }

        // Set the timeout
        timer = setTimeout(() => {
          // Verify our callback is still in the set
          const idx = this._callbacks.indexOf(callback)
          if (idx >= 0) {
            // Remove the callback from being accessed to release memory
            this._callbacks.splice(idx, 1)

            // Don't resolve false unless we popped off the stack
            resolve(false)
          }
        }, timeout.milliseconds())

        // Add the callback to cancel the timer
        this._callbacks.push(callback)
      } else {
        this._callbacks.push(resolve)
      }
    })
  }

  /**
   * Releases the {@link Mutex} to another waiting caller
   */
  release(): void {
    // Release our hold on the lock...
    this._locked = false

    // Fire the next callback when ready with a true flag to indicate success
    if (this._callbacks.length > 0) {
      // Re-lock the structure
      this._locked = true
      const resolve = this._callbacks.shift()!

      // Fire the next piece of code right after this since we can't know which phase of the event
      // loop we are currently in
      process.nextTick(() => {
        // Let the next code execute
        resolve(true)
      })
    }
  }
}

/**
 * Simple type definition for a signal callback that mirrors what a {@link Promise} will provide
 */
type SignalCallback = (value: MaybeAwaitable<boolean>) => void

/**
 * Class to allow waiting for a signal from another concurrent execution
 */
export class Signal {
  private _callbacks: SignalCallback[] = []
  private _waiting: number = 0

  get waiting(): number {
    return this._waiting
  }

  /**
   * Wait for the given {@link Signal} to become available
   *
   * @param timeout The maximum amount of time to wait
   *
   * @returns A {@link Promise} value that can be used to `await` the underly resource being available
   */
  wait(timeout?: Duration): Promise<boolean> {
    this._waiting++

    return new Promise<boolean>((resolve) => {
      // Check for timeout
      if (timeout !== undefined) {
        // eslint-disable-next-line prefer-const
        let timer: Optional<NodeJS.Timeout>

        // Have to create the callback before the timeout
        const callback: SignalCallback = () => {
          clearTimeout(timer)

          // Decrement the waiting count
          this._waiting--

          resolve(true)
        }

        // Set the timeout
        timer = setTimeout(() => {
          // Verify our callback is still in the set
          const idx = this._callbacks.indexOf(callback)
          if (idx >= 0) {
            // Remove the callback from being accessed to release memory
            this._callbacks.splice(idx, 1)

            // Decrement the waiting count
            this._waiting--

            // Don't resolve false unless we popped off the stack
            resolve(false)
          }
        }, timeout.milliseconds())

        // Add the callback to cancel the timer
        this._callbacks.push(callback)
      } else {
        this._callbacks.push(resolve)
      }
    })
  }

  /**
   * Notify the next waiter that the {@link Signal} has become available
   */
  notify(): void {
    // Fire the next callback when ready with a true flag to indicate success
    if (this._callbacks.length > 0) {
      const resolve = this._callbacks.shift()!

      // Fire the next piece of code right after this since we can't know which phase of the event
      // loop we are currently in
      process.nextTick(() => {
        // Let the next code execute
        resolve(true)
      })
    }
  }

  /**
   * Notify all the waiter that the {@link Signal} has become available
   */
  notifyAll(): void {
    // Fire the next callback when ready with a true flag to indicate success

    while (this._callbacks.length > 0) {
      const resolve = this._callbacks.shift()!

      // Fire the next piece of code right after this since we can't know which phase of the event
      // loop we are currently in
      process.nextTick(() => {
        // Let the next code execute
        resolve(true)
      })
    }
  }
}

/** Internal symbol for tracking monitors on objects */
const MONITOR_SYMBOL: unique symbol = Symbol()

/**
 * Simple implementation of a monitor
 */
export class Monitor {
  private _mutex: Mutex = new Mutex()

  /**
   * Wait for the given {@link Monitor} to become available
   *
   * @param timeout The maximum amount of time to wait
   *
   * @returns A {@link MutexCallback} value that can be used to `await` the underly resource being available
   */
  wait(timeout?: Duration): PromiseLike<boolean> | boolean {
    return this._mutex.acquire(timeout)
  }

  /**
   * Notify the next waiter that the {@link Monitor} has become available
   */
  pulse(): void {
    this._mutex.release()
  }
}

/**
 * Retrieve the {@link Monitor} for the object
 *
 * @param obj The object to get a monitor for
 * @returns The {@link Monitor} associated with the object
 */
export function getMonitor(obj: unknown): Monitor {
  if (typeof obj !== "object" || !obj)
    throw new Error("Trying to obtain monitor on non-object")

  // Get the monitor or inject it
  return obj[MONITOR_SYMBOL as keyof typeof obj] === undefined
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((obj as any)[MONITOR_SYMBOL] = new Monitor())
    : (obj[MONITOR_SYMBOL as keyof typeof obj] as Monitor)
}

/**
 * Represents a semaphore that can be used to control concurrent actions
 */
export class Semaphore {
  private _concurrency: number
  private _running = 0
  private _callbacks: MutexCallback[] = []

  /**
   * @param concurrency The desired concurrency
   */
  constructor(concurrency: number) {
    this._concurrency = concurrency
  }

  /**
   * Helper method that can be used to do the acquire/release process
   *
   * @param fn Function to run
   */
  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.acquire()

    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  /**
   * Quick method to try to acquire the semaphore without blocking
   *
   * @returns True if the semaphore was acquired
   */
  public tryAcquire(): boolean {
    if (this._running < this._concurrency) {
      this._running++
      return true
    }

    return false
  }

  /**
   * Waits up to the timeout (if defined) for the semaphore to become available
   *
   * @param timeout The maximum amount of time to wait for the semaphore
   *
   * @returns A promise for tracking the aquisition of the semaphore
   */
  public acquire(timeout?: Duration): Promise<boolean> | boolean {
    // Go ahead and run
    if (this._running < this._concurrency) {
      this._running++
      return true
    }

    // Queue the promise fulfillment as a mutex callback
    return new Promise((resolve) => {
      // Check for timeout
      if (timeout !== undefined) {
        // eslint-disable-next-line prefer-const
        let timer: Optional<NodeJS.Timeout>

        // Have to create the callback before the timeout
        const callback: MutexCallback = (v) => {
          clearTimeout(timer)
          resolve(v)
        }

        // Set the timeout
        timer = setTimeout(() => {
          // Verify our callback is still in the set
          const idx = this._callbacks.indexOf(callback)
          if (idx > 0) {
            // Remove the callback from being accessed to release memory
            this._callbacks.splice(idx, 1)

            // Don't resolve false unless we popped off the stack
            resolve(false)
          }
        }, timeout.milliseconds())

        // Add the callback to cancel the timer
        this._callbacks.push(callback)
      } else {
        this._callbacks.push(resolve)
      }
    })
  }

  /**
   * Release the semaphore
   *
   * NOTE: This is not checked so repeated calling may corrupt the state
   */
  public release() {
    if (this._callbacks.length > 0 && this._running < this._concurrency) {
      // Fire the mutex to release another unit of work
      this._callbacks.shift()!(true)
    } else {
      // Decrement the current running count
      this._running--
    }
  }

  /**
   * Change the size of the semaphore
   *
   * @param newLimit The new limit
   */
  public resize(newLimit: number): void {
    // Verify we don't get a silly value
    if (newLimit <= 0) {
      throw new Error(`Invalid newLimit: ${newLimit}`)
    }

    // Update the concurrency
    this._concurrency = newLimit

    // We only need to signal more work during an increase, the decrease will happen automatically during the release cycle
    while (this._concurrency >= this._running && this._callbacks.length > 0) {
      // Increase the running count and release one of the waiting callbacks
      this._running++
      this._callbacks.shift()!(true)
    }
  }

  /**
   * @returns The number of available slots in the semaphore
   */
  get available(): number {
    return this._concurrency - this._running
  }

  /**
   * @returns The current concurrency limit
   */
  get limit(): number {
    return this._concurrency
  }

  get running(): number {
    return this._running
  }
}
