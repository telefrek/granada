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
  _keys: string[]
  _lowerCaseKeys: string[]

  constructor(obj: T) {
    this._keys = Object.keys(obj)
    this._lowerCaseKeys = this._keys.map((k) => k.toLowerCase())
  }

  _getKey(property: string): keyof T | undefined {
    const idx = this._lowerCaseKeys.indexOf(property.toLowerCase())
    return idx >= 0 ? (this._keys.at(idx) as keyof T) : undefined
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(target: T, prop: string | symbol, _proxy: any): any {
    if (typeof prop === "string") {
      const key = this._getKey(prop)
      return key ? target[key] : undefined
    }

    // Just try to get the symbol value
    return target[prop as keyof T]
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set(target: T, prop: string | symbol, newValue: any, _proxy: any): boolean {
    if (typeof prop === "string") {
      const key = this._getKey(prop)
      if (key) {
        target[key] = newValue
      }
      return key !== undefined
    }

    // Allow symbols to be set, we don't know anything about them

    target[prop as keyof T] = newValue
    return true
  }
}
