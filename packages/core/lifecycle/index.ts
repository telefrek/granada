/**
 * Package exports
 */

/**
 * Set of supported events on an object with a defined lifecycle
 */
export interface LifecycleEvents {
    /**
     * Fired when the object is initializing itself
     */
    initializing: () => void

    /**
     * Fired when the object is started
     */
    started: () => void

    /**
     * Fired when the object is stopping
     */
    stopping: () => void

    /**
     * 
     * @returns Fired when the object has finished
     */
    finished: () => void
}

/**
 * Register the callback to be invoked on shutdown
 * 
 * @param callback The callback to invoke on a shutdown
 */
export function registerShutdown(callback: () => void | PromiseLike<void>) {
    shutdownHooks.push(callback)
}

/** Set of shutdown hooks to fire on exit */
const shutdownHooks: (() => void | PromiseLike<void>)[] = []

/** Simple method to invoke shutdowns */
const shutdown = () => {
    // Fire all the hooks and hope for the best...
    Promise.all(shutdownHooks.map(async (s) => await s())).then(() => console.log("shutdown finished"), err => { console.error(`error: ${err}`) })
}

// Local process kill (ctrl+c)
process.on('SIGINT', shutdown)

// Container process kill (docker, etc.)
process.on('SIGTERM', shutdown)