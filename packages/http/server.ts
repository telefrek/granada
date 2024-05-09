/**
 * HTTP Server implementation
 */

import type { Span } from "@opentelemetry/api"
import { Emitter, EmitterFor } from "@telefrek/core/events.js"
import { DeferredPromise, type MaybeAwaitable } from "@telefrek/core/index.js"
import { LifecycleEvents } from "@telefrek/core/lifecycle.js"
import { DefaultLogger, LogLevel, Logger } from "@telefrek/core/logging.js"
import { type Duration } from "@telefrek/core/time.js"
import type { EmptyCallback } from "@telefrek/core/type/utils"
import { HttpErrorCode, type HttpError } from "./errors.js"
import { HttpRequest, HttpResponse, type TLSConfig } from "./index.js"
import {
  HttpOperationState,
  createHttpOperation,
  type HttpOperationSourceEvents,
} from "./operations.js"

/**
 * The default {@link Logger} for {@link HttpPipeline} operations
 */
const HTTP_SERVER_LOGGER: Logger = new DefaultLogger({
  name: "http.server",
})

/**
 * Update the pipeline log levels
 *
 * @param level The {@link LogLevel} for the {@link HttpPipeline} {@link Logger}
 */
export function setHttpServerLogLevel(level: LogLevel): void {
  HTTP_SERVER_LOGGER.setLevel(level)
}

/**
 * Set of supported events on an {@link HttpServer}
 */
interface HttpServerEvents extends LifecycleEvents, HttpOperationSourceEvents {
  /**
   * Fired when the {@link HttpServer} is started
   *
   * @param port The port that was opened
   */
  listening: (port: number) => void

  /**
   * Fired when there is an error with the underlying {@link HttpServer}
   *
   * @param error The error that was encountered
   */
  error: (error: unknown) => void
}

/**
 * The interface representing an HTTP Server
 */
export interface HttpServer extends Emitter<HttpServerEvents> {
  /**
   * The identifier for the server
   */
  id: string

  /**
   * Starts the server accepting connections on the given port
   *
   * @param port The port to listen on
   *
   * @returns A promise to optionally use for tracking listening
   */
  listen(port: number): MaybeAwaitable<void>

  /**
   * Closes the server, rejecting any further calls
   *
   * @param graceful Flag to indicate if we want a graceful shutdown
   */
  close(graceful?: boolean): MaybeAwaitable<void>

  /**
   * Change the readiness flag
   *
   * @param enabled A flag to indicate if the readiness is enabled
   *
   * @returns True if readiness is supported
   */
  setReady(enabled: boolean): boolean
}

export interface HttpServerConfig {
  name: string
  tls?: TLSConfig
  enabledOnStart?: boolean
  requestTimeout?: Duration
}

export abstract class HttpServerBase
  extends EmitterFor<HttpServerEvents>
  implements HttpServer
{
  protected readonly _config: HttpServerConfig
  protected readonly _logger: Logger

  readonly id: string

  private _ready: boolean

  protected get isReady(): boolean {
    return this._ready
  }

  constructor(config: HttpServerConfig, logger: Logger = HTTP_SERVER_LOGGER) {
    super({ captureRejections: true })

    this.id = config.name
    this._config = config
    this._logger = logger
    this._ready = config.enabledOnStart ?? true
  }

  abstract listen(port: number): MaybeAwaitable<void>
  abstract close(graceful?: boolean): MaybeAwaitable<void>

  setReady(enabled: boolean): boolean {
    this._ready = enabled
    return true
  }

  protected handleRequest(
    request: HttpRequest,
    controller?: AbortController,
    span?: Span,
    onDequeue?: EmptyCallback,
  ): Promise<HttpResponse> {
    const operation = createHttpOperation({
      request,
      timeout: this._config.requestTimeout,
      controller,
      span,
    })

    this._logger.debug(
      `(${request.id}): Received [${request.method}] ${request.path.original}${request.query ? request.query.original : ""}`,
      request,
    )

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
          break
        case HttpOperationState.COMPLETED:
        case HttpOperationState.WRITING:
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
        case HttpOperationState.READING:
          if (onDequeue) {
            onDequeue()
          }
          break
      }
    })

    this.emit("received", operation)

    return deferred
  }
}
