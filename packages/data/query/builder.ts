/**
 * This package contains the semantics around builders and how they should work
 * when constructing an AST to be submitted to the query executor
 */

import type { Query } from "."
import type { QueryNode } from "./ast"

/**
 * Defines the generatl structure for a {@link Query} builder
 */
export interface QueryBuilder<T> {
  /**
   * Build the {@link Query} with the information already provided
   *
   * @returns A {@link Query} that is ready to execute
   */
  build(): Query<T>
}

/**
 * An abstract builder that uses the {@link QueryNode} AST
 */
export abstract class QueryBuilderBase<T> implements QueryBuilder<T> {
  protected ast: QueryNode = {}

  constructor(root: QueryNode = {}) {
    this.ast = root
  }

  /**
   * Protected method for allowing builders to translate between an
   * {@link QueryNode} AST and a {@link Query}
   *
   * @param ast The {@link QueryNode} representing the AST for the query
   *
   * @returns A {@link Query} that represents that AST
   */
  protected abstract buildQuery<T>(ast: QueryNode): Query<T>

  build(): Query<T> {
    return this.buildQuery(this.ast)
  }
}
