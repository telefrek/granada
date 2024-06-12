import type { Dec, Inc } from "@telefrek/type-utils/numeric.js"
import type { Trim } from "@telefrek/type-utils/strings.js"

import type { Invalid } from "@telefrek/type-utils"

/**
 * Utility type for extracting clauses and remainders
 */
export type Extractor<U> = [clause: U | never, remainder: string]

/**
 * Check if T starts with S (case insensitive)
 */
export type StartsWith<T, S> =
  NextToken<T> extends [infer Left, infer _]
    ? Uppercase<Left & string> extends S
      ? true
      : false
    : false

/**
 * Split words based on spacing only
 */
export type SplitWords<T> =
  Trim<T> extends `${infer Left} ${infer Right}`
    ? [...SplitWords<Left>, ...SplitWords<Right>]
    : [Trim<T>]

/**
 * Get the next token from the string (assumes normalized)
 */
export type NextToken<T> =
  Trim<T> extends `${infer Token} ${infer Remainder}`
    ? [Token, Remainder]
    : [Trim<T>, ""]

/**
 * Keep aggregating the next token until the terminator is reached
 */
export type ExtractUntil<T, K, N = 0, S extends string = ""> =
  NextToken<T> extends [infer Token, infer Rest]
    ? Rest extends ""
      ? [Trim<S>]
      : Token extends "("
        ? ExtractUntil<Rest, K, Inc<N>, `${S} (`>
        : Token extends ")"
          ? ExtractUntil<Rest, K, Dec<N>, `${S} )`>
          : [Uppercase<Token & string>] extends [K]
            ? N extends 0
              ? [Trim<S>, Trim<`${Token & string} ${Rest & string}`>]
              : ExtractUntil<Rest, K, N, `${S} ${Token & string}`>
            : ExtractUntil<Rest, K, N, `${S} ${Token & string}`>
    : never

/**
 * Custom split that is SQL aware and respects parenthesis depth
 */
export type SplitSQL<
  T,
  Token extends string = ",",
  S extends string = "",
> = T extends `${infer Left} ${Token} ${infer Right}`
  ? EqualParenthesis<`${S} ${Left}`> extends true
    ? [Trim<`${S} ${Left}`>, ...SplitSQL<Trim<Right>, Token>]
    : SplitSQL<Right, Token, Trim<`${S} ${Left} ${Token}`>>
  : EqualParenthesis<`${S} ${T & string}`> extends true
    ? [Trim<`${S} ${T & string}`>]
    : Invalid<"Unequal parenthesis">

/**
 * Test if ( matches ) counts
 */
type EqualParenthesis<T> = CountOpen<T> extends CountClosed<T> ? true : false

/**
 * Count the ( characters
 */
type CountOpen<T, N extends number = 0> = T extends `${infer _}(${infer Right}`
  ? CountOpen<Right, Inc<N>>
  : N

/**
 * Count the ) characters
 */
type CountClosed<
  T,
  N extends number = 0,
> = T extends `${infer _})${infer Right}` ? CountClosed<Right, Inc<N>> : N
