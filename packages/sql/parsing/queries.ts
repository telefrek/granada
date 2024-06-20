import { Flatten } from "@telefrek/type-utils"
import { NamedQuery, SQLQuery, WithClause, type QueryClause } from "../ast.js"
import { ParseSelect } from "./select.js"
import { ExtractUntil, NextToken, SplitSQL } from "./utils.js"

/**
 * Parse T as a {@link SQLQuery}
 */
export type ParseSQL<T extends string> = CheckQuery<ParseWith<T>>

/**
 * Validate T is a {@link SQLQuery}
 */
type CheckQuery<T> =
  T extends Partial<SQLQuery<infer Query>>
    ? Flatten<SQLQuery<Query> & CheckWith<T>>
    : T extends Omit<QueryClause, "type">
      ? Flatten<T & { type: "SQLQuery" }>
      : T

type CheckWith<T> = T extends WithClause<infer With> ? WithClause<With> : object

type StatementTypes = "SELECT" | "INSERT" | "UPDATE" | "DELETE"

/**
 * Parse the with clause
 */
type ParseWith<T> =
  NextToken<T> extends ["WITH", infer Rest]
    ? ExtractUntil<Rest, StatementTypes> extends [
        infer WithClauses,
        infer Query,
      ]
      ? {
          with: ParseWithClauses<SplitSQL<WithClauses>>
          query: ParseQuery<Query>
        }
      : never
    : {
        query: ParseQuery<T>
      }

type ParseWithClauses<T> = T extends [infer CTE, ...infer Rest]
  ? Rest extends never[]
    ? [ParseCTE<CTE>]
    : [ParseCTE<CTE>, ...ParseWithClauses<Rest>]
  : never

type ParseCTE<T> = T extends `${infer Alias} AS ( ${infer Query} )`
  ? NamedQuery<ParseSQL<Query>, Alias>
  : never

type ParseQuery<T> = ParseSelect<T>
