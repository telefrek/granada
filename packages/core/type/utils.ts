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

class CaseInsensitiveProxyHandler<T extends object> implements ProxyHandler<T> {
  #keys: string[]
  #lowerCaseKeys: string[]

  constructor(obj: T) {
    this.#keys = Object.keys(obj)
    this.#lowerCaseKeys = this.#keys.map((k) => k.toLowerCase())
  }

  #getKey(property: string): keyof T | undefined {
    const idx = this.#lowerCaseKeys.indexOf(property.toLowerCase())
    return idx >= 0 ? (this.#keys.at(idx) as keyof T) : undefined
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(target: T, prop: string | symbol, _proxy: any): any {
    if (typeof prop === "string") {
      const key = this.#getKey(prop)
      return key ? target[key] : undefined
    }

    // Just try to get the symbol value
    return target[prop as keyof T]
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set(target: T, prop: string | symbol, newValue: any, _proxy: any): boolean {
    if (typeof prop === "string") {
      const key = this.#getKey(prop)
      if (key) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        target[key] = newValue
      }
      return key !== undefined
    }

    // Allow symbols to be set, we don't know anything about them
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    target[prop as keyof T] = newValue
    return true
  }
}

/**
 * Helper function to create a {@link Proxy} that makes object property access
 * pseudo case insensitive
 *
 * @param obj The object to do the case insensitive search on
 * @returns A {@link Proxy} that will attempt to resolve property get/set in a
 * case insensitive manner
 */
export const makeCaseInsensitive = <T extends object>(obj: T): T =>
  new Proxy<T>(obj, new CaseInsensitiveProxyHandler(obj))
