/**
 * This package contains the semantics around builders and how they should work
 * when constructing an AST to be submitted to the query executor
 */

import type { Query } from "."
import type { QueryNode } from "./ast"

/**
 * Defines the generatl structure for a {@link Query} builder
 */
export interface QueryBuilder {
  /**
   * Build the {@link Query} with the information already provided
   *
   * @returns A {@link Query} that is ready to execute
   */
  build<T>(): Query<T>
}

/**
 * An abstract builder that uses the {@link QueryNode} AST
 */
export abstract class QueryBuilderBase implements QueryBuilder {
  protected ast: QueryNode = {}

  /**
   * Protected method for allowing builders to translate between an
   * {@link QueryNode} AST and a {@link Query}
   *
   * @param ast The {@link QueryNode} representing the AST for the query
   *
   * @returns A {@link Query} that represents that AST
   */
  protected abstract buildQuery<T>(ast: QueryNode): Query<T>

  build<T>(): Query<T> {
    return this.buildQuery(this.ast)
  }
}
