/** Simple type representing `void | PromiseLike<void>` */
export type MaybeAwaitable<T> = T | PromiseLike<T>

/**
 * Check to see if the target is {@link PromiseLike}
 * @param target The object to inspect
 * @returns True if it is {@link PromiseLike}
 */
export function isPromiseLike<T>(target: unknown): target is PromiseLike<T> {
  return (
    typeof target === "object" &&
    target !== null &&
    "then" in target &&
    typeof target.then === "function"
  )
}
