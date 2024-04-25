/**
 * Http Error Information
 */

/**
 * Set of expected HTTP Errors
 */
export enum HttpErrorCode {
  ABORTED = "aborted",
  TIMEOUT = "timeout",
  UNKNOWN = "unknown",
}

/**
 * Represents an HTTP Error
 */
export interface HttpError {
  errorCode: HttpErrorCode
  description?: string
}

/**
 * Type guard for {@link HttpError}
 *
 * @param error The object to inspect
 * @returns True if it is an {@link HttpError}
 */
export function isHttpError(error: unknown): error is HttpError {
  return (
    typeof error === "object" &&
    error !== null &&
    "errorCode" in error &&
    typeof error.errorCode === "string"
  )
}
