/**
 * This package contains some useful type manipulations used throughout the framework
 */

/**
 * Type to retrieve the properties that are required on the given type
 */
export type RequiredProperties<T extends object> = keyof {
  [K in keyof T as T extends Record<K, T[K]> ? K : never]: K
}

/**
 * Type to retrieve the optional properties on the given type
 */
export type OptionalProperties<T> = {
  [K in keyof T]-?: {} extends { [P in K]: T[K] } ? K : never
}[keyof T]
