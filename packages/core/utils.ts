export function getOrSet<T, K extends keyof T, M, O extends () => M>(
  obj: T,
  prop: K,
  ctor: O,
  enumerable: boolean = true,
): M {
  let m = obj[prop] as M
  if (m === undefined) {
    m = ctor()
    Object.defineProperty(obj, prop, { value: m, enumerable })
  }

  return m
}
