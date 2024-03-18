import util from "util"

export function getDebugInfo(target: unknown, depth: number = 25): string {
  return util.inspect(target, false, depth, true)
}

/** Simple type representing `void | PromiseLike<void>` */
export type MaybeAwaitable<T> = T | PromiseLike<T>

/**
 * Checks if th eobject is empty
 * @param target The object to inspect
 * @returns true if the object has no properties
 */
export function isEmpty(target: unknown): boolean {
  // Only works with objects
  if (typeof target === "object" && target !== null) {
    for (const _ in target) {
      return false
    }

    return true
  }

  return false
}
