/**
 * Utilities that are helpful when working with SQL
 */

/**
 * I'm not trying to support ANY number, if you're going more than 64 deep for
 * some reason, you should probably be stopped lol
 */
type Increment = [
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
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  50,
  51,
  52,
  53,
  54,
  55,
  56,
  57,
  58,
  59,
  60,
  61,
  62,
  63,
]

type Decrement = [
  -1,
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
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  50,
  51,
  52,
  53,
  54,
  55,
  56,
  57,
  58,
  59,
  60,
  61,
  62,
  63,
]

type Next = Increment extends [number, ...infer N] ? N : never
type Prev = Decrement extends [...infer N] ? N : never

/**
 * Get the next value or undefined if >= 63
 */
export type Inc<T> = T extends keyof Next ? Next[T] : never

/**
 * Get the previous value or undefined if <= 63
 */
export type Dec<T> = T extends keyof Prev ? Prev[T] : never

/**
 * Perform a comparison between two values
 */
export type Compare<L, R, LN = Dec<L>, RN = Dec<R>> = LN extends undefined
  ? never
  : RN extends undefined
    ? never
    : LN extends RN
      ? 0
      : LN extends -1
        ? -1
        : RN extends -1
          ? 1
          : Compare<Dec<L>, Dec<R>>
