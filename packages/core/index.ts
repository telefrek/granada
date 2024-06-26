import util from "util"
import { isPromise } from "util/types"
import type { Optional } from "./type/utils.js"

/**
 * Simple numeric to represent priority values (pseudo "niceness" score) where
 * lower priority is executed first
 */
export type FrameworkPriority = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

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
export type MaybeAwaitable<T = void> = T | PromiseLike<T>

/**
 * Ensure the {@link MaybeAwaitable} is a {@link Promise}
 *
 * @param awaitable The {@link MaybeAwaitable} to transform
 * @returns A {@link Promise} with the results of the awaitable
 */
export function asPromise<T>(awaitable: MaybeAwaitable<T>): Promise<T> {
  // Ensure this is a promise or cast it as one
  return isPromise(awaitable)
    ? (awaitable as Promise<T>)
    : Promise.resolve(awaitable as T)
}

/**
 * A resolver type for {@link PromiseLike} constructors
 */
export type Resolver<T> = (value: MaybeAwaitable<T>) => void

/**
 * A rejector type for {@link PromiseLike} constructors
 */
export type Rejector = (reason: unknown) => void

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DeferredAny = DeferredPromise<any>

/**
 * This is a helper class that provides an implementation of the
 * {@link PromiseLike} interface, backed by an underlying {@link Promise} which
 * has the {@link Resolver} and {@link Rejector} objects exposed via the
 * corresponding `resolve` and `reject` methods
 */
export class DeferredPromise<T = void> implements Promise<T> {
  private _resolver: Resolver<T>
  private _rejector: Rejector
  private _promise: Promise<T>

  constructor() {
    let resolver: Optional<Resolver<T>>
    let rejector: Optional<Rejector>

    this._promise = new Promise<T>((resolve: Resolver<T>, reject: Rejector) => {
      resolver = resolve
      rejector = reject
    })

    this._resolver = resolver!
    this._rejector = rejector!

    // Prevent further extension of the object since we want this as a
    // lightweight wrapper around a Promise, not an extension point around them
    Object.seal(this)
  }

  get [Symbol.toStringTag](): string {
    return `Deferred=>${this._promise[Symbol.toStringTag]}`
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
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: unknown) => TResult | PromiseLike<TResult>)
      | null
      | undefined,
  ): Promise<T | TResult> {
    return this._promise.catch(onrejected)
  }

  finally(onfinally?: (() => void) | null | undefined): Promise<T> {
    return this._promise.finally(onfinally)
  }

  /**
   * Resolve the underlying {@link Promise} with the given value
   *
   * @param value The {@link MaybeAwaitable} to provide to the {@link Promise} chain
   */
  resolve(value: MaybeAwaitable<T>): void {
    this._resolver(value)
  }

  /**
   * Reject the underlying {@link Promise} with the given value
   *
   * @param reason The reason to provide the {@link Promise} chain for rejection
   */
  reject(reason: unknown): void {
    this._rejector(reason)
  }
}
