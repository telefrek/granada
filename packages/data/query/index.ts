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
 * Types of queries
 */
export enum QueryType {
  RAW = "raw",
  PARAMETERIZED = "parameterized",
  BOUND = "bound",
}

/**
 * Represents a set of parameters
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryParameters = Record<string, any>

export type Query<
  Q extends QueryType,
  _T extends object,
  _P extends QueryParameters,
> = {
  queryType: Q
  name: string
  mode: ExecutionMode
}

export type RawQuery<T extends object> = Query<QueryType.RAW, T, never>

export type ParameterizedQuery<
  T extends object,
  P extends QueryParameters,
> = Query<QueryType.PARAMETERIZED, T, P> & {
  bind(parameters: P): BoundQuery<T, P>
}

export type BoundQuery<T extends object, P extends QueryParameters> = Query<
  QueryType.BOUND,
  T,
  P
> & {
  parameters: Readonly<P>
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
    query: Query<QueryType, T, never>,
  ): Promise<QueryResult<T> | StreamingQueryResult<T>>
}

/**
 * Represents the result of executing a {@link Query}
 */
export interface QueryResult<T extends object> {
  query: Query<QueryType, T, never>
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
