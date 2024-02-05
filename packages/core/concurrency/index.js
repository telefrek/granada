"use strict";
/**
 * Concurrency primitives
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Semaphore = exports.getMonitor = exports.Monitor = exports.Signal = exports.Mutex = void 0;
/**
 * Class representing a simple mutex
 */
class Mutex {
    #locked = false;
    #callbacks = [];
    /**
     * Tries to acquire the {@link Mutex} but will not block if unavailable
     *
     * @returns True if the mutex was acquired
     */
    tryAcquire() {
        if (!this.#locked) {
            this.#locked = true;
            return true;
        }
        return false;
    }
    /**
     * Acquires the {@link Mutex}, waiting if necessary
     *
     * @param timeout An optional timeout for the operation
     *
     * @returns A {@link PromiseLike} value for tracking when the mutex is acquired
     */
    acquire(timeout) {
        if (!this.#locked) {
            this.#locked = true;
            return true;
        }
        return new Promise((resolve) => {
            // Check for timeout
            if (timeout !== undefined) {
                // eslint-disable-next-line prefer-const
                let timer;
                // Have to create the callback before the timeout
                const callback = (v) => {
                    clearTimeout(timer);
                    resolve(v);
                };
                // Set the timeout
                timer = setTimeout(() => {
                    // Verify our callback is still in the set
                    const idx = this.#callbacks.indexOf(callback);
                    if (idx >= 0) {
                        // Remove the callback from being accessed to release memory
                        this.#callbacks.splice(idx, 1);
                        // Don't resolve false unless we popped off the stack
                        resolve(false);
                    }
                }, timeout.milliseconds());
                // Add the callback to cancel the timer
                this.#callbacks.push(callback);
            }
            else {
                this.#callbacks.push(resolve);
            }
        });
    }
    /**
     * Releases the {@link Mutex} to another waiting caller
     */
    release() {
        // Release our hold on the lock...
        this.#locked = false;
        // Fire the next callback when ready with a true flag to indicate success
        if (this.#callbacks.length > 0) {
            // Re-lock the structure
            this.#locked = true;
            const resolve = this.#callbacks.shift();
            // Fire the next piece of code right after this since we can't know which phase of the event
            // loop we are currently in
            process.nextTick(() => {
                // Let the next code execute
                resolve(true);
            });
        }
    }
}
exports.Mutex = Mutex;
/**
 * Class to allow waiting for a signal from another concurrent execution
 */
class Signal {
    #callbacks = [];
    /**
     * Wait for the given {@link Signal} to become available
     *
     * @param timeout The maximum amount of time to wait
     *
     * @returns A {@link Promise} value that can be used to `await` the underly resource being available
     */
    wait(timeout) {
        return new Promise((resolve) => {
            // Check for timeout
            if (timeout !== undefined) {
                // eslint-disable-next-line prefer-const
                let timer;
                // Have to create the callback before the timeout
                const callback = () => {
                    clearTimeout(timer);
                    resolve(true);
                };
                // Set the timeout
                timer = setTimeout(() => {
                    // Verify our callback is still in the set
                    const idx = this.#callbacks.indexOf(callback);
                    if (idx >= 0) {
                        // Remove the callback from being accessed to release memory
                        this.#callbacks.splice(idx, 1);
                        // Don't resolve false unless we popped off the stack
                        resolve(false);
                    }
                }, timeout.milliseconds());
                // Add the callback to cancel the timer
                this.#callbacks.push(callback);
            }
            else {
                this.#callbacks.push(resolve);
            }
        });
    }
    /**
     * Notify the next waiter that the {@link Signal} has become available
     */
    notify() {
        // Fire the next callback when ready with a true flag to indicate success
        if (this.#callbacks.length > 0) {
            const resolve = this.#callbacks.shift();
            // Fire the next piece of code right after this since we can't know which phase of the event
            // loop we are currently in
            process.nextTick(() => {
                // Let the next code execute
                resolve(true);
            });
        }
    }
    /**
     * Notify all the waiter that the {@link Signal} has become available
     */
    notifyAll() {
        // Fire the next callback when ready with a true flag to indicate success
        while (this.#callbacks.length > 0) {
            const resolve = this.#callbacks.shift();
            // Fire the next piece of code right after this since we can't know which phase of the event
            // loop we are currently in
            process.nextTick(() => {
                // Let the next code execute
                resolve(true);
            });
        }
    }
}
exports.Signal = Signal;
/** Internal symbol for tracking monitors on objects */
const MONITOR_SYMBOL = Symbol("_monitor_");
/**
 * Simple implementation of a monitor
 */
class Monitor {
    #mutex = new Mutex();
    /**
     * Wait for the given {@link Monitor} to become available
     *
     * @param timeout The maximum amount of time to wait
     *
     * @returns A {@link MutexCallback} value that can be used to `await` the underly resource being available
     */
    wait(timeout) {
        return this.#mutex.acquire(timeout);
    }
    /**
     * Notify the next waiter that the {@link Monitor} has become available
     */
    pulse() {
        this.#mutex.release();
    }
}
exports.Monitor = Monitor;
/**
 * Retrieve the {@link Monitor} for the object
 *
 * @param obj The object to get a monitor for
 * @returns The {@link Monitor} associated with the object
 */
function getMonitor(obj) {
    if (typeof obj !== "object" || !obj)
        throw new Error("Trying to obtain monitor on non-object");
    // Get the monitor or inject it
    return obj[MONITOR_SYMBOL] === undefined
        ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
            (obj[MONITOR_SYMBOL] = new Monitor())
        : obj[MONITOR_SYMBOL];
}
exports.getMonitor = getMonitor;
/**
 * Represents a semaphore that can be used to control concurrent actions
 */
class Semaphore {
    #concurrency;
    #running = 0;
    #callbacks = [];
    /**
     * @param concurrency The desired concurrency
     */
    constructor(concurrency) {
        this.#concurrency = concurrency;
    }
    /**
     * Helper method that can be used to do the acquire/release process
     *
     * @param fn Function to run
     */
    async run(fn) {
        await this.acquire();
        try {
            return await fn();
        }
        finally {
            this.release();
        }
    }
    /**
     * Quick method to try to acquire the semaphore without blocking
     *
     * @returns True if the semaphore was acquired
     */
    tryAcquire() {
        if (this.#running < this.#concurrency) {
            this.#running++;
            return true;
        }
        return false;
    }
    /**
     * Waits up to the timeout (if defined) for the semaphore to become available
     *
     * @param timeout The maximum amount of time to wait for the semaphore
     *
     * @returns A promise for tracking the aquisition of the semaphore
     */
    acquire(timeout) {
        // Go ahead and run
        if (this.#running < this.#concurrency) {
            this.#running++;
            return true;
        }
        // Queue the promise fulfillment as a mutex callback
        return new Promise((resolve) => {
            // Check for timeout
            if (timeout !== undefined) {
                // eslint-disable-next-line prefer-const
                let timer;
                // Have to create the callback before the timeout
                const callback = (v) => {
                    clearTimeout(timer);
                    resolve(v);
                };
                // Set the timeout
                timer = setTimeout(() => {
                    // Verify our callback is still in the set
                    const idx = this.#callbacks.indexOf(callback);
                    if (idx > 0) {
                        // Remove the callback from being accessed to release memory
                        this.#callbacks.splice(idx, 1);
                        // Don't resolve false unless we popped off the stack
                        resolve(false);
                    }
                }, timeout.milliseconds());
                // Add the callback to cancel the timer
                this.#callbacks.push(callback);
            }
            else {
                this.#callbacks.push(resolve);
            }
        });
    }
    /**
     * Release the semaphore
     *
     * NOTE: This is not checked so repeated calling may corrupt the state
     */
    release() {
        if (this.#callbacks.length > 0 && this.#running < this.#concurrency) {
            // Fire the mutex to release another unit of work
            this.#callbacks.shift()(true);
        }
        else {
            // Decrement the current running count
            this.#running--;
        }
    }
    /**
     * Change the size of the semaphore
     *
     * @param newLimit The new limit
     */
    resize(newLimit) {
        // Verify we don't get a silly value
        if (newLimit <= 0) {
            throw new Error(`Invalid newLimit: ${newLimit}`);
        }
        // Update the concurrency
        this.#concurrency = newLimit;
        // We only need to signal more work during an increase, the decrease will happen automatically during the release cycle
        while (this.#concurrency >= this.#running && this.#callbacks.length > 0) {
            // Increase the running count and release one of the waiting callbacks
            this.#running++;
            this.#callbacks.shift()(true);
        }
    }
    /**
     * @returns The number of available slots in the semaphore
     */
    available() {
        return this.#concurrency - this.#running;
    }
    /**
     * @returns The current concurrency limit
     */
    limit() {
        return this.#concurrency;
    }
}
exports.Semaphore = Semaphore;
