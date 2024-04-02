import util from "util"

/**
 * Get the information about an object to help with debugging that leverages the
 * `util.inspect` method
 *
 * @param target The target object to inspect
 * @param depth The maximum depth to traverse (default is 25)
 * @returns A string representation (with colorization) for the object
 */
export function getDebugInfo(target: unknown, depth = 25): string {
  return util.inspect(target, false, depth, true)
}

/** Simple type representing `void | PromiseLike<void>` */
export type MaybeAwaitable<T> = T | PromiseLike<T>

/**
 * A resolver type for {@link PromiseLike} constructors
 */
export type Resolver<T> = (value: MaybeAwaitable<T>) => void

/**
 * A rejector type for {@link PromiseLike} constructors
 */
export type Rejector = (reason: unknown) => void

/**
 * This is a helper class that provides an implementation of the
 * {@link PromiseLike} interface, backed by an underlying {@link Promise} which
 * has the {@link Resolver} and {@link Rejector} objects exposed via the
 * corresponding `resolve` and `reject` methods
 */
export class DeferredPromise<T> implements PromiseLike<T> {
  #resolver: Resolver<T>
  #rejector: Rejector
  #promise: Promise<T>

  constructor() {
    let resolver: Resolver<T> | undefined
    let rejector: Rejector | undefined

    this.#promise = new Promise<T>((resolve: Resolver<T>, reject: Rejector) => {
      resolver = resolve
      rejector = reject
    })

    this.#resolver = resolver!
    this.#rejector = rejector!

    // Prevent further extension of the object since we want this as a
    // lightweight wrapper around a Promise, not an extension point around them
    Object.seal(this)
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
  ): PromiseLike<TResult1 | TResult2> {
    return this.#promise.then(onfulfilled, onrejected)
  }

  /**
   * Resolve the underlying {@link Promise} with the given value
   *
   * @param value The {@link MaybeAwaitable} to provide to the {@link Promise} chain
   */
  resolve(value: MaybeAwaitable<T>): void {
    this.#resolver(value)
  }

  /**
   * Reject the underlying {@link Promise} with the given value
   *
   * @param reason The reason to provide the {@link Promise} chain for rejection
   */
  reject(reason: unknown): void {
    this.#rejector(reason)
  }
}
