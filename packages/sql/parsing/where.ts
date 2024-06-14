/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  BooleanValueType,
  BufferValueType,
  ColumnFilter,
  ColumnReference,
  FilteringOperation,
  LogicalExpression,
  LogicalOperation,
  LogicalTree,
  NullValueType,
  NumberValueType,
  ParameterValueType,
  StringValueType,
  ValueTypes,
  WhereClause,
} from "../ast.js"

import type { Invalid } from "@telefrek/type-utils"
import { Dec, Inc } from "@telefrek/type-utils/numeric.js"
import { Trim } from "@telefrek/type-utils/strings.js"
import { ParseColumnDetails } from "./columns.js"
import { OptionKeywords } from "./keywords.js"
import type { NormalizedJoin } from "./normalization.js"
import {
  ExtractUntil,
  Extractor,
  NextToken,
  StartsWith,
  type SplitWords,
} from "./utils.js"

/**
 * Helper to simply parse a where clause for testing or bypassing the Extractor functionality
 */
export type ParseWhereClause<T extends string> =
  ExtractWhere<T> extends [infer Where, infer _]
    ? Where extends WhereClause<infer W>
      ? WhereClause<W>
      : Where
    : never

/**
 * Defines a where extractor
 */
export type WhereExtractor<_T extends string> = Extractor<WhereClause<any>>

/**
 * Extract the {@link WhereClause} off of the query string
 */
export type ExtractWhere<T extends string> =
  StartsWith<T, "WHERE"> extends true
    ? ExtractUntil<T, OptionKeywords> extends [infer Where, infer Remainder]
      ? NextToken<Where> extends ["WHERE", infer Exp]
        ? [CheckWhere<ParseExpressionTree<NormalizeWhere<Exp>>>, Remainder]
        : [never, T]
      : NextToken<T> extends ["WHERE", infer Exp]
        ? [CheckWhere<ParseExpressionTree<NormalizeWhere<Exp>>>, ""]
        : [never, T]
    : [never, T]

type CheckWhere<T> = T extends LogicalExpression ? WhereClause<T> : T

type NormalizeWhere<T> = NormalizedJoin<SplitWhere<T>, LogicalOperation>

/**
 * Split the where statement by potential filtering operations
 */
type SplitWhere<T> = T extends `${infer Left}<>${infer Right}`
  ? [...SplitWhere<Left>, "<>", ...SplitWhere<Right>]
  : T extends `${infer Left}>${infer Next}${infer Right}`
    ? SplitEqual<Left, Next, Right, ">">
    : T extends `${infer Left}<${infer Next}${infer Right}`
      ? SplitEqual<Left, Next, Right, "<">
      : T extends `${infer Left}=${infer Right}`
        ? [...SplitWhere<Left>, "=", ...SplitWhere<Right>]
        : SplitWords<T>

/**
 * Split out a possible trailing '=' character
 */
type SplitEqual<
  Left extends string,
  Next extends string,
  Right extends string,
  C extends string,
> = Next extends "="
  ? [...SplitWhere<Left>, `${C}=`, ...SplitWhere<Right>]
  : [...SplitWhere<Left>, C, ...SplitWhere<`${Next}${Right}`>]

/**
 * Parse an expression tree
 */
export type ParseExpressionTree<T> =
  ExtractLogical<T> extends LogicalTree<infer Left, infer Op, infer Right>
    ? LogicalTree<Left, Op, Right>
    : ParseColumnFilter<T> extends ColumnFilter<
          infer Left,
          infer Op,
          infer Right
        >
      ? ColumnFilter<Left, Op, Right>
      : Trim<T> extends `( ${infer Inner} )`
        ? ParseExpressionTree<Inner>
        : Invalid<`invalid expression: ${T & string}`>

/**
 * Extract a {@link LogicalTree}
 */
type ExtractLogical<T> =
  ExtractUntil<T, LogicalOperation> extends [infer Left, infer Remainder]
    ? NextToken<Remainder> extends [infer Operation, infer Right]
      ? [Operation] extends [LogicalOperation]
        ? CheckLogicalTree<
            ParseExpressionTree<Left>,
            Operation,
            ParseExpressionTree<Right>
          >
        : never
      : never
    : ParseColumnFilter<T> extends ColumnFilter<
          infer Left,
          infer Op,
          infer Right
        >
      ? ColumnFilter<Left, Op, Right>
      : Invalid<`Cannot parse logical or conditional filter from ${T & string}`>

/**
 * Check the logical tree to ensure it's correctly formed or extract/generate an
 * Invalid error message
 */
type CheckLogicalTree<Left, Operation, Right> = Left extends LogicalExpression
  ? Right extends LogicalExpression
    ? Operation extends LogicalOperation
      ? LogicalTree<Left, Operation, Right>
      : Invalid<"Invalid logical tree detected">
    : Right extends Invalid<infer Reason>
      ? Invalid<Reason>
      : Invalid<"Invalid logical tree detected">
  : Left extends Invalid<infer Reason>
    ? Invalid<Reason>
    : Invalid<"Invalid logical tree detected">

/**
 * Parse out a {@link ColumnFilter}
 */
type ParseColumnFilter<T> =
  NextToken<T> extends [infer Column, infer Exp]
    ? NextToken<Exp> extends [infer Op, infer Value]
      ? Op extends FilteringOperation
        ? ExtractValue<Value> extends [infer V]
          ? CheckFilter<
              ColumnReference<ParseColumnDetails<Column>>,
              Op,
              CheckValueType<V>
            >
          : Invalid<`Failed to column filter: ${T & string}`>
        : Invalid<`Failed to column filter: ${T & string}`>
      : Invalid<`Failed to column filter: ${T & string}`>
    : Invalid<`Failed to column filter: ${T & string}`>

/**
 * Check that the column filter is appropriate and well formed
 */
export type CheckFilter<Left, Operation, Right> =
  Left extends ColumnReference<infer Reference, infer Alias>
    ? [Operation] extends [FilteringOperation]
      ? Right extends ValueTypes
        ? ColumnFilter<ColumnReference<Reference, Alias>, Operation, Right>
        : Right extends Invalid<infer Reason>
          ? Invalid<Reason>
          : Invalid<`Invalid column filter`>
      : Invalid<`Invalid column filter`>
    : Left extends Invalid<infer Reason>
      ? Invalid<Reason>
      : Invalid<`Invalid column filter`>

/**
 * Parse out the entire value string (may be quoted)
 */
type ExtractValue<T, N = 0, S extends string = ""> =
  NextToken<T> extends [infer Left, infer Right]
    ? Right extends ""
      ? [Trim<`${S} ${Left & string}`>]
      : Left extends `'${infer _}'`
        ? ExtractValue<Right, N, `${S} ${Left}`>
        : Left extends `'${infer Rest}`
          ? N extends 0
            ? ExtractValue<Right, Inc<N>, `${S} '${Rest & string}`>
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
    : Invalid<`Failed to extract value from: ${T & string}`>

/**
 * Set of valid digits
 */
type Digits = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"

/**
 * Check the type of value
 */
// TODO: Possible extension is to check that all characters for numbers are
// digits and expand to bigint if over 8 characters by default
type CheckValueType<T> = T extends `:${infer Name}`
  ? ParameterValueType<Name>
  : T extends `$${infer Name}`
    ? ParameterValueType<Name>
    : T extends `'${infer Value}'`
      ? StringValueType<Value>
      : T extends `0x${infer _}`
        ? BufferValueType<Int8Array>
        : Lowercase<T & string> extends "null"
          ? NullValueType
          : Lowercase<T & string> extends "true"
            ? BooleanValueType<true>
            : Lowercase<T & string> extends "false"
              ? BooleanValueType<false>
              : T extends `${infer First}${infer _}`
                ? [First] extends [Digits]
                  ? NumberValueType<number>
                  : Invalid<`Failed to detect value from: ${T & string}`>
                : Invalid<`Failed to detect value from: ${T & string}`>
