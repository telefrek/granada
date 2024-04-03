/**
 * Simple package for implementing a basic circuit breaker
 */

import { asPromise, type MaybeAwaitable } from "../../index"
import { Duration, Timer } from "../../time/index"
import type { Func } from "../../type/utils"

/**
 * Represents the state of the {@link CircuitBreaker}
 */
export enum BreakerState {
  OPEN = "open",
  HALF_OPEN = "half_open",
  CLOSED = "closed",
}

/**
 * Customized {@link ErrorOptions} for {@link CircuitOpenError}
 */
export interface CircuitOpenOptions extends ErrorOptions {
  /** Indicates how long the circuit has been open */
  openDuration?: Duration

  /**  Indicates how long until the circuit will attempt to close */
  timeToClose?: Duration
}

/**
 * Custom error to indicate failures due to the {@link CircuitBreaker} being in
 * an open state
 */
export class CircuitOpenError extends Error {
  static readonly CIRCUIT_OPEN_ERR: unique symbol = Symbol();

  [Symbol.hasInstance](error: unknown): error is CircuitOpenError {
    return (
      typeof error === "object" &&
      error !== null &&
      CircuitOpenError.CIRCUIT_OPEN_ERR in error
    )
  }

  constructor(message?: string, options?: CircuitOpenOptions) {
    super(message, options)
  }
}

/**
 * Options passed to {@link CircuitBreaker} to control behavior at runtime
 */
export interface CircuitBreakerOptions {
  /** The amount of time in mliliseconds before calls are let through */
  retryAfterMs?: number

  /** The number of successive failures to consider as a degraded state */
  failureThreshold?: number
}

/**
 * Custom type to allow evaluation of a response for the duration of time,
 * response object and/or error presence to allow flexibility in the detection
 * of degradation that may not be simply on/off
 *
 * @param duration The {@link Duration} of the call
 * @param response The response from the call
 * @param error The optional error encountered
 *
 * @return True if the call was a success
 */
export type ResponseEvaluator<T> = (
  duration: Duration,
  response?: T,
  error?: unknown,
) => boolean

/**
 * Utility method for creating error only evaluations
 *
 * @returns A {@link ResponseEvaluator} that only tracks errors
 */
export const errorsOnly = <T>(): ResponseEvaluator<T> => {
  return (_duration: Duration, _response?: T, error?: unknown): boolean => {
    return error === undefined
  }
}

/**
 * Utility method for creating error or duration exceeded evaluations
 *
 * @param limitMs The number of milliseconds after which a response is a failure
 * @returns A {@link ResponseEvaluator} that treats either errors or duration
 * beyond the provided threshold as errors
 */
export const errorOrDuration = <T>(limitMs: number): ResponseEvaluator<T> => {
  return (duration: Duration, _response?: T, error?: unknown): boolean => {
    return error === undefined && duration.milliseconds() <= limitMs
  }
}

export interface CircuitBreaker {
  /** Current {@link BreakerState} for the circuit */
  readonly state: BreakerState

  /**
   * Invokes the given call with the provided parameters using the error only
   * {@link ResponseEvaluator}
   *
   * @param callable The function to invoke
   * @param args The arguments to pass to the function
   */
  invoke<Args extends unknown[], T>(
    callable: Func<Args, MaybeAwaitable<T>>,
    ...args: Args
  ): MaybeAwaitable<T>

  /**
   * Invokes the given call with the provided parameters using the given {@link ResponseEvaluator}
   *
   * @param callable The function ot invoke
   * @param evaluator The {@link ResponseEvaluator} to use for the call
   * @param args The arguments to pass the function
   */
  invoke<Args extends unknown[], T>(
    callable: Func<Args, MaybeAwaitable<T>>,
    evaluator: ResponseEvaluator<T>,
    ...args: Args
  ): MaybeAwaitable<T>
}

/**
 * Creates a new default {@link CircuitBreaker} object
 *
 * @param thisArg The argument to be used for binding `this` in calls
 * @param options The {@link CircuitBreakerOptions} to use
 * @returns A new {@link CircuitBreaker}
 */
export function createBreaker(
  thisArg: unknown,
  options?: CircuitBreakerOptions,
) {
  return new DefaultCircuitBreaker(thisArg, options)
}

/**
 * Default implementation of the {@link CircuitBreaker} which handles
 * marshalling calls and tracking success/failure thresholds
 */
class DefaultCircuitBreaker implements CircuitBreaker {
  #state: BreakerState
  #failureCount: number
  #failureThreshold: number
  #retryAfterMs: number
  #openedAt?: number
  #timer?: NodeJS.Timeout
  #thisArg: unknown

  constructor(thisArg: unknown, options?: CircuitBreakerOptions) {
    this.#state = BreakerState.CLOSED
    this.#failureThreshold = options?.failureThreshold ?? 5
    this.#retryAfterMs = options?.retryAfterMs ?? 5_000
    this.#failureCount = 0
    this.#thisArg = thisArg
  }

  get state(): BreakerState {
    return this.#state
  }

  invoke<Args extends unknown[], T>(
    callable: Func<Args, MaybeAwaitable<T>>,
    ...args: Args
  ): MaybeAwaitable<T>
  invoke<Args extends unknown[], T>(
    callable: Func<Args, MaybeAwaitable<T>>,
    evaluator: ResponseEvaluator<T>,
    ...args: Args
  ): MaybeAwaitable<T>
  invoke<Args extends unknown[], T>(
    callable: Func<Args, MaybeAwaitable<T>>,
    evaluator?: unknown,
    ...args: unknown[]
  ): MaybeAwaitable<T> {
    // Check our current state
    this.#checkState()

    // Get our response check object
    const responseCheck =
      evaluator !== undefined && typeof evaluator === "function"
        ? (evaluator as ResponseEvaluator<T>)
        : errorsOnly<T>()

    // Construct the arguments for the function
    const functionArgs = (
      evaluator === undefined
        ? []
        : typeof evaluator === "function"
          ? args ?? []
          : [evaluator].concat(args)
    ) as Args

    // Bind our failure and success calls since we're most likely in a promise
    const onFailure = this.#updateFailure.bind(this)
    const onSuccess = this.#updateSuccess.bind(this)

    // Start a timer
    const timer = new Timer()

    // Invoke the function
    const response = asPromise(callable.call(this.#thisArg, ...functionArgs))

    // Update that promise with callbacks to hook our state
    return (response as Promise<T>).then(
      (r: T) => {
        // Check the response
        if (responseCheck(timer.stop(), r)) {
          onSuccess()
        } else {
          onFailure()
        }

        return r
      },
      (err: unknown) => {
        // Check the error
        if (responseCheck(timer.stop(), undefined, err)) {
          // This looks funny but since not all errors are bad to all callers this
          // could be successful
          onSuccess()
        } else {
          onFailure()
        }

        throw err
      },
    )
  }

  #checkState(): void {
    // If we are open, don't let the call through
    if (this.#state === BreakerState.OPEN) {
      const openMs = Date.now() - (this.#openedAt ?? Date.now())

      // Raise the error with the given information
      throw new CircuitOpenError("CircuitBreaker is open", {
        openDuration: Duration.fromMilli(openMs),
        timeToClose: Duration.fromMilli(
          Math.max(0, this.#retryAfterMs - openMs),
        ),
      })
    }
  }

  #updateFailure(): void {
    this.#failureCount++

    // Check if we need to stop things
    if (this.#failureCount >= this.#failureThreshold) {
      // Fail open
      this.#state = BreakerState.OPEN

      // Check to see if we already triggered the half open state callback
      if (this.#timer === undefined) {
        // Track when we failed open
        this.#openedAt = Date.now()

        // Trigger the retry after MS call so we don't have to wait for
        // another call to update state
        this.#timer = setTimeout(() => {
          // Set the state and clear the timer states
          this.#state = BreakerState.HALF_OPEN
          this.#timer = undefined
          this.#openedAt = undefined
        }, this.#retryAfterMs)
      }
    }
  }

  #updateSuccess(): void {
    // Reset the failure count
    this.#failureCount = 0

    // Set the state back to closed
    this.#state = BreakerState.CLOSED
  }
}