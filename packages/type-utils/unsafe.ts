/**
 * These type extensions shouldn't be used without serious thought to the fact
 * they are hacks around unsupported functionality
 */

type UnionToIntersection<U> = (
  U extends never ? never : (arg: U) => never
) extends (arg: infer I) => void
  ? I
  : never

/**
 * Utility type to convert a union to a tuple
 */
export type UnionToTuple<T, A extends unknown[] = []> =
  UnionToIntersection<T extends never ? never : (t: T) => T> extends (
    _: never,
  ) => infer W
    ? UnionToTuple<Exclude<T, W>, [...A, W]>
    : A