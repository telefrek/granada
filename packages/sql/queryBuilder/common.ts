import type { CombinedQueryClause, QueryClause, SQLQuery } from "../ast.js"

/**
 * Common interface that returns the current AST
 */
export interface QueryAST<
  Query extends QueryClause | CombinedQueryClause =
    | QueryClause
    | CombinedQueryClause,
> {
  ast: SQLQuery<Query>
}
