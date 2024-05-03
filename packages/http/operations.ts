/**
 * Managing operations and the backing state machine
 */

import type { Span } from "@opentelemetry/api"
import { EmitterFor, type Emitter } from "@telefrek/core/events.js"
import type { LifecycleEvents } from "@telefrek/core/lifecycle.js"
import type { Duration } from "@telefrek/core/time.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import { Stream } from "stream"
import type { HttpError } from "./errors.js"
import type { HttpRequest, HttpResponse } from "./index.js"

/**
 * Set of states that a {@link HttpOperation} can be in
 */
export enum HttpOperationState {
  /** The operation was aborted by either side */
  ABORTED = "aborted",
  /**  The operation has been fully completed */
  COMPLETED = "completed",
  /** The operation is being processed via a handler */
  PROCESSING = "processing",
  /** The operation is waiting to be processed */
  QUEUED = "queued",
  /** The operation contents are being read */
  READING = "reading",
  /** The operation timed out before being handled */
  TIMEOUT = "timeout",
  /** The operation contents are being written */
  WRITING = "writing",
}

/**
 * Specific operations that occur during {@link HttpOperation} processing
 */
export interface HttpOperationEvents extends LifecycleEvents {
  /**
   * Event raised when there is a state change
   *
   * @param previousState The previous {@link HttpOperationState}
   */
  changed: (previousState: HttpOperationState) => void

  /**
   * Event raised when the operation receives a {@link HttpResponse}
   *
   * @param response The {@link HttpResponse}
   */
  response: (response: HttpResponse) => void

  /**
   * Event fired on an error during the processing of the operation
   *
   * @param error The error that was encountered
   */
  error: (error: unknown) => void
}

/**
 * An operation that has a request and response pair
 */
export interface HttpOperation extends Emitter<HttpOperationEvents> {
  /** The current {@link HttpOperationState} */
  readonly state: HttpOperationState
  /** The {@link HttpRequest} that initiated the operation */
  readonly request: Readonly<HttpRequest>
  /** The {@link AbortSignal} for this operation */
  readonly signal?: AbortSignal
  /** The {@link HttpError} associated with failure if available */
  readonly error?: HttpError
  /** The {@link HttpResponse} that was paired with the operation */
  readonly response?: Readonly<HttpResponse>
  /** The optionl {@link Span} for this operation */
  readonly span?: Span

  /**
   * Move the operation out of a queued {@link HttpOperationState}
   */
  dequeue(): boolean

  /**
   * Move the operation into a complete {@link HttpOperationState}
   */
  complete(response: HttpResponse): boolean

  /**
   * Handle failures in processing the operation
   *
   * @param cause The optional cause for the state change
   */
  fail(cause?: HttpError): void
}

/**
 * Definition of events for {@link HttpOperation} providers
 */
export interface HttpOperationSourceEvents extends LifecycleEvents {
  /**
   * Fired when a new {@link HttpOperation} is available
   *
   * @param operation The {@link HttpOperation} that was received
   */
  received: (operation: HttpOperation) => void
}

/**
 * Custom type for objects that create {@link HttpOperation} via events
 */
export interface HttpOperationSource
  extends Emitter<HttpOperationSourceEvents> {
  /** The identifier for the operation source */
  id: string
}

interface CreateHttpOperationOptions {
  request: HttpRequest
  timeout: Optional<Duration>
  controller?: AbortController
  span?: Span
}

/**
 * Create a new {@link HttpOperation} that moves through the expected state machine
 *
 * @param request The {@link HttpRequest} that started the operation
 * @param timeout The optional {@link Duration} before the request should timeout
 * @param controller The {@link AbortController} that aborts the operation
 * @returns A new {@link HttpOperation}
 */
export function createHttpOperation(
  options: CreateHttpOperationOptions,
): HttpOperation {
  return new DefaultHttpOperation(options)
}

/**
 * Default implementation of the {@link HttpOperation}
 */
class DefaultHttpOperation
  extends EmitterFor<HttpOperationEvents>
  implements HttpOperation
{
  private readonly _request: HttpRequest

  private _span: Optional<Span>
  private _state: HttpOperationState
  private _abortController: AbortController
  private _error: Optional<HttpError>
  private _response: Optional<HttpResponse>
  private _timer?: NodeJS.Timeout

  get signal(): Optional<AbortSignal> {
    return this._abortController.signal
  }

  get span(): Optional<Span> {
    return this._span
  }

  get state(): HttpOperationState {
    return this._state
  }

  get response(): HttpResponse | undefined {
    return this._response
  }

  get request(): Readonly<HttpRequest> {
    return this._request
  }

  get error(): Optional<HttpError> {
    return this._error
  }

  dequeue(): boolean {
    return this._read()
  }

  fail(cause?: HttpError): boolean {
    this._error = cause

    if (cause) {
      this.emit("error", cause)
    }

    // Stop any further processing
    return this._abort()
  }

  complete(response: HttpResponse): boolean {
    if (this._response === undefined) {
      this._response = response

      return this._write()
    }

    return false
  }

  constructor(options: CreateHttpOperationOptions) {
    super({ captureRejections: true })

    this._request = options.request
    this._state = HttpOperationState.QUEUED
    this._abortController = options.controller ?? new AbortController()
    this._span = options.span

    if (options.timeout) {
      this._timer = setTimeout(() => {
        // Try to abort the call
        this._timeout()
      }, ~~options.timeout.milliseconds())
    }
  }

  /**
   * Private setter the changes the state and emits the status change
   */
  private set state(newState: HttpOperationState) {
    const previousState = this._state
    this._state = newState
    this.emit("changed", previousState)

    // Fire the finished event
    switch (newState) {
      case HttpOperationState.ABORTED:
      case HttpOperationState.COMPLETED:
      case HttpOperationState.TIMEOUT:
        this.emit("finished")
        break
      case HttpOperationState.WRITING:
        this.emit("started")
        break
    }
  }

  private _write(): boolean {
    // Make sure it's valid to switch this to writing
    if (this._check(HttpOperationState.WRITING)) {
      // Clear any pending timeouts
      clearTimeout(this._timer)

      // Check for a body and hook the consumption events
      if (this._response?.body) {
        const complete = this._complete.bind(this)
        Stream.finished(
          this._response.body.contents,
          (err: NodeJS.ErrnoException | null | undefined) => {
            if (!err) {
              complete()
            }
          },
        )
        return true
      } else {
        // Try to complete it now
        return this._complete()
      }
    }

    return false
  }

  private _read(): boolean {
    // Verify we can move to a reading state
    if (this._check(HttpOperationState.READING)) {
      // Check for a body and hook the consumption events
      if (this._request?.body) {
        const process = this._process.bind(this)
        Stream.finished(
          this._request.body.contents,
          (err: NodeJS.ErrnoException | null | undefined) => {
            if (!err) {
              process()
            }
          },
        )
        return true
      } else {
        // Try to complete it now
        return this._process()
      }
    }

    return false
  }

  /**
   * Aborts the request if it is valid to do so
   *
   * @returns True if the operation was successful
   */
  private _abort(): boolean {
    if (this._check(HttpOperationState.ABORTED)) {
      // Abort with a message from the root cause or generic message
      this._abortController.abort(
        this._error?.description ?? "Operation was aborted",
      )
      return true
    }

    return false
  }

  /**
   * Times the request out if it is valid to do so
   *
   * @returns True if the operation was successful
   */
  private _timeout(): boolean {
    if (this._check(HttpOperationState.TIMEOUT)) {
      this._abortController.abort("Operation timed out")
      return true
    }

    return false
  }

  /**
   * Completes the request if it is valid to do so
   *
   * @returns True if the operation was successful
   */
  private _complete(): boolean {
    return this._check(HttpOperationState.COMPLETED)
  }

  /**
   * Indicates the {@link HttpRequest} has been fully written
   *
   * @returns True if the operation was successful
   */
  private _process(): boolean {
    return this._check(HttpOperationState.PROCESSING)
  }

  /**
   * Check if the state transition is valid
   *
   * @param state The state to transition to
   * @returns True if the transition was successful
   */
  private _check(state: HttpOperationState): boolean {
    if (this._verifyTransition(this._state, state)) {
      this.state = state
      return true
    }

    return false
  }

  /**
   * Verify state transitions
   *
   * @param current The current state
   * @param target The target state
   * @returns True if the transition is valid
   */
  private _verifyTransition(
    current: HttpOperationState,
    target: HttpOperationState,
  ): boolean {
    switch (target) {
      case HttpOperationState.QUEUED:
        return false // You can never move backwards
      case HttpOperationState.READING:
        return current === HttpOperationState.QUEUED
      case HttpOperationState.PROCESSING:
        return current === HttpOperationState.READING
      case HttpOperationState.WRITING:
        return current === HttpOperationState.PROCESSING

      // These are terminal states and should be reachable by any other
      // non-terminal state
      case HttpOperationState.ABORTED:
      case HttpOperationState.TIMEOUT:
      case HttpOperationState.COMPLETED:
        return (
          current !== HttpOperationState.COMPLETED &&
          current !== HttpOperationState.TIMEOUT &&
          current !== HttpOperationState.ABORTED
        )
      default:
        return false
    }
  }
}
