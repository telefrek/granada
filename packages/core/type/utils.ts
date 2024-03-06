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

/**
 * Type that extracts keys that are arrays
 */
export type ArrayProperty<T> = {
  [K in keyof T]: T[K] extends Array<any> ? K : never
}[keyof T]

/**
 * Type that extracts the type of element at the array property of T
 */
export type ArrayItemType<
  T,
  K extends ArrayProperty<T>
> = T[K] extends (infer U)[] ? U : never

/**
 * Type that allows aliasing a property with a different name
 */
export type AliasedType<
  Original,
  Property extends keyof Original,
  Alias extends string
> = Omit<Original, Property> & Record<Alias, Original[Property]>
