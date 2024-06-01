/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Set of utilities to validate a query against a schema
 */

import type {
  DeleteClause,
  InsertClause,
  NamedQuery,
  SQLQuery,
  SelectClause,
  UpdateClause,
} from "./ast.js"
import type { Dec, Inc } from "./utils.js"

// type t = ParseSQLQuery<`WITH foo AS (SELECT id, name FROM bar),
//     baz AS (SELECT * FROM foo)
//     SELECT * FROM foo`>

// type t2 = ParseSQLQuery<`DELETE FROM foo WHERE id=:param`>

export type ParseSQLQuery<Query> =
  NextToken<Query> extends ["WITH", infer _, infer Rest]
    ? ExtractWith<Rest> extends [infer W, infer S]
      ? SQLQuery<ParseWith<W>, ExtractQueryClause<Trim<S>>>
      : never
    : SQLQuery<never, ExtractQueryClause<Trim<Query>>>

type ParseWith<T> = ParseWithClauses<JoinWith<SplitWith<T>>>

type ParseWithClauses<T> = T extends [infer First, ...infer Rest]
  ? [ExtractNamedQuery<First>, ...ParseWithClauses<Rest>]
  : T extends [infer Last]
    ? [ExtractNamedQuery<Last>]
    : []

type ExtractNamedQuery<T> = T extends `${infer Table} AS (${infer Q})`
  ? Table extends `, ${infer Name}`
    ? NamedQuery<ExtractQueryClause<Trim<Q>>, Name>
    : NamedQuery<ExtractQueryClause<Trim<Q>>, Table>
  : never

type ExtractQueryClause<T> = T extends `SELECT ${infer _}`
  ? SelectClause<any>
  : T extends `INSERT ${infer _}`
    ? InsertClause<any>
    : T extends `UPDATE ${infer _}`
      ? UpdateClause<any>
      : T extends `DELETE ${infer _}`
        ? DeleteClause<any>
        : never

type SplitWith<T> = T extends `${infer Left},${infer Right}`
  ? [...SplitWith<Left>, ",", ...SplitWith<Right>]
  : T extends `${infer Left}(${infer Right}`
    ? [...SplitWith<Left>, "(", ...SplitWith<Right>]
    : T extends `${infer Left})${infer Right}`
      ? [...SplitWith<Left>, ")", ...SplitWith<Right>]
      : T extends ""
        ? []
        : [Trim<T>]

type JoinWith<T, N = 0, S = ""> = T extends ["(", ...infer Rest]
  ? [...JoinWith<Rest, Inc<N>, `${S & string} (`>]
  : T extends [")", ...infer Rest]
    ? Dec<N> extends 0
      ? [Trim<`${S & string} )`>, ...JoinWith<Rest>]
      : JoinWith<Rest, Dec<N>, `${S & string} )`>
    : T extends [infer Next, ...infer Rest]
      ? JoinWith<Rest, N, `${S & string} ${Next & string}`>
      : T extends [infer Last]
        ? [Trim<`${S & string} ${Last & string}`>]
        : S extends ""
          ? []
          : [Trim<`${S & string}`>]

/**
 * Split the query into [WithClause, Remainder]
 */
type ExtractWith<Query, N = 0, S = ""> =
  NextToken<Query> extends ["(", "(", infer Rest]
    ? ExtractWith<Rest, Inc<N>, `${S & string} (`>
    : NextToken<Query> extends [")", ")", infer Rest]
      ? ExtractWith<Rest, Dec<N>, `${S & string} )`>
      : NextToken<Query> extends ["SELECT", infer _, infer Rest]
        ? N extends 0
          ? [`${S & string}`, `SELECT ${Rest & string}`]
          : ExtractWith<Rest, N, `${S & string}${_ & string}`>
        : NextToken<Query> extends ["UPDATE", infer _, infer Rest]
          ? N extends 0
            ? [`${S & string}`, `UPDATE ${Rest & string}`]
            : ExtractWith<Rest, N, `${S & string}${_ & string}`>
          : NextToken<Query> extends ["INSERT", infer _, infer Rest]
            ? N extends 0
              ? [`${S & string}`, `INSERT ${Rest & string}`]
              : ExtractWith<Rest, N, `${S & string}${_ & string}`>
            : NextToken<Query> extends ["DELETE", infer _, infer Rest]
              ? N extends 0
                ? [`${S & string}`, `DELETE ${Rest & string}`]
                : ExtractWith<Rest, N, `${S & string} ${_ & string}`>
              : NextToken<Query> extends [infer _, infer Token, infer Rest]
                ? ExtractWith<Rest, N, `${S & string} ${Token & string}`>
                : never

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

/**
 * Get the next token from the string in both it's uppercase and original form
 * as well as the remainder
 */
type NextToken<T> =
  Trim<T> extends `${infer Token} ${infer Remainder}`
    ? [Uppercase<Token & string>, Token, Remainder]
    : Trim<T> extends `${infer Token}\n${infer Remainder}`
      ? [Uppercase<Token & string>, Token, Remainder]
      : Trim<T> extends `${infer Token},${infer Remainder}`
        ? [Uppercase<Token & string>, Token, Remainder]
        : Trim<T> extends `${infer Token})`
          ? [Uppercase<Token & string>, Token, ")"]
          : Trim<T> extends `(${infer Remainder}`
            ? ["(", "(", Remainder]
            : Trim<T> extends `)${infer Remainder}`
              ? [")", ")", Remainder]
              : [Uppercase<Trim<T> & string>, Trim<T>, ""]
