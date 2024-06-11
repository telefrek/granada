import { Trim, type Join } from "@telefrek/type-utils/strings.js"

/**
 * Ensure a query has a known structure with keywords uppercase and consistent spacing
 */
export type NormalizeQuery<T> = SplitJoin<
  SplitJoin<SplitJoin<SplitJoin<T, "\n">, ",">, "(">,
  ")"
>

/**
 * Split and then rejoin a string
 */
type SplitJoin<T, C extends string = ","> = Join<SplitTrim<T, C>>

/**
 * Split and trim all the values
 */
type SplitTrim<T, C extends string = ","> =
  Trim<T> extends `${infer Left}${C}${infer Right}`
    ? [...SplitTrim<Left, C>, Trim<C>, ...SplitTrim<Right, C>]
    : [NormalizedJoin<SplitWords<Trim<T>>>]

/**
 * Split words based on spacing only
 */
type SplitWords<T> =
  Trim<T> extends `${infer Left} ${infer Right}`
    ? [...SplitWords<Left>, ...SplitWords<Right>]
    : [Trim<T>]

/**
 * Normalize the values by ensuring capitalization
 */
type NormalizedJoin<T> = T extends [infer Left, ...infer Rest]
  ? Rest extends never[]
    ? Check<Left & string>
    : `${Check<Left & string> & string} ${NormalizedJoin<Rest> & string}`
  : ""

/**
 * Check if a value is a normalized keyword
 */
type Check<T extends string> =
  Uppercase<T> extends NormalizedKeyWords ? Uppercase<T> : T

/**
 * Set of keywords we need to ensure casing for
 */
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
