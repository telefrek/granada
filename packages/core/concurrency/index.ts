/**
 * Concurrency primitives
 */

import { MaybeAwaitable } from "../"
import { Duration } from "../time/"

/**
 * Simple type definition for a monitor callback that mirrors what a {@link Promise} will provide
 */
type MutexCallback = (value: MaybeAwaitable<boolean>) => void

/**
 * Class representing a simple mutex
 */
export class Mutex {
  #locked = false
  #callbacks: MutexCallback[] = []

  /**
   * Tries to acquire the {@link Mutex} but will not block if unavailable
   *
   * @returns True if the mutex was acquired
   */
  tryAcquire(): boolean {
    if (!this.#locked) {
      this.#locked = true
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
    if (!this.#locked) {
      this.#locked = true
      return true
    }

    return new Promise((resolve) => {
      // Check for timeout
      if (timeout !== undefined) {
        // eslint-disable-next-line prefer-const
        let timer: NodeJS.Timeout | undefined

        // Have to create the callback before the timeout
        const callback: MutexCallback = (v) => {
          clearTimeout(timer)
          resolve(v)
        }

        // Set the timeout
        timer = setTimeout(() => {
          // Verify our callback is still in the set
          const idx = this.#callbacks.indexOf(callback)
          if (idx >= 0) {
            // Remove the callback from being accessed to release memory
            this.#callbacks.splice(idx, 1)

            // Don't resolve false unless we popped off the stack
            resolve(false)
          }
        }, timeout.milliseconds())

        // Add the callback to cancel the timer
        this.#callbacks.push(callback)
      } else {
        this.#callbacks.push(resolve)
      }
    })
  }

  /**
   * Releases the {@link Mutex} to another waiting caller
   */
  release(): void {
    // Release our hold on the lock...
    this.#locked = false

    // Fire the next callback when ready with a true flag to indicate success
    if (this.#callbacks.length > 0) {
      // Re-lock the structure
      this.#locked = true
      const resolve = this.#callbacks.shift()!

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
  #callbacks: SignalCallback[] = []

  /**
   * Wait for the given {@link Signal} to become available
   *
   * @param timeout The maximum amount of time to wait
   *
   * @returns A {@link Promise} value that can be used to `await` the underly resource being available
   */
  wait(timeout?: Duration): PromiseLike<boolean> | void {
    return new Promise<boolean>((resolve) => {
      // Check for timeout
      if (timeout !== undefined) {
        // eslint-disable-next-line prefer-const
        let timer: NodeJS.Timeout | undefined

        // Have to create the callback before the timeout
        const callback: SignalCallback = () => {
          clearTimeout(timer)
          resolve(true)
        }

        // Set the timeout
        timer = setTimeout(() => {
          // Verify our callback is still in the set
          const idx = this.#callbacks.indexOf(callback)
          if (idx >= 0) {
            // Remove the callback from being accessed to release memory
            this.#callbacks.splice(idx, 1)

            // Don't resolve false unless we popped off the stack
            resolve(false)
          }
        }, timeout.milliseconds())

        // Add the callback to cancel the timer
        this.#callbacks.push(callback)
      } else {
        this.#callbacks.push(resolve)
      }
    })
  }

  /**
   * Notify the next waiter that the {@link Signal} has become available
   */
  notify(): void {
    // Fire the next callback when ready with a true flag to indicate success
    if (this.#callbacks.length > 0) {
      const resolve = this.#callbacks.shift()!

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
    while (this.#callbacks.length > 0) {
      const resolve = this.#callbacks.shift()!

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
const MONITOR_SYMBOL = Symbol("_monitor_")

/**
 * Simple implementation of a monitor
 */
export class Monitor {
  #mutex: Mutex = new Mutex()

  /**
   * Wait for the given {@link Monitor} to become available
   *
   * @param timeout The maximum amount of time to wait
   *
   * @returns A {@link MutexCallback} value that can be used to `await` the underly resource being available
   */
  wait(timeout?: Duration): PromiseLike<boolean> | boolean {
    return this.#mutex.acquire(timeout)
  }

  /**
   * Notify the next waiter that the {@link Monitor} has become available
   */
  pulse(): void {
    this.#mutex.release()
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
    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      ((obj as any)[MONITOR_SYMBOL] = new Monitor())
    : (obj[MONITOR_SYMBOL as keyof typeof obj] as Monitor)
}

/**
 * Represents a semaphore that can be used to control concurrent actions
 */
export class Semaphore {
  #concurrency: number
  #running = 0
  #callbacks: MutexCallback[] = []

  /**
   * @param concurrency The desired concurrency
   */
  constructor(concurrency: number) {
    this.#concurrency = concurrency
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
    if (this.#running < this.#concurrency) {
      this.#running++
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
    if (this.#running < this.#concurrency) {
      this.#running++
      return true
    }

    // Queue the promise fulfillment as a mutex callback
    return new Promise((resolve) => {
      // Check for timeout
      if (timeout !== undefined) {
        // eslint-disable-next-line prefer-const
        let timer: NodeJS.Timeout | undefined

        // Have to create the callback before the timeout
        const callback: MutexCallback = (v) => {
          clearTimeout(timer)
          resolve(v)
        }

        // Set the timeout
        timer = setTimeout(() => {
          // Verify our callback is still in the set
          const idx = this.#callbacks.indexOf(callback)
          if (idx > 0) {
            // Remove the callback from being accessed to release memory
            this.#callbacks.splice(idx, 1)

            // Don't resolve false unless we popped off the stack
            resolve(false)
          }
        }, timeout.milliseconds())

        // Add the callback to cancel the timer
        this.#callbacks.push(callback)
      } else {
        this.#callbacks.push(resolve)
      }
    })
  }

  /**
   * Release the semaphore
   *
   * NOTE: This is not checked so repeated calling may corrupt the state
   */
  public release() {
    if (this.#callbacks.length > 0 && this.#running < this.#concurrency) {
      // Fire the mutex to release another unit of work
      this.#callbacks.shift()!(true)
    } else {
      // Decrement the current running count
      this.#running--
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
    this.#concurrency = newLimit

    // We only need to signal more work during an increase, the decrease will happen automatically during the release cycle
    while (this.#concurrency >= this.#running && this.#callbacks.length > 0) {
      // Increase the running count and release one of the waiting callbacks
      this.#running++
      this.#callbacks.shift()!(true)
    }
  }

  /**
   * @returns The number of available slots in the semaphore
   */
  available(): number {
    return this.#concurrency - this.#running
  }

  /**
   * @returns The current concurrency limit
   */
  limit(): number {
    return this.#concurrency
  }
}
