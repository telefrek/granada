/**
 * Trim the leading/trailing whitespace characters
 */
export type Trim<T> = T extends ` ${infer Rest}`
  ? Trim<Rest>
  : T extends `\n${infer Rest}`
    ? Trim<Rest>
    : T extends `${infer Rest} `
      ? Trim<Rest>
      : T extends `${infer Rest}\n`
        ? Trim<Rest>
        : T

/**
 * Joins the segments
 */
export type Join<T, C extends string = " "> = T extends [
  infer Left,
  ...infer Rest,
]
  ? Rest extends never[]
    ? `${Left & string}`
    : `${Left & string}${C}${Join<Rest, C> & string}`
  : ""
