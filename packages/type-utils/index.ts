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
