/**
 * Set of utilities to validate a query against a schema
 */

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
import type { Compare, Dec, Inc } from "./utils.js"

export type tmpTest =
  ParseSQLQuery<`with foo AS (SELECT id, name aS bname FROM bar WHERE id < 4),
    baz AS (SELECT * FROM foo)
    SELECT * FROM baz`>

/**
 * Parse a SQLQuery type from the given query string
 */
export type ParseSQLQuery<Query extends string> = ParseSQL<
  NormalizeQuery<Query>
>

/**
 * Trim the leading/trailing whitespace characters
 */
type Trim<T> = T extends ` ${infer Rest}`
  ? Trim<Rest>
  : T extends `\n${infer Rest}`
    ? Trim<Rest>
    : T extends `${infer Rest} `
      ? Trim<Rest>
      : T extends `${infer Rest}\n`
        ? Trim<Rest>
        : T

type _CountParenthesis<T> = Compare<_CountOpen<T>, _CountClosed<T>>

type _CountOpen<T, N extends number = 0> = T extends `${infer _}(${infer Right}`
  ? _CountOpen<Right, Inc<N>>
  : N

type _CountClosed<
  T,
  N extends number = 0,
> = T extends `${infer _})${infer Right}` ? _CountClosed<Right, Inc<N>> : N

type Split<
  T,
  Token extends string = ",",
  S extends string = "",
> = T extends `${infer Left} ${Token} ${infer Right}`
  ? _CountParenthesis<`${S} ${Left}`> extends 0
    ? [Trim<`${S} ${Left}`>, ...Split<Trim<Right>, Token>]
    : Split<Right, Token, Trim<`${S} ${Left} ${Token}`>>
  : _CountParenthesis<`${S} ${T & string}`> extends 0
    ? [Trim<`${S} ${T & string}`>]
    : never

type NormalizeQuery<T> = SplitJoin<
  SplitJoin<SplitJoin<SplitJoin<T, "\n">, ",">, "(">,
  ")"
>

type SplitJoin<T, C extends string = ","> = Join<SplitTrim<T, C>>

type SplitTrim<T, C extends string = ","> =
  Trim<T> extends `${infer Left}${C}${infer Right}`
    ? [...SplitTrim<Left, C>, Trim<C>, ...SplitTrim<Right, C>]
    : [NormalizedJoin<SplitWords<Trim<T>>>]

type SplitWords<T> =
  Trim<T> extends `${infer Left} ${infer Right}`
    ? [...SplitWords<Left>, ...SplitWords<Right>]
    : [Trim<T>]

type NormalizedJoin<T> = T extends [infer Left, ...infer Rest]
  ? Rest extends never[]
    ? Check<Left & string>
    : `${Check<Left & string> & string} ${NormalizedJoin<Rest> & string}`
  : ""

type Check<T extends string> =
  Uppercase<T> extends NormalizedKeyWords ? Uppercase<T> : T

type NormalizedKeyWords =
  | "SELECT"
  | "INSERT"
  | "UPDATE"
  | "DELETE"
  | "FROM"
  | "WHERE"
  | "AS"
  | "JOIN"
  | "INTO"
  | "OUTER"
  | "INNER"
  | "FULL"
  | "HAVING"
  | "LEFT"
  | "RIGHT"
  | "LATERAL"
  | "ORDER"
  | "BY"
  | "LIMIT"
  | "OFFSET"
  | "WITH"

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
          with: ParseWithClauses<Split<WithClauses>>
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
  : "foo"

type ParseQuery<T> = ParseSelect<T>

type ParseSelect<T> =
  NextToken<T> extends ["SELECT", infer Right]
    ? CheckSelect<ParseColumns<Right>>
    : never

type _<T> = T
type Flatten<T> = _<{ [K in keyof T]: T[K] }>

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
            columns: SplitColumns<Split<Columns>>
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
      ? Operation extends LogicalOperation
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

type CheckValueType<T> =
  Lowercase<T & string> extends "null"
    ? NullValueType
    : Lowercase<T & string> extends "true"
      ? BooleanValueType<true>
      : Lowercase<T & string> extends "false"
        ? BooleanValueType<false>
        : T extends `:${infer Name}`
          ? ParameterValueType<Name>
          : T extends `0x${infer _}`
            ? BufferValueType<Int8Array>
            : T extends `'${infer Value}'`
              ? StringValueType<Value>
              : T extends `${infer First}${infer _}`
                ? First extends Digits
                  ? NumberValueType<number>
                  : never
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

/**
 * Check if T starts with S (case insensitive)
 */
type StartsWith<T, S> =
  NextToken<T> extends [infer Left, infer _]
    ? Uppercase<Left & string> extends S
      ? true
      : false
    : false

type ExtractUntil<T, K, N = 0, S extends string = ""> =
  NextToken<T> extends [infer Token, infer Rest]
    ? Rest extends ""
      ? [Trim<S>]
      : Token extends "("
        ? ExtractUntil<Rest, K, Inc<N>, `${S} (`>
        : Token extends ")"
          ? ExtractUntil<Rest, K, Dec<N>, `${S} )`>
          : Uppercase<Token & string> extends K
            ? N extends 0
              ? [Trim<S>, Trim<`${Token & string} ${Rest & string}`>]
              : ExtractUntil<Rest, K, N, `${S} ${Token & string}`>
            : ExtractUntil<Rest, K, N, `${S} ${Token & string}`>
    : never

/**
 * Joins the segments
 */
type Join<T, C extends string = " "> = T extends [infer Left, ...infer Rest]
  ? Rest extends never[]
    ? `${Left & string}`
    : `${Left & string}${C}${Join<Rest, C> & string}`
  : ""

/**
 * Get the next token from the string (assumes normalized)
 */
type NextToken<T> =
  Trim<T> extends `${infer Token} ${infer Remainder}`
    ? [Token, Remainder]
    : [Trim<T>, ""]
