import { ParseColumnReference } from "./columns.js"

import { JoinClause, SelectClause, WhereClause } from "../ast.js"

import { Flatten } from "@telefrek/type-utils"
import { ParseTableReference } from "./tables.js"
import { ExtractUntil, NextToken, SplitSQL, StartsWith } from "./utils.js"
import { ParseWhere } from "./where.js"

import { FromKeywords, JoinKeywords } from "./keywords.js"

export type ParseSelect<T> =
  NextToken<T> extends ["SELECT", infer Right]
    ? CheckSelect<ParseColumns<Right>>
    : never

type CheckSelect<T> =
  T extends Partial<SelectClause<infer Columns, infer From>>
    ? Flatten<SelectClause<Columns, From> & CheckWhere<T> & CheckJoins<T>>
    : never

type ParseColumns<T> =
  ExtractUntil<T, "FROM"> extends [infer Columns, infer From]
    ? StartsWith<From, "FROM"> extends true
      ? Columns extends "*"
        ? {
            columns: Columns
          } & ParseFrom<From>
        : {
            columns: SplitColumns<SplitSQL<Columns>>
          } & ParseFrom<From>
      : never
    : never

type SplitColumns<T> = T extends [infer Column, ...infer Rest]
  ? Rest extends never[]
    ? [ParseColumnReference<Column>]
    : [ParseColumnReference<Column>, ...SplitColumns<Rest>]
  : never

type CheckWhere<T> =
  T extends WhereClause<infer Where> ? WhereClause<Where> : object

type CheckJoins<T> =
  T extends JoinClause<infer Joins> ? JoinClause<Joins> : object

type ParseFrom<T> =
  NextToken<T> extends [infer _, infer Clause]
    ? ExtractUntil<Clause, FromKeywords> extends [infer From, infer Rest]
      ? {
          from: ParseTableReference<From>
        } & ParseJoin<Rest>
      : {
          from: ParseTableReference<Clause>
        }
    : never

type ParseJoin<T> =
  StartsWith<T, JoinKeywords> extends true ? "not supported" : ParseWhere<T>
