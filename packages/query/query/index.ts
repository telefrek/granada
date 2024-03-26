/**
 * Provides the basic structure for query definitions
 */

import { Duration } from "@telefrek/core/time"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RowType = Record<string, any>

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
  SIMPLE = "simple",
  PARAMETERIZED = "parameterized",
  BOUND = "bound",
}

/**
 * Represents a set of parameters
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryParameters = Record<string, any>

/**
 * Base type for all queries
 */
export type QueryBase<
  Q extends QueryType,
  R extends RowType,
  P extends QueryParameters = never,
> = {
  queryType: Q
  name: string
  mode: ExecutionMode
  parameters: Readonly<P>
  defaults?: Readonly<Partial<R>>
}

/**
 * Represents a query that has no parameters or modifiers beyond the name, mode
 * and potential defaults
 */
export type SimpleQuery<R extends RowType> = QueryBase<QueryType.SIMPLE, R>

/**
 * Represents a query that requires some additional parameters before it can
 * function.  These types of queries should not be directly executable.
 */
export type ParameterizedQuery<
  R extends RowType,
  P extends QueryParameters,
> = QueryBase<QueryType.PARAMETERIZED, R, P> & {
  /**
   *
   * @param parameters The parameters to bind to the query
   */
  bind: (parameters: P) => BoundQuery<R, P>
}

/**
 * Represents a query that has been bound to some parameters and is now ready
 * for execution.
 */
export type BoundQuery<
  R extends RowType,
  P extends QueryParameters,
> = QueryBase<QueryType.BOUND, R, P>

/**
 * Represents an object that is capable of executing a query
 */
export interface QueryExecutor {
  /**
   * Runs the given query and produces a result
   *
   * @param query The {@link SimpleQuery} or {@link BoundQuery} to run
   *
   * @returns Either a {@link QueryResult} or {@link StreamingQueryResult}
   */
  run<T extends RowType, P extends QueryParameters>(
    query: SimpleQuery<T> | BoundQuery<T, P>,
  ): Promise<QueryResult<T, P> | StreamingQueryResult<T, P>>
}

/**
 * Represents the result of executing a {@link QueryBase}
 */
export interface QueryResult<T extends RowType, P extends QueryParameters> {
  query: SimpleQuery<T> | BoundQuery<T, P>
  rows: T[]
  duration: Duration
}

/**
 * Represents the result of executing a {@link QueryBase} where values are provided
 * incrmentally
 */
export interface StreamingQueryResult<
  T extends RowType,
  P extends QueryParameters,
> extends Omit<QueryResult<T, P>, "rows"> {
  rows: AsyncIterable<T>
}
