/**
 * This package contains some useful type manipulations used throughout the framework
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
/**
 * Type that extracts keys that are arrays
 */
export type ArrayProperty<T> = {
  [K in keyof T]: T[K] extends unknown[] ? K : never
}[keyof T]

/**
 * Type that extracts the type of element at the array property of T
 */
export type ArrayItemType<
  T,
  K extends ArrayProperty<T>,
> = T[K] extends (infer U)[] ? U : never

/**
 * Helper to get properties of a given type
 */
export type PropertyOfType<T, TargetType> = {
  [K in keyof T]: T[K] extends TargetType ? K : never
}[keyof T]

/**
 * Helper to find the set of properties on the {@link Right} object that match
 * the type of the {@link LeftProperty} on the {@link Left} object
 */
export type MatchingProperty<
  Left,
  Right,
  LeftProperty extends keyof Left,
> = PropertyOfType<Right, Left[LeftProperty]>

/**
 * Merges the two types
 */
export type MergedType<A, B> = A & B

/**
 * Merges the two types such that keys in A override any keys in B
 */
export type MergedNonOverlappingType<A, B> = MergedType<
  A,
  { [K in keyof B]: K extends keyof A ? never : B[K] }
>

/**
 * Type that allows aliasing a property with a different name
 */
export type AliasedType<
  Original,
  Property extends keyof Original,
  Alias extends string,
> = Omit<Original, Property> & Record<Alias, Original[Property]>

/**
 * Type the represents a typed function that takes specific parameters during invocation
 */
export type Func<Args extends unknown[], Result> = (...args: Args) => Result
