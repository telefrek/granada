/**
 * Helper interface for defining structured events that will be emitted
 */
export interface Emitter<E> {
  /**
   * Match all EventEmitter.on functionality
   *
   * @param event The event that was raised
   * @param listener The listener to add
   */
  on<T extends EventKeys<E>>(event: T, listener: E[T]): this

  /**
   * Match all EventEmitter.on functionality
   *
   * @param event The event that was raised
   * @param listener The listener to add to the next invocation only
   */
  once<T extends EventKeys<E>>(event: T, listener: E[T]): this

  /**
   * Match all EventEmitter.off functionality
   *
   * @param event The event that was raised
   * @param listener The listener to remove
   */
  off<T extends EventKeys<E>>(event: T, listener: E[T]): this

  /**
   * Match all EventEmitter.emit functionality
   *
   * @param event The event that was raised
   * @param args  The parameters for the function to invoke
   */
  emit<T extends EventKeys<E>>(event: T, ...args: EventFunc<E[T]>): boolean
}

type EventKeys<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [Key in keyof T]: T[Key] extends (...args: any[]) => any ? Key : never
}[keyof T]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventFunc<T> = T extends (...args: any[]) => any ? Parameters<T> : never
