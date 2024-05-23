import { EventEmitter } from "events"
import type { AnyArgs } from "./type/utils.js"

/**
 * Helper for interfaces that extends Event Emitters
 */
export type Emitter<E> = EventEmitter<EventMap<E>>

/**
 * Helper type to do the mapping for names
 */
export class EmitterFor<E> extends EventEmitter<EventMap<E>> {
  constructor(options?: EventEmitterOptions) {
    super(options)
  }
}

/**
 * Custom type to help map functions into the EventEmitter expected schema
 */
type EventMap<E> = {
  [Key in EventKeys<E>]: EventFunc<E[Key]>
}

interface EventEmitterOptions {
  /**
   * Enables automatic capturing of promise rejection.
   */
  captureRejections?: boolean | undefined
}

type EventKeys<E> = {
  [Key in keyof E]: E[Key] extends (...args: AnyArgs) => void ? Key : never
}[keyof E]

type EventFunc<E> = E extends (...args: AnyArgs) => void ? Parameters<E> : never
