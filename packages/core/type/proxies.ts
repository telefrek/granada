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

/**
 * Custom {@link ProxyHandler} that makes access of a property mostly case insensitive
 */
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