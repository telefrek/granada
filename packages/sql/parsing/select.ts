import { ParseColumnReference } from "./columns.js"

import {
  JoinExpression,
  SelectClause,
  WhereClause,
  type ColumnReference,
  type JoinClause,
  type JoinType,
  type LogicalExpression,
} from "../ast.js"

import { Flatten, Invalid } from "@telefrek/type-utils"
import { ParseTableReference } from "./tables.js"
import { ExtractUntil, NextToken, SplitSQL, StartsWith } from "./utils.js"
import { ExtractWhere, type ParseExpression } from "./where.js"

import type { TableAliasRef } from "../queryBuilder/utils.js"
import { FromKeywords, JoinKeywords, type OptionKeywords } from "./keywords.js"

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
  Flatten<T> extends Partial<SelectClause<infer Columns, infer From>>
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
type ParseColumns<T, O = object> = T extends [infer Column, ...infer Rest]
  ? Rest extends never[]
    ? ParseColumnReference<Column & string> extends ColumnReference<
        infer C,
        infer A
      >
      ? Flatten<
          O & {
            [key in A]: ColumnReference<C, A>
          }
        >
      : Invalid<`Invalid column reference`>
    : ParseColumnReference<Column & string> extends ColumnReference<
          infer C,
          infer A
        >
      ? Flatten<
          ParseColumns<
            Rest,
            Flatten<
              O & {
                [key in A]: ColumnReference<C, A>
              }
            >
          >
        >
      : Invalid<`Invalid column reference`>
  : never

/**
 * Verify if there is a {@link WhereClause}
 */
type CheckWhere<T> =
  T extends WhereClause<infer Where> ? WhereClause<Where> : object

/**
 * Verify if there is a {@link JoinExpression}
 */
type CheckJoins<T> =
  T extends JoinClause<infer JType> ? JoinClause<JType> : object

/**
 * Extract the from information
 */
type ExtractFrom<T> =
  NextToken<T> extends [infer _, infer Clause]
    ? ExtractUntil<Clause, FromKeywords> extends [infer From, infer Rest]
      ? Flatten<
          {
            from: ParseTableReference<From>
          } & ExtractJoin<Rest>
        >
      : {
          from: ParseTableReference<Clause>
        }
    : never

/**
 * Extract the join portion if present
 */
type ExtractJoin<T> =
  StartsWith<T, JoinKeywords> extends true
    ? ExtractUntil<T, "WHERE" | OptionKeywords> extends [
        infer JoinClause,
        infer Rest,
      ]
      ? ExtractWhere<Rest & string> extends [infer Where, infer _]
        ? ParseJoinClause<JoinClause> & CheckWhere<Where>
        : ParseJoinClause<JoinClause>
      : ParseJoinClause<T>
    : ExtractWhere<T & string> extends [infer Where, infer _]
      ? CheckWhere<Where>
      : object

type ParseJoinClause<T> =
  T extends `${infer Modifiers} JOIN ${infer Reference} ON ${infer Clause}`
    ? ParseExpression<Clause> extends LogicalExpression
      ? Modifiers extends JoinType
        ? JoinClause<
            JoinExpression<
              Modifiers,
              TableAliasRef<Reference>,
              ParseExpression<Clause>
            >
          >
        : JoinClause<
            JoinExpression<
              "INNER",
              TableAliasRef<Reference>,
              ParseExpression<Clause>
            >
          >
      : never
    : never
