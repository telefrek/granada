export type EventMap<E> = {
  [Key in EventKeys<E>]: EventFunc<E[Key]>
}

type EventKeys<E> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [Key in keyof E]: E[Key] extends (...args: any[]) => void ? Key : never
}[keyof E]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventFunc<E> = E extends (...args: any[]) => void ? Parameters<E> : never
