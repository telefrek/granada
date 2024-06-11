import type { Dec, Inc } from "@telefrek/type-utils/numeric.js"
import type { Trim } from "@telefrek/type-utils/strings.js"

import type { Invalid } from "@telefrek/type-utils"

export type FromKeywords = "WHERE" | OptionKeywords | JoinKeywords
export type JoinKeywords =
  | "INNER"
  | "OUTER"
  | "LEFT"
  | "RIGHT"
  | "FULL"
  | "JOIN"
export type OptionKeywords = "HAVING" | "GROUP" | "OFFSET" | "LIMIT"

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
 * Get the next token from the string (assumes normalized)
 */
export type NextToken<T> =
  Trim<T> extends `${infer Token} ${infer Remainder}`
    ? [Token, Remainder]
    : [Trim<T>, ""]

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
    : Invalid<"Unequal parenthesis"> // TODO: Start incorporating Invalid<>...

type EqualParenthesis<T> = CountOpen<T> extends CountClosed<T> ? true : false

type CountOpen<T, N extends number = 0> = T extends `${infer _}(${infer Right}`
  ? CountOpen<Right, Inc<N>>
  : N

type CountClosed<
  T,
  N extends number = 0,
> = T extends `${infer _})${infer Right}` ? CountClosed<Right, Inc<N>> : N
