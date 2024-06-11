/**
 * Set of utilities to validate a query against a schema
 */

import type { Dec, Inc } from "@telefrek/type-utils/numeric.js"
import { NormalizeQuery } from "./parsing/normalization.js"
import {
  ExtractUntil,
  NextToken,
  SplitSQL,
  StartsWith,
} from "./parsing/utils.js"

import type {
  BooleanValueType,
  BufferValueType,
  ColumnFilter,
  ColumnReference,
  FilteringOperation,
  JoinClause,
  LogicalOperation,
  LogicalTree,
  NamedQuery,
  NullValueType,
  NumberValueType,
  ParameterValueType,
  SQLQuery,
  SelectClause,
  StringValueType,
  TableColumnReference,
  TableReference,
  UnboundColumnReference,
  WhereClause,
  WithClause,
} from "./ast.js"

import { Flatten } from "@telefrek/type-utils/index.js"
import { Trim } from "@telefrek/type-utils/strings.js"

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

/**
 * Parse T as a {@link SQLQuery}
 */
type ParseSQL<T extends string> = CheckQuery<ParseWith<T>>

/**
 * Validate T is a {@link SQLQuery}
 */
type CheckQuery<T> =
  T extends Partial<SQLQuery<infer Query>>
    ? Flatten<SQLQuery<Query> & CheckWith<T>>
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

type ParseSelect<T> =
  NextToken<T> extends ["SELECT", infer Right]
    ? CheckSelect<ParseColumns<Right>>
    : never

type CheckSelect<T> =
  T extends Partial<SelectClause<infer Columns, infer From>>
    ? Flatten<SelectClause<Columns, From> & CheckWhere<T> & CheckJoins<T>>
    : never

type CheckWhere<T> =
  T extends WhereClause<infer Where> ? WhereClause<Where> : object

type CheckJoins<T> =
  T extends JoinClause<infer Joins> ? JoinClause<Joins> : object

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

type FromKeywords = "WHERE" | OptionKeywords | JoinKeywords

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

type JoinKeywords = "INNER" | "OUTER" | "LEFT" | "RIGHT" | "FULL" | "JOIN"

type ParseJoin<T> =
  StartsWith<T, JoinKeywords> extends true ? "not supported" : ParseWhere<T>

type OptionKeywords = "HAVING" | "GROUP" | "OFFSET" | "LIMIT"

type ParseWhere<T> =
  StartsWith<T, "WHERE"> extends true
    ? ExtractUntil<T, OptionKeywords> extends [infer Where, infer _]
      ? NextToken<Where> extends ["WHERE", infer Exp]
        ? {
            where: ParseExpressionTree<Exp>
          }
        : never
      : NextToken<T> extends ["WHERE", infer Exp]
        ? {
            where: ParseExpressionTree<Exp>
          }
        : never
    : "none"

type ParseExpressionTree<T> = T extends `( ${infer Inner} )`
  ? ParseExpressionTree<Inner>
  : ParseColumnFilter<T> | ExtractLogical<T>

type ExtractLogical<T> =
  ExtractUntil<T, LogicalOperation> extends [infer Left, infer Remainder]
    ? NextToken<Remainder> extends [infer Operation, infer Right]
      ? [Operation] extends [LogicalOperation]
        ? LogicalTree<
            ParseExpressionTree<Left>,
            Operation,
            ParseExpressionTree<Right>
          >
        : never
      : never
    : ParseColumnFilter<T>

type ParseColumnFilter<T> =
  NextToken<T> extends [infer Column, infer Exp]
    ? NextToken<Exp> extends [infer Op, infer Value]
      ? Op extends FilteringOperation
        ? ExtractValue<Value> extends [infer V]
          ? ColumnFilter<
              ColumnReference<ParseColumnDetails<Column>>,
              Op,
              CheckValueType<V>
            >
          : never
        : never
      : never
    : never

type ExtractValue<T, N = 0, S extends string = ""> =
  NextToken<T> extends [infer Left, infer Right]
    ? Right extends ""
      ? [Trim<`${S} ${Left & string}`>]
      : Left extends `'${infer _}'`
        ? ExtractValue<Right, N, `${S} ${Left}`>
        : Left extends `'${infer Rest}`
          ? N extends 0
            ? ExtractValue<Right, Inc<N>, `${S} ${Rest & string}`>
            : ExtractValue<Right, Inc<N>, `${S} ${Left & string}`>
          : Left extends `${infer _}\\'`
            ? ExtractValue<Right, N, `${S} ${Left & string}`>
            : Left extends `${infer Rest}'`
              ? N extends 1
                ? [Trim<`${S} ${Rest & string}`>, Right]
                : ExtractValue<Right, Dec<N>, `${S} ${Left & string}`>
              : S extends ""
                ? [Left, Right]
                : ExtractValue<Right, N, `${S} ${Left & string}`>
    : never

type Digits = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | " " | "9"

type CheckValueType<T> = T extends `:${infer Name}`
  ? ParameterValueType<Name>
  : T extends `$${infer Name}`
    ? ParameterValueType<Name>
    : T extends `'${infer Value}'`
      ? StringValueType<Value>
      : T extends `0x${infer _}`
        ? BufferValueType<Int8Array>
        : T extends `${infer First}${infer _}`
          ? First extends [Digits]
            ? NumberValueType<number>
            : never
          : Lowercase<T & string> extends "null"
            ? NullValueType
            : Lowercase<T & string> extends "true"
              ? BooleanValueType<true>
              : Lowercase<T & string> extends "false"
                ? BooleanValueType<false>
                : never

type ParseTableReference<T> = T extends `( ${infer Query} ) AS ${infer Alias}`
  ? NamedQuery<ParseSQL<Query>, Alias>
  : T extends `${infer TableName} AS ${infer Alias}`
    ? TableReference<TableName, Alias>
    : TableReference<T & string>

type SplitColumns<T> = T extends [infer Column, ...infer Rest]
  ? Rest extends never[]
    ? [ParseColumnReference<Column>]
    : [ParseColumnReference<Column>, ...SplitColumns<Rest>]
  : never

type ParseColumnReference<T> =
  T extends `${infer ColumnDetails} AS ${infer Alias}`
    ? ColumnReference<ParseColumnDetails<ColumnDetails>, Alias>
    : ColumnReference<ParseColumnDetails<T>>

type ParseColumnDetails<T> = T extends `${infer Table}.${infer Column}`
  ? TableColumnReference<Table, Column>
  : UnboundColumnReference<T & string>
