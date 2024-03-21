/**
 * Provides the basic structure for query definitions
 */

import { Duration } from "@telefrek/core/time"

/**
 * The set of supported execution modes
 */
export enum ExecutionMode {
  Normal = "normal",
  Streaming = "streaming",
}

/**
 * Represents the most basic query
 */
export interface Query<_T extends object> {
  readonly name: string
  readonly mode: ExecutionMode
}

/**
 * Represents a query that requires specific inputs with a given shape
 */
export interface ParameterizedQuery<T extends object, P extends object>
  extends Query<T> {
  /**
   * Binds the given parameters to generate a fully executable {@link Query} object
   *
   * @param parameters The values to bind to the {@link ParameterizedQuery}
   */
  bind(parameters: P): Query<T>
}

/**
 * Type guard for identifying {@link ParameterizedQuery} instances
 *
 * @param query The {@link Query} to inspect
 * @returns True if the query is a {@link ParameterizedQuery}
 */
export function isParameterizedQuery<T extends object>(
  query: Query<T>,
): query is ParameterizedQuery<T, object> {
  return "bind" in query && typeof query.bind === "function"
}

/**
 * Represents an object that is capable of executing a query
 */
export interface QueryExecutor {
  /**
   * Runs the given query and produces a result
   * @param query The {@link Query} to run
   *
   * @returns Either a {@link QueryResult} or {@link StreamingQueryResult}
   */
  run<T extends object>(
    query: Query<T>,
  ): Promise<QueryResult<T> | StreamingQueryResult<T>>
}

/**
 * Represents the result of executing a {@link Query}
 */
export interface QueryResult<T extends object> {
  query: Query<T>
  rows: T[]
  duration: Duration
}

/**
 * Represents the result of executing a {@link Query} where values are provided
 * incrmentally
 */
export interface StreamingQueryResult<T extends object>
  extends Omit<QueryResult<T>, "rows"> {
  rows: AsyncIterable<T>
}
