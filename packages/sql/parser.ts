/**
 * Objects that help with parsing SQL into AST or queries
 */

import type { TokenizeQuery } from "./utils.js"

export type SQLQueryKeywords =
  | "AS"
  | "BY"
  | "COLUMNS"
  | "DELETE"
  | "EXCEPT"
  | "FROM"
  | "GROUP"
  | "HAVING"
  | "IN"
  | "INNER"
  | "INTO"
  | "INSERT"
  | "INTERSECT"
  | "JOIN"
  | "LEFT"
  | "LIMIT"
  | "MERGE"
  | "MINUS"
  | "NOT"
  | "OFFSET"
  | "ORDER"
  | "OUTER"
  | "RIGHT"
  | "SELECT"
  | "UNION"
  | "UPDATE"
  | "VALUES"
  | "WHERE"
  | "WITH"

export function query<Query extends string>(query: ValidQuery<Query>): Query {
  return query
}

/**
 * Loose steps in my head at this point...
 *
 * 1. Tokenize the query (done)
 * 2. Verify structure is valid via AST translation
 * 3. Verify AST against schema
 *    Note: We may need to manipulate the schema with any projections we find...
 * 4. Generate required parameters (if located) with types
 *
 * After that, we should be able to require the parameters to match for binding
 * to give intellisense on both the query itself and the required syntax for it...
 *
 * This should also allow us to pass/create a typed query that we can pass
 * through to whatever driver we setup for executing (in memory, database, etc.)
 */

type ValidQuery<Query extends string> =
  TokenizeQuery<Query> extends [infer FirstToken, ...infer Rest]
    ?
        | InsertQuery<FirstToken, Rest, Query>
        | DeleteQuery<FirstToken, Rest, Query>
    : never

type InsertQuery<First, Tokens, Query extends string> =
  Uppercase<First & string> extends "INSERT"
    ? Tokens extends [infer Next, ...infer _]
      ? Uppercase<Next & string> extends "INTO"
        ? Query
        : never
      : never
    : never

type DeleteQuery<First, Tokens, Query extends string> =
  Uppercase<First & string> extends "DELETE"
    ? Tokens extends [infer Next, ...infer _]
      ? Uppercase<Next & string> extends "FROM"
        ? Query
        : never
      : never
    : never
