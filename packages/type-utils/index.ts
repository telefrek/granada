/**
 * Common Type utilities
 */

type _<T> = T

/**
 * Flatten the definition (highly useful for combinations)
 */
export type Flatten<T> = _<{ [K in keyof T]: T[K] }>

/**
 * Type for passing invalid typings since there is no way to do it currently
 */
export type Invalid<S> = S | void | never
