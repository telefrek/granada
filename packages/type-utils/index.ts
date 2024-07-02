/**
 * Common Type utilities
 */

/**
 * Utility type to return back the type that was given
 */
type Identity<T> = T

/**
 * Flatten the definition by extracting all keys into a new type
 */
export type Flatten<T> = Identity<{ [K in keyof T]: T[K] }>

/**
 * Type for passing invalid typings since there is no way to do it currently
 *
 * @template S The value to carry through for messaging
 */
export type Invalid<S> = S | void | never

/**
 * Get all the keys of type T
 */
export type Keys<T> = {
  [K in keyof T]: K
}[keyof T]

/**
 * Get all of the keys that are strings
 */
export type StringKeys<T> = Extract<Keys<T>, string>
/**
 * Get all the keys that are of type K in the given type T
 */
export type KeysOfType<T, K> = {
  [Key in keyof T]: T[Key] extends [K] ? Key : never
}[keyof T]

/**
 * Test to check if a value is a union
 *
 * @template T The type to check
 * @template U An extension of T to use for validating set exclusivity
 */
export type IsUnion<T, U extends T = T> = (
  T extends [never] ? never : U extends T ? false : true
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
      : object extends Pick<T, K>
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
      : object extends Pick<T, K>
        ? K
        : never]: T[K]
}

/**
 * Consolidates the definition of two types, removing anything that is optional
 * (useful for collapsing types based on objects passed where no options were provided)
 *
 * @template Left The left type to merge with the right
 * @template Right The right type ot merge with the left
 */
export type Consolidate<Left, Right> = Flatten<
  Omit<Left, keyof OptionalLiteralKeys<Left>> &
    Omit<Right, keyof OptionalLiteralKeys<Right>>
>
