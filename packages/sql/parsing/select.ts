import { ParseColumnReference } from "./columns.js"

import { JoinClause, SelectClause, WhereClause } from "../ast.js"

import { Flatten, Invalid } from "@telefrek/type-utils"
import { ParseTableReference } from "./tables.js"
import { ExtractUntil, NextToken, SplitSQL, StartsWith } from "./utils.js"
import { ExtractWhere } from "./where.js"

import { FromKeywords, JoinKeywords } from "./keywords.js"

/**
 * Parse the next select statement from the string
 */
export type ParseSelect<T> =
  NextToken<T> extends ["SELECT", infer Right]
    ? CheckSelect<ExtractColumns<Right>>
    : never

/**
 * Check to get the type information
 */
type CheckSelect<T> =
  T extends Partial<SelectClause<infer Columns, infer From>>
    ? Flatten<SelectClause<Columns, From> & CheckWhere<T> & CheckJoins<T>>
    : Invalid<"Not a valid SELECT statement">

/**
 * Parse out the columns and then process any from information
 */
type ExtractColumns<T> =
  ExtractUntil<T, "FROM"> extends [infer Columns, infer From]
    ? StartsWith<From, "FROM"> extends true
      ? Columns extends "*"
        ? {
            columns: Columns
          } & ExtractFrom<From>
        : {
            columns: ParseColumns<SplitSQL<Columns>>
          } & ExtractFrom<From>
      : never
    : never

/**
 * Parse the columns that were extracted
 */
type ParseColumns<T> = T extends [infer Column, ...infer Rest]
  ? Rest extends never[]
    ? [ParseColumnReference<Column>]
    : [ParseColumnReference<Column>, ...ParseColumns<Rest>]
  : never

/**
 * Verify if there is a {@link WhereClause}
 */
type CheckWhere<T> =
  T extends WhereClause<infer Where> ? WhereClause<Where> : object

/**
 * Verify if there is a {@link JoinClause}
 */
type CheckJoins<T> =
  T extends JoinClause<infer Joins> ? JoinClause<Joins> : object

/**
 * Extract the from information
 */
type ExtractFrom<T> =
  NextToken<T> extends [infer _, infer Clause]
    ? ExtractUntil<Clause, FromKeywords> extends [infer From, infer Rest]
      ? {
          from: ParseTableReference<From>
        } & ExtractJoin<Rest>
      : {
          from: ParseTableReference<Clause>
        }
    : never

/**
 * Extract the join portion if present
 */
type ExtractJoin<T> =
  StartsWith<T, JoinKeywords> extends true ? "not supported" : ExtractWhere<T>
