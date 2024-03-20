/**
 * This package contains the semantics around builders and how they should work
 * when constructing an AST to be submitted to the query executor
 */

import { ExecutionMode, ParameterizedQuery, Query } from "."
import type { QueryNode } from "./ast"

/**
 * Defines the generatl structure for a {@link Query} builder
 */
export interface QueryBuilder<T extends object> {
  /**
   * Build the {@link Query} with the information already provided
   *
   * @param name The name for the query
   * @param mode The {@link ExecutionMode} for the query
   *
   * @returns A {@link Query} that is ready to execute
   */
  build(name: string, mode?: ExecutionMode): Query<T>
}

export interface ParameterizedQueryBuilder<T, U extends object> {
  /**
   * Build the {@link ParameterizedQuery} with the given information
   *
   * @param name The name for the query
   * @param mode The {@link ExecutionMode} for the query
   *
   * @returns A {@link ParameterizedQuery} that is ready to bind and execute
   */
  buildParameterized(
    name: string,
    mode?: ExecutionMode,
  ): ParameterizedQuery<T, U>
}

/**
 * An abstract builder that uses the {@link QueryNode} AST
 */
export abstract class QueryBuilderBase<T extends object>
  implements QueryBuilder<T>
{
  protected node: QueryNode = {}

  constructor(root: QueryNode = {}) {
    this.node = root
  }

  /**
   * Protected method for allowing builders to translate between an
   * {@link QueryNode} AST and a {@link Query}
   *
   * @param ast The {@link QueryNode} representing the AST for the query
   * @param name The name for the query
   * @param mode The {@link ExecutionMode} for the query
   *
   * @returns A {@link Query} that represents that AST
   */
  protected abstract buildQuery(
    node: QueryNode,
    name: string,
    mode: ExecutionMode,
  ): Query<T>

  build(name: string, mode = ExecutionMode.Normal): Query<T> {
    return this.buildQuery(this.node, name, mode)
  }
}

export abstract class ParameterizedQueryBuilderBase<T, U extends object>
  implements ParameterizedQueryBuilder<T, U>
{
  protected node: QueryNode = {}

  constructor(root: QueryNode = {}) {
    this.node = root
  }

  /**
   * Protected method for allowing builders to translate between an
   * {@link QueryNode} AST and a {@link ParameterizedQuery}
   *
   * @param ast The {@link QueryNode} representing the AST for the query
   * @param name The name for the query
   * @param mode The {@link ExecutionMode} for the query
   *
   * @returns A {@link Query} that represents that AST
   */
  protected abstract buildQuery(
    node: QueryNode,
    name: string,
    mode: ExecutionMode,
  ): ParameterizedQuery<T, U>

  buildParameterized(): ParameterizedQuery<T, U> {
    throw new Error("Method not implemented.")
  }
}
