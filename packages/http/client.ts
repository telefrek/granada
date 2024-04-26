/**
 * HTTP Client
 */

import { isAbortError } from "@telefrek/core/errors.js"
import type { Emitter } from "@telefrek/core/events.js"
import { DeferredPromise, type MaybeAwaitable } from "@telefrek/core/index.js"
import type { LifecycleEvents } from "@telefrek/core/lifecycle.js"
import {
  DefaultLogger,
  LogLevel,
  Logger,
  type LogWriter,
} from "@telefrek/core/logging.js"
import { Duration } from "@telefrek/core/time.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import EventEmitter, { captureRejectionSymbol } from "events"
import { Stream } from "stream"
import { HttpErrorCode, type HttpError } from "./errors.js"
import {
  HttpOperationState,
  type HttpOperation,
  type HttpOperationSource,
  type HttpRequest,
  type HttpResponse,
  type TLSConfig,
} from "./index.js"
import { parseBody } from "./parsers.js"

/** The logger used for HTTP Clients */
let HTTP_CLIENT_LOGGER: Logger = new DefaultLogger({
  name: "http.client",
  includeTimestamps: true,
  level: LogLevel.WARN,
})

/**
 * Updates the level for the HTTPClient logs
 *
 * @param level The new {@link LogLevel} for the client logger
 */
export function setHttpClientLogLevel(level: LogLevel): void {
  HTTP_CLIENT_LOGGER.setLevel(level)
}

/**
 * Update the writer for the HTTPClient logs
 *
 * @param writer The {@link LogWriter} to use for HTTPClient logs
 */
export function setHttpClientLogWriter(writer: LogWriter): void {
  HTTP_CLIENT_LOGGER = new DefaultLogger({
    name: "http.client",
    includeTimestamps: true,
    level: HTTP_CLIENT_LOGGER.level,
    writer,
  })
}

/**
 * Set of supported events on an {@link HttpServer}
 */
interface HttpClientEvents extends LifecycleEvents {
  /**
   * Fired when there is an error with the underlying {@link HttpServer}
   *
   * @param error The error that was encountered
   */
  error: (error: unknown) => void
}

/**
 * Client specific implementation of the {@link HttpOperation} that manipulates
 * the state machine correctly for this scenario
 */
class ClientHttpOperation extends EventEmitter implements HttpOperation {
  private _state: HttpOperationState
  private _abortController: AbortController
  private _error: Optional<HttpError>
  private _response: Optional<HttpResponse>

  /**
   * Private setter the changes the state and emits the status change
   */
  private set state(newState: HttpOperationState) {
    const previousState = this._state
    this._state = newState
    this.emit("changed", previousState)
  }

  /** The {@link AbortSignal} for this operation */
  get signal(): AbortSignal {
    return this._abortController.signal
  }

  readonly request: Readonly<HttpRequest>

  get state(): HttpOperationState {
    return this._state
  }

  get response(): HttpResponse | undefined {
    return this._response
  }

  set error(error: HttpError) {
    this._error = error
    this.complete()
  }

  get error(): Optional<HttpError> {
    return this._error
  }

  set response(response: HttpResponse) {
    if (this._response === undefined) {
      this._response = response

      // Mark this as in a reading state
      if (this._check(HttpOperationState.READING)) {
        // Check for a response body to auto-complete on read
        if (response.body) {
          const complete = this.complete.bind(this)
          Stream.finished(
            response.body.contents,
            (err: NodeJS.ErrnoException | null | undefined) => {
              if (!err) {
                complete()
              }
            },
          )
        }
      } else {
        HTTP_CLIENT_LOGGER.info(`Failed to set reading ${this._state}`)
      }
    } else {
      HTTP_CLIENT_LOGGER.error(
        `(${this.request.id}) Attempted to resolve twice!`,
        { current: this._response, invalid: response },
      )
    }
  }

  [captureRejectionSymbol](
    err: unknown,
    event: string | symbol,
    ...args: unknown[]
  ): void {
    HTTP_CLIENT_LOGGER.fatal(
      `Unhandled exception error during ${String(event)}: ${err}`,
      { err, event, args },
    )

    this.emit("error", err)
  }

  constructor(request: HttpRequest) {
    // Force errors in emitting to go through the 'error' event
    super({ captureRejections: true })

    this.request = request
    this._state = HttpOperationState.QUEUED
    this._abortController = new AbortController()
  }

  dequeue(): boolean {
    return this._check(HttpOperationState.WRITING)
  }

  fail(cause?: unknown): void {
    if (cause) {
      this.emit("error", cause)
    }

    this.abort()
  }

  /**
   * Aborts the request if it is valid to do so
   *
   * @returns True if the operation was successful
   */
  abort(): boolean {
    if (this._check(HttpOperationState.ABORTED)) {
      this._abortController.abort("Operation was aborted")
      return true
    }

    return false
  }

  /**
   * Times the request out if it is valid to do so
   *
   * @returns True if the operation was successful
   */
  timeout(): boolean {
    return this._check(HttpOperationState.TIMEOUT)
  }

  /**
   * Completes the request if it is valid to do so
   *
   * @returns True if the operation was successful
   */
  complete(): boolean {
    return this._check(HttpOperationState.COMPLETED)
  }

  /**
   * Starts the submission of the {@link HttpRequest}
   *
   * @returns True if the operation was successful
   */
  write(): boolean {
    try {
      return this._check(HttpOperationState.WRITING)
    } finally {
      // Hook the body writing
      if (this._state === HttpOperationState.WRITING && this.request.body) {
        const process = this.process.bind(this)

        // When the stream is fully consumed we are waiting for a response, set
        // it to processing
        Stream.finished(
          this.request.body.contents,
          (err: NodeJS.ErrnoException | null | undefined) => {
            if (!err) {
              process()
            }
          },
        )
      }
    }
  }

  /**
   * Indicates the {@link HttpRequest} has been fully written
   *
   * @returns True if the operation was successful
   */
  process(): boolean {
    return this._check(HttpOperationState.PROCESSING)
  }

  /**
   * Check if the state transition is valid
   *
   * @param state The state to transition to
   * @returns True if the transition was successful
   */
  private _check(state: HttpOperationState): boolean {
    if (ClientHttpOperation.verifyTransition(this._state, state)) {
      this.state = state
      return true
    } else if (state !== this._state) {
      HTTP_CLIENT_LOGGER.debug(
        `(${this.request.id}) Invalid state transition: ${this._state} => ${state}`,
      )
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
  private static verifyTransition(
    current: HttpOperationState,
    target: HttpOperationState,
  ): boolean {
    switch (target) {
      case HttpOperationState.QUEUED:
        return false // You can never move backwards
      case HttpOperationState.WRITING:
        return current === HttpOperationState.QUEUED
      case HttpOperationState.PROCESSING:
        return current === HttpOperationState.WRITING
      case HttpOperationState.READING:
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

export interface HttpClient extends Emitter<HttpClientEvents> {
  submit(request: HttpRequest, timeout?: Duration): Promise<HttpResponse>
}

/**
 * Base class for extending Http Client behaviors
 */
export abstract class HttpClientBase
  extends EventEmitter
  implements HttpClient, HttpOperationSource
{
  protected readonly _config: HttpClientConfig
  protected readonly _logger: Logger

  constructor(config: HttpClientConfig, logger: Logger = HTTP_CLIENT_LOGGER) {
    super({ captureRejections: true })

    this._config = config
    this._logger = logger
  }

  [captureRejectionSymbol](
    err: unknown,
    event: string | symbol,
    ...args: unknown[]
  ): void {
    this._logger.fatal(
      `Unhandled exception error during ${String(event)}: ${err}`,
      { err, event, args },
    )

    this.emit("error", err)
  }

  public submit(
    request: HttpRequest,
    timeout: Duration = Duration.ofSeconds(15),
  ): Promise<HttpResponse> {
    this._logger.debug(
      `(${request.id}) => Submitting ${this._config.host}${this._config.port ? `:${this._config.port}` : ""}${request.path.original}${request.query ? request.query.original : ""}`,
      request,
    )

    // Create the operation
    const operation = new ClientHttpOperation(request)
    let nodeTimeout: Optional<NodeJS.Timeout>

    // Check if there is a timeout on this operation
    if (timeout) {
      nodeTimeout = setTimeout(() => {
        if (operation.state === HttpOperationState.QUEUED) {
          operation.timeout()
        } else {
          operation.abort()
        }
      }, ~~timeout.milliseconds())
    }

    // Create our promise
    const deferred = new DeferredPromise<HttpResponse>()

    // Hook the change event for the reading state
    operation.on("changed", (_state: HttpOperationState) => {
      switch (operation.state) {
        case HttpOperationState.ABORTED:
          this._logger.error(`(${request.id}) Aborted`)
          deferred.reject(<HttpError>{
            errorCode: HttpErrorCode.ABORTED,
          })
          break
        case HttpOperationState.TIMEOUT:
          this._logger.error(`(${request.id}) Timeout`)
          deferred.reject(<HttpError>{
            errorCode: HttpErrorCode.TIMEOUT,
          })
        case HttpOperationState.READING:
          clearTimeout(nodeTimeout)
          this._logger.debug(`(${request.id}) Response Available`)
          if (operation.response) {
            deferred.resolve(operation.response)
          } else {
            deferred.reject(
              operation.error ?? {
                errorCode: HttpErrorCode.UNKNOWN,
              },
            )
          }
          break
        case HttpOperationState.WRITING:
          this.process(operation)
          break
      }
    })

    this.emit("received", operation)

    return deferred
  }

  protected async process(operation: ClientHttpOperation): Promise<void> {
    try {
      // Set the response and move to reading
      operation.response = await this.marshal(
        operation.request,
        () => {
          if (!operation.request.body) {
            operation.process()
          }
        },
        operation.signal,
      )

      // Parse the body if present
      if (operation.response.body) {
        parseBody(operation.response.headers, operation.response.body)
      } else {
        operation.complete()
      }
    } catch (err) {
      if (!isAbortError(err)) {
        operation.error = {
          errorCode: HttpErrorCode.UNKNOWN,
          description: String(err),
        }
      }
    }
  }

  /**
   * Implementation specific method to marshal a {@link HttpRequest} and return
   * a {@link HttpResponse}
   *
   * @param request The {@link HttpRequest} to send
   * @param onHeadersWritten A callback to fire once headers are written
   * @param abortSignal An abort signal for clients that allow this functionality
   */
  protected abstract marshal(
    request: HttpRequest,
    onHeadersWritten: () => void,
    abortSignal?: AbortSignal,
  ): MaybeAwaitable<HttpResponse>
}

/**
 * The configuration options available for HTTP Clients
 */
export interface HttpClientConfig {
  name: string
  host: string
  port?: number
  tls?: TLSConfig
}
