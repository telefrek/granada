/**
 * Concurrency primitives
 */

/**
 * Simple type definition for a monitor callback that mirrors what a {@link Promise} will provide
 */
type MutexCallback = (value: void | PromiseLike<void>) => void

/**
 * Class representing a simple mutex
 */
export class Mutex {

    #locked: boolean = false
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
     * @returns A {@link PromiseLike} value for tracking when the mutex is acquired
     */
    acquire(): PromiseLike<void> | undefined {
        if (!this.#locked) {
            this.#locked = true
            return
        }

        return new Promise(resolve => {
            this.#callbacks.push(resolve)
        })
    }

    /**
     * Releases the {@link Mutex} to another waiting caller
     */
    release(): void {
        this.#locked = false

        if (this.#callbacks.length > 0) {
            setImmediate(this.#callbacks.shift()!)
        }
    }
}

/** Internal symbol for tracking monitors on objects */
const MONITOR_SYMBOL = Symbol('_monitor_')

/**
 * Simple implementation of a monitor
 */
export class Monitor {

    #mutex: Mutex = new Mutex()

    /**
     * Wait for the given {@link Monitor} to become available
     * 
     * @returns A {@link PromiseLike} value that can be used to `await` the underly resource being available
     */
    wait(): PromiseLike<void> | undefined {
        return this.#mutex.acquire()
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
export function getMonitor(obj: any): Monitor {

    // Get the monitor or inject it
    return obj[MONITOR_SYMBOL] === undefined ? (obj[MONITOR_SYMBOL] = new Monitor()) : obj[MONITOR_SYMBOL] as Monitor
}

/**
 * Represents a semaphore that can be used to control concurrent actions
 */
export class Semaphore {
    #concurrency: number
    #running: number = 0
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
     * 
     * @returns A promise for tracking the aquisition of the semaphore
     */
    public acquire(): Promise<void> | undefined {

        // Go ahead and run
        if (this.#running < this.#concurrency) {
            this.#running++
            return
        }

        // Queue the promise fulfillment as a mutex callback
        return new Promise<void>(resolve => {
            this.#callbacks.push(resolve)
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
            this.#callbacks.shift()!()
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
            this.#callbacks.shift()!()
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