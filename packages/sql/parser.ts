/**
 * Set of utilities to validate a query against a schema
 */

import type { Invalid } from "@telefrek/type-utils"
import type { NormalizeQuery } from "./parsing/normalization.js"
import type { ParseSQL } from "./parsing/queries.js"

/**
 * Things to do
 *
 * - Fix where clause id=1 parsing, etc
 * - Add more tests for structure
 * - Verify columns on select
 * - Parse insert/update/delete
 * - Add aggregation methods to columns
 * - Add in unions, etc
 */

/**
 * Parse a SQLQuery type from the given query string
 */
export type ParseSQLQuery<Query extends string> = ParseSQL<
  NormalizeQuery<Query>
>

export type ParseAlias<Value extends string, Valid extends string> =
  NormalizeQuery<Value> extends `${infer Target} AS ${infer Alias}`
    ? [Target] extends [Valid]
      ? SQLAlias<Target, Alias>
      : Invalid<`${Target} does not extend a valid column`>
    : [Value] extends [Valid]
      ? [Value]
      : Invalid<`${Value} does not extend ${Valid}`>

export type SQLAlias<Target, Alias> = {
  target: Target
  alias: Alias
}
