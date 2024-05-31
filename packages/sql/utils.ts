/**
 * Utilities that are helpful when working with SQL
 */

import type { ColumnAggregateOperation } from "./ast.js"

/**
 * Support up to 32 parameters
 */
type Increment<N extends number> = [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  30,
  31,
  32,
  ...number[],
][N]

export type Decrement<N extends number> = [
  number,
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  30,
  31,
  ...number[],
][N]

/**
 * Utility for getting the type of aggregate
 */
export type AggregateType<
  Operation extends ColumnAggregateOperation,
  ColumnType,
> = Operation extends "SUM" | "COUNT" | "AVERAGE" ? number : ColumnType

// TODO: Don't consume the whole things at once...
/**
 * Tokenizes the query into it's individual elements which should be processable
 * from left to right to generate a valid query structure.
 */
export type TokenizeQuery<T extends string> =
  T extends `${infer Prefix},${infer Rest}`
    ? [...TokenizeQuery<Prefix>, ...TokenizeQuery<Rest>]
    : T extends `${infer Prefix}\n${infer Rest}`
      ? [...TokenizeQuery<Prefix>, ...TokenizeQuery<Rest>]
      : T extends `${infer Prefix} ${infer Rest}`
        ? [...TokenizeQuery<Prefix>, ...TokenizeQuery<Rest>]
        : T extends `${infer Prefix}(${infer Rest}`
          ? [...TokenizeQuery<Prefix>, "(", ...TokenizeQuery<Rest>]
          : T extends `${infer Prefix})${infer Rest}`
            ? [...TokenizeQuery<Prefix>, ")", ...TokenizeQuery<Rest>]
            : T extends `${infer Prefix})`
              ? [...TokenizeQuery<Prefix>, ")"]
              : T extends `(${infer Rest}`
                ? ["(", ...TokenizeQuery<Rest>]
                : T extends `,${infer Rest}`
                  ? [...TokenizeQuery<Rest>]
                  : T extends `${infer Prefix},`
                    ? [...TokenizeQuery<Prefix>]
                    : T extends `\n${infer Rest}`
                      ? [...TokenizeQuery<Rest>]
                      : T extends `${infer Prefix}\n`
                        ? [...TokenizeQuery<Prefix>]
                        : T extends ` ${infer Rest}`
                          ? [...TokenizeQuery<Rest>]
                          : T extends `${infer Prefix} `
                            ? [...TokenizeQuery<Prefix>]
                            : T extends "\n"
                              ? []
                              : T extends " "
                                ? []
                                : T extends ","
                                  ? []
                                  : T extends ""
                                    ? []
                                    : [T]

/**
 * Rebuild the query as a parameterized query to get the types
 */
export type Parameterize<T extends ReadonlyArray<string>> =
  IncrementalParameters<T>

/**
 * Join the strings using an increasing parameter
 */
export type IncrementalParameters<
  T extends readonly string[],
  P extends number = 0,
> = T extends [infer Head]
  ? `${Head & string}`
  : T extends [infer Head, ...infer Tail]
    ? Tail extends readonly string[]
      ? `${Head & string}$${P}${IncrementalParameters<Tail, Increment<P>>}`
      : Tail extends string
        ? `${Head & string}$${P}${Tail & string}`
        : `${Head & string}`
    : ""
