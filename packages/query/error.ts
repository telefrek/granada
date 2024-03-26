/**
 * Defines error handling for queries
 */

import type { QueryBase, QueryType } from "."

/**
 * Extension of {@link ErrorOptions} for query execution
 */
interface QueryErrorOptions extends ErrorOptions {
  query?: QueryBase<QueryType, object>
}

/**
 * Represents an error that occured during {@link QueryBase} operations
 */
export class QueryError extends Error {
  options?: QueryErrorOptions
  static readonly QUERY_ERR_SYMBOL: unique symbol = Symbol();

  [Symbol.hasInstance](error: unknown): error is QueryError {
    return (
      typeof error === "object" &&
      error !== null &&
      QueryError.QUERY_ERR_SYMBOL in error
    )
  }

  constructor(message?: string, options?: QueryErrorOptions) {
    super(message, options)
    this.options = options
  }
}

/**
 * Type guard for {@link QueryError}
 *
 * @param error The error to inspect
 * @returns True if the error is a {@link QueryError}
 */
export function isQueryError(error: unknown): error is QueryError {
  return error instanceof QueryError
}
