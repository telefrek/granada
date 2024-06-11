/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  BooleanValueType,
  BufferValueType,
  ColumnFilter,
  ColumnReference,
  FilteringOperation,
  LogicalOperation,
  LogicalTree,
  NullValueType,
  NumberValueType,
  ParameterValueType,
  StringValueType,
  WhereClause,
} from "../ast.js"

import { Dec, Inc } from "@telefrek/type-utils/numeric.js"
import { Trim } from "@telefrek/type-utils/strings.js"
import { ParseColumnDetails } from "./columns.js"
import { OptionKeywords } from "./keywords.js"
import { ExtractUntil, Extractor, NextToken, StartsWith } from "./utils.js"

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
        ? [WhereClause<ParseExpressionTree<Exp>>, Remainder]
        : [never, T]
      : NextToken<T> extends ["WHERE", infer Exp]
        ? [WhereClause<ParseExpressionTree<Exp>>, ""]
        : [never, T]
    : [never, T]

/**
 * Parse an expression tree
 */
export type ParseExpressionTree<T> = T extends `( ${infer Inner} )`
  ? ParseExpressionTree<Inner>
  : ParseColumnFilter<T> | ExtractLogical<T>

/**
 * Extract a {@link LogicalTree}
 */
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

/**
 * Parse out a {@link ColumnFilter}
 */
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

/**
 * Set of valid digits
 */
type Digits = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"

/**
 * Check the type of value
 */
type CheckValueType<T> = T extends `:${infer Name}`
  ? ParameterValueType<Name>
  : T extends `$${infer Name}`
    ? ParameterValueType<Name>
    : T extends `'${infer Value}'`
      ? StringValueType<Value>
      : T extends `0x${infer _}`
        ? BufferValueType<Int8Array>
        : T extends `${infer First}${infer _}`
          ? [First] extends [Digits]
            ? NumberValueType<number>
            : never
          : Lowercase<T & string> extends "null"
            ? NullValueType
            : Lowercase<T & string> extends "true"
              ? BooleanValueType<true>
              : Lowercase<T & string> extends "false"
                ? BooleanValueType<false>
                : never
