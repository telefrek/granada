/**
 * Package exports
 */

import { MaybeAwaitable } from "./index.js"
import { error, fatal } from "./logging.js"

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
export function registerShutdown(
  callback: () => MaybeAwaitable<unknown>,
): void {
  shutdownHooks.push(callback)
}

/**
 * Removes the callback if present from the global shutdowns
 *
 * @param callback The callback to remove
 * @returns True if the callback was removed
 */
export function removeShutdown(
  callback: () => MaybeAwaitable<unknown>,
): boolean {
  const idx = shutdownHooks.indexOf(callback)
  if (idx >= 0) {
    shutdownHooks.splice(idx)
    return true
  }

  return false
}

/** Set of shutdown hooks to fire on exit */
const shutdownHooks: (() => MaybeAwaitable<unknown>)[] = []

/** Simple method to invoke shutdowns */
const shutdown = async () => {
  fatal("Global shutdown started")

  // Fire all the hooks and hope for the best...
  await Promise.allSettled(shutdownHooks.map(async (s) => await s())).then(
    (_) => fatal("shutdown finished"),
    (err) => {
      error(`error during shutdown: ${err}`)
    },
  )
}

// Local process kill (ctrl+c)
process.on("SIGINT", async () => {
  fatal("Received SIGINT, shutting down system...")
  await shutdown()
})

// Container process kill (docker, etc.)
process.on("SIGTERM", async () => {
  fatal("Received SIGTERM, shutting down system...")
  await shutdown()
})
