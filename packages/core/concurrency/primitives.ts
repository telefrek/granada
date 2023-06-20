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

    private locked: boolean = false
    private callbacks: MutexCallback[] = []

    /**
     * Tries to acquire the {@link Mutex} but will not block if unavailable
     * 
     * @returns True if the mutex was acquired
     */
    tryAcquire(): boolean {
        if (!this.locked) {
            this.locked = true
            return true
        }

        return false
    }

    /**
     * Acquires the {@link Mutex}, waiting if necessary
     * 
     * @returns A {@link PromiseLike} value for tracking when the mutex is acquired
     */
    acquire(): PromiseLike<void> {
        if (!this.locked) {
            this.locked = true
            return Promise.resolve()
        }

        return new Promise(resolve => {
            this.callbacks.push(resolve)
        })
    }

    /**
     * Releases the {@link Mutex} to another waiting caller
     */
    release(): void {
        this.locked = false

        if (this.callbacks.length > 0) {
            setImmediate(this.callbacks.shift()!)
        }
    }
}

/** Internal symbol for tracking monitors on objects */
const MONITOR_SYMBOL = Symbol('_mon_')

/**
 * Simple implementation of a monitor
 */
export class Monitor {

    private mutex: Mutex = new Mutex()

    /**
     * Wait for the given {@link Monitor} to become available
     * 
     * @returns A {@link PromiseLike} value that can be used to `await` the underly resource being available
     */
    wait(): PromiseLike<void> {
        return this.mutex.acquire()
    }

    /**
     * Notify the next waiter that the {@link Monitor} has become available
     */
    pulse(): void {
        this.mutex.release()
    }
}

/**
 * Retrieve the {@link Monitor} for the object
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
    private concurrency: number
    private running: number = 0
    private callbacks: MutexCallback[] = []

    /**
     * 
     * @param concurrency The desired concurrency
     */
    constructor(concurrency: number) {
        this.concurrency = concurrency
    }

    async run<T>(fn: () => Promise<T>): Promise<T> {

    }

    private acquire(): Promise<void> | undefined {

        // Go ahead and run
        if(this.running < this.concurrency){
            this.running++
            return
        }

        const p = new Promise(resolve=>{
            
        })
    }

    /**
     * @returns The number of available slots in the semaphore
     */
    available(): number {
        return this.concurrency - this.running
    }

    /**
     * @returns The current concurrency limit
     */
    limit(): number {
        return this.concurrency
    }
}