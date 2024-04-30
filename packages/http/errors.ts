/**
 * Http Error Information
 */

import { getErrorMessage, isAbortError } from "@telefrek/core/errors.js"

/**
 * Set of expected HTTP Errors
 */
export enum HttpErrorCode {
  ABORTED = "aborted",
  TIMEOUT = "timeout",
  CLOSED = "closed",
  UNKNOWN = "unknown",
}

/**
 * Represents an HTTP Error
 */
export interface HttpError {
  errorCode: HttpErrorCode
  description?: string
  cause?: unknown
}

export function mapErrorCode(error: unknown): HttpErrorCode {
  // TODO: Clean this up...
  return isAbortError(error) ? HttpErrorCode.ABORTED : HttpErrorCode.UNKNOWN
}

export function translateHttpError(error: unknown): HttpError {
  return isHttpError(error)
    ? error
    : {
        errorCode: mapErrorCode(error),
        cause: error,
        description: getErrorMessage(error),
      }
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
