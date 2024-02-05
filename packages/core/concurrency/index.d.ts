/**
 * Concurrency primitives
 */
import { Duration } from "../time/";
/**
 * Class representing a simple mutex
 */
export declare class Mutex {
    #private;
    /**
     * Tries to acquire the {@link Mutex} but will not block if unavailable
     *
     * @returns True if the mutex was acquired
     */
    tryAcquire(): boolean;
    /**
     * Acquires the {@link Mutex}, waiting if necessary
     *
     * @param timeout An optional timeout for the operation
     *
     * @returns A {@link PromiseLike} value for tracking when the mutex is acquired
     */
    acquire(timeout?: Duration): PromiseLike<boolean> | boolean;
    /**
     * Releases the {@link Mutex} to another waiting caller
     */
    release(): void;
}
/**
 * Class to allow waiting for a signal from another concurrent execution
 */
export declare class Signal {
    #private;
    /**
     * Wait for the given {@link Signal} to become available
     *
     * @param timeout The maximum amount of time to wait
     *
     * @returns A {@link Promise} value that can be used to `await` the underly resource being available
     */
    wait(timeout?: Duration): PromiseLike<boolean> | void;
    /**
     * Notify the next waiter that the {@link Signal} has become available
     */
    notify(): void;
    /**
     * Notify all the waiter that the {@link Signal} has become available
     */
    notifyAll(): void;
}
/**
 * Simple implementation of a monitor
 */
export declare class Monitor {
    #private;
    /**
     * Wait for the given {@link Monitor} to become available
     *
     * @param timeout The maximum amount of time to wait
     *
     * @returns A {@link MutexCallback} value that can be used to `await` the underly resource being available
     */
    wait(timeout?: Duration): PromiseLike<boolean> | boolean;
    /**
     * Notify the next waiter that the {@link Monitor} has become available
     */
    pulse(): void;
}
/**
 * Retrieve the {@link Monitor} for the object
 *
 * @param obj The object to get a monitor for
 * @returns The {@link Monitor} associated with the object
 */
export declare function getMonitor(obj: unknown): Monitor;
/**
 * Represents a semaphore that can be used to control concurrent actions
 */
export declare class Semaphore {
    #private;
    /**
     * @param concurrency The desired concurrency
     */
    constructor(concurrency: number);
    /**
     * Helper method that can be used to do the acquire/release process
     *
     * @param fn Function to run
     */
    run<T>(fn: () => Promise<T> | T): Promise<T>;
    /**
     * Quick method to try to acquire the semaphore without blocking
     *
     * @returns True if the semaphore was acquired
     */
    tryAcquire(): boolean;
    /**
     * Waits up to the timeout (if defined) for the semaphore to become available
     *
     * @param timeout The maximum amount of time to wait for the semaphore
     *
     * @returns A promise for tracking the aquisition of the semaphore
     */
    acquire(timeout?: Duration): Promise<boolean> | boolean;
    /**
     * Release the semaphore
     *
     * NOTE: This is not checked so repeated calling may corrupt the state
     */
    release(): void;
    /**
     * Change the size of the semaphore
     *
     * @param newLimit The new limit
     */
    resize(newLimit: number): void;
    /**
     * @returns The number of available slots in the semaphore
     */
    available(): number;
    /**
     * @returns The current concurrency limit
     */
    limit(): number;
}
