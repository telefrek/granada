/**
 * Package exports
 */

import { Socket } from "net"
import { clearTimeout } from "timers"
import { MaybeAwaitable, getDebugInfo } from "./index.js"
import { error, fatal, warn } from "./logging.js"

/**
 * Set of supported events on an object with a defined lifecycle
 */
export interface LifecycleEvents {
  /**
   * Fired when the lifecycle is initializing
   */
  initializing: () => void

  /**
   * Fired when the lifecycle is started
   */
  started: () => void

  /**
   * Fired when the lifecycle is stopping
   */
  stopping: () => void

  /**
   * Fired when the lifeycle is finished
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
    shutdownHooks.splice(idx, 1)
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

/**
 * Make sure we acknowledge that this method might exist
 */
interface getActiveHandles extends NodeJS.Process {
  /**
   * Get the set of active handles that are still using the event loop
   *
   * @returns The set of resources that are alive (could be a wide variety of objects)
   */
  _getActiveHandles?: () => unknown[]
}

interface Destroyable {
  destroy(): void
}

function isDestroyable(obj: unknown): obj is Destroyable {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "destroy" in obj &&
    typeof obj.destroy === "function"
  )
}

/**
 * Finds dangling resources and shows information about them
 *
 * @param forceClose Flag to indicate if these should be force closed
 */
export function checkDanglingResources(forceClose: boolean = true): void {
  process.getActiveResourcesInfo().forEach((resource) => {
    warn(`Suspect resource: ${resource}`)
    switch (resource) {
      case "Timeout": {
        warn(`Clearing timeouts...`)
        const timeout = setTimeout(() => {}, 1_000)
        clearTimeout(timeout)
        for (let n = +timeout; n > 0; --n) {
          clearTimeout(n)
        }
        warn(`Done`)
      }
    }
  })

  const handles = (process as getActiveHandles)._getActiveHandles
  if (handles !== undefined) {
    handles().forEach((handle) => {
      warn(`Open handle: ${getDebugInfo(handle)}`)
      if (forceClose) {
        if (handle instanceof Socket) {
          warn(`Destroying socket...`)
          handle
            .on("error", (err) => {
              error(`Error from socket ${err}`)
            })
            .destroy(new Error("Processing ended"))
          warn(`Destroyed`)
        } else if (isDestroyable(handle)) {
          warn(`Destroying object...`)
          handle.destroy()
          warn(`Object destroyed`)
        } else if (typeof handle === "number" || typeof handle === "string") {
          clearTimeout(handle)
        }
      }
    })
  }
}
