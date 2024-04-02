/**
 * Provides the basic structure for query definitions
 */

import { Duration } from "@telefrek/core/time"

export type BuildableQueryTypes = QueryType.SIMPLE | QueryType.PARAMETERIZED

/**
 * Type responsible for building queries from nodes
 */
export interface QueryBuilder {
  /**
   * Responsible for translating between a {@link QueryNode} and a query
   *
   * @param node The {@link QueryNode} that represents the query intent
   * @param queryType The {@link QueryType} being built for
   * @param name The name of the query
   * @param mode The {@link ExecutionMode} for the query
   */
  build<
    Q extends BuildableQueryTypes,
    R extends RowType,
    P extends QueryParameters,
  >(
    node: QueryNode,
    queryType: Q,
    name: string,
    mode: ExecutionMode,
  ): [P] extends [never] ? SimpleQuery<R> : ParameterizedQuery<R, P>
}

/**
 * Represents the basic information about a node in the query AST
 */
export interface QueryNode {
  parent?: QueryNode
  children?: QueryNode[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RowType = Record<string, any>

/**
 * Assign the child to the parent and return any existing parent from the child
 *
 * @param parent The {@link QueryNode} to make the parent of the child
 * @param child The {@link QueryNode} to make a child of the parent
 * @returns The existing child parent {@link QueryNode} or undefined
 */
export function makeChild(
  parent: QueryNode,
  child: QueryNode,
): QueryNode | undefined {
  const previous = child.parent

  child.parent = parent
  if (parent.children) {
    parent.children.push(child)
  } else {
    parent.children = [child]
  }

  return previous
}

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
export type QueryBase<Q extends QueryType, R extends RowType> = {
  queryType: Q
  name: string
  mode: ExecutionMode
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
> = QueryBase<QueryType.PARAMETERIZED, R> & {
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
> = QueryBase<QueryType.BOUND, R> & {
  parameters: Readonly<P>
}

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
  ): Promise<QueryResult<T>>
}

/**
 * Represents the result of executing a {@link QueryBase}
 */
export type QueryResult<T extends RowType> =
  | {
      mode: ExecutionMode.Normal
      rows: T[]
      duration: Duration
    }
  | {
      mode: ExecutionMode.Streaming
      stream: AsyncIterable<T>
      duration: Duration
    }
