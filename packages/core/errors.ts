/**
 * Error representing an issue related to something not being started in time
 */
export class TimeoutError extends Error {
  static readonly TIMEOUT_ERR_SYMBOL: unique symbol = Symbol();

  [Symbol.hasInstance](error: unknown): error is TimeoutError {
    return (
      typeof error === "object" &&
      error !== null &&
      TimeoutError.TIMEOUT_ERR_SYMBOL in error
    )
  }
}

/**
 * Filter for abort errors
 *
 * @param err The unknown error
 * @returns True if this is an abort error
 */
export function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "ABORT_ERR"
  )
}
