import { context, trace, type Span, type Tracer } from "@opentelemetry/api"
import { AsyncLocalStorage } from "async_hooks"
import type { Optional } from "../type/utils.js"
import { GRANADA_VERSION } from "../version.js"

const TRACER = trace.getTracer("granada-framework", GRANADA_VERSION)

const ACTIVE_SPAN_STORE: AsyncLocalStorage<Span> = new AsyncLocalStorage()

/**
 * Helper method for activating a span scope
 *
 * @param span The {@link Span} to create the scope for
 * @returns A newly initialized {@link Scope} for controlling span activity
 */
export function activateSpan(span: Span): Scope {
  return new Scope(span, true)
}

/**
 * The scope for activating and de-activating a given span to help with tracking
 */
export class Scope implements Disposable {
  readonly span: Span
  private _active: boolean
  private _finished: boolean
  private _previous?: Span

  constructor(span: Span, activate: boolean = true) {
    this.span = span
    this._finished = false
    this._active = false

    if (activate) {
      this.activate()
    }
  }

  [Symbol.dispose](): void {
    this.finish()
  }

  /**
   * Activates the underlying span
   */
  activate(): void {
    if (!this._active && !this._finished) {
      this._previous = getActiveSpan()
      ACTIVE_SPAN_STORE.enterWith(this.span)
      trace.setSpan(context.active(), this.span)
      this._active = true
    }
  }

  /**
   * Deactivates the underlying span
   */
  deactivate(): void {
    if (this._active) {
      this._active = false
      if (this._previous && this._previous.isRecording()) {
        ACTIVE_SPAN_STORE.enterWith(this._previous)
        if (this._previous) {
          trace.setSpan(context.active(), this._previous)
        }
        this._previous = undefined
      } else {
        ACTIVE_SPAN_STORE.disable()
        trace.deleteSpan(context.active())
      }
    }
  }

  /**
   * Finishes the current scope and prevents further activations
   */
  finish(): void {
    this.deactivate()
    this._finished = true
  }
}

/**
 * Return the framework {@link Tracer}
 */
export function getTracer(): Tracer {
  return TRACER
}

/**
 * Get the current active {@link Span}
 *
 * @returns The active {@link Span} or undefined
 */
export function getActiveSpan(): Optional<Span> {
  // Check our store first then return any active span from the underlying context
  return ACTIVE_SPAN_STORE.getStore() ?? trace.getActiveSpan()
}
