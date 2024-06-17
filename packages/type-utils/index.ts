/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Common Type utilities
 */

/**
 * Utility type to return back what was given
 */
type Extract<T> = T

/**
 * Flatten the definition (highly useful for combinations)
 */
export type Flatten<T> = Extract<{ [K in keyof T]: T[K] }>

/**
 * Type for passing invalid typings since there is no way to do it currently
 */
export type Invalid<S> = S | void | never

/**
 * Get all the keys of a type
 */
export type Keys<T> = {
  [K in keyof T]: K
}[keyof T]

export type KeysOfType<T, K> = {
  [Key in keyof T]: T[Key] extends [K] ? Key : never
}[keyof T]

/**
 * Test to check if a value is a union
 */
export type IsUnion<T, U extends T = T> = (
  T extends any ? (U extends T ? false : true) : never
) extends false
  ? false
  : true

/**
 * All of the literal required keys from a type
 */
export type RequiredLiteralKeys<T> = {
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : // eslint-disable-next-line @typescript-eslint/ban-types
        {} extends Pick<T, K>
        ? never
        : K]: T[K]
}

/**
 * All of the optional (explicit) keys
 */
export type OptionalLiteralKeys<T> = {
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : // eslint-disable-next-line @typescript-eslint/ban-types
        {} extends Pick<T, K>
        ? K
        : never]: T[K]
}
