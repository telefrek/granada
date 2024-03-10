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
export interface Query<T> {
  readonly name: string
  readonly mode: ExecutionMode
}

/**
 * Represents a query that requires specific inputs with a given shape
 */
export interface ParameterizedQuery<T, U> extends Query<U> {
  /**
   * Binds the given parameters to generate a fully executable {@link Query} object
   *
   * @param parameters The values to bind to the {@link ParameterizedQuery}
   */
  bind(parameters: T): Query<U>
}

/**
 * Represents an object that is capable of executing a query
 */
export interface QueryExecutor<Q extends any = any> {
  /**
   * Runs the given query and produces a result
   * @param query The {@link Query} to run
   *
   * @returns Either a {@link QueryResult} or {@link StreamingQueryResult}
   */
  run<T extends Q>(
    query: Query<T>
  ): Promise<QueryResult<T> | StreamingQueryResult<T>>
}

/**
 * Represents the result of executing a {@link Query}
 */
export interface QueryResult<T> {
  query: Query<T>
  rows: T[]
  duration: Duration
}

/**
 * Represents the result of executing a {@link Query} where values are provided
 * incrmentally
 */
export interface StreamingQueryResult<T> extends Omit<QueryResult<T>, "rows"> {
  rows: AsyncIterable<T>
}
