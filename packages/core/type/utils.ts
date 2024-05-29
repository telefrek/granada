/**
 * This package contains some useful type manipulations used throughout the framework
 */

import type { MaybeAwaitable } from "../index.js"

/**
 * Provides a type of the string split into components
 */
export type Split<
  T extends string,
  Splitter extends string = ":",
> = T extends `${infer Prefix}${Splitter}${infer Rest}`
  ? [...Split<Prefix, Splitter>, ...Split<Rest, Splitter>]
  : T extends `${infer Prefix}${Splitter}`
    ? [...Split<Prefix, Splitter>]
    : T extends `${Splitter}${infer Rest}`
      ? [...Split<Rest, Splitter>]
      : T extends ""
        ? []
        : [T]

/**
 * Describes a constructor
 */
export type Constructor = new (...args: AnyArgs) => object

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyArgs = any[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MaybeAwaitableAny = MaybeAwaitable<any>

/**
 * Type the represents a typed function that takes specific parameters during invocation
 */
export type Func<Args extends AnyArgs, Result> = (...args: Args) => Result

/**
 * Type to represent a method that takes some arguments and returns nothing
 */
export type Callback<Args extends AnyArgs> = (...args: Args) => void

/**
 * A function that consumes a value
 */
export type Consumer<T> = (obj: T) => MaybeAwaitable<void>

/**
 * A function that provides a value
 */
export type Provider<T> = () => MaybeAwaitable<T>

/**
 * Function that transforms a value
 *
 * @param current The current value if available
 */
export type MergeTransform<T> = (current: Optional<T>) => T

/**
 * A {@link Callback} that takes no arguments
 */
export type EmptyCallback = () => void

/**
 * Empty callback that does nothing
 */
export const NO_OP_CALLBACK = (): void => {}

/**
 * A value of type {@link T} or undefined
 */
export type Optional<T = unknown> = T | undefined
