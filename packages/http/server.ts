/**
 * HTTP Server implementation
 */

import { Emitter, EmitterFor } from "@telefrek/core/events.js"
import { DeferredPromise, type MaybeAwaitable } from "@telefrek/core/index.js"
import { LifecycleEvents } from "@telefrek/core/lifecycle.js"
import { DefaultLogger, LogLevel, Logger } from "@telefrek/core/logging.js"
import { Duration } from "@telefrek/core/time.js"
import { HttpErrorCode, type HttpError } from "./errors.js"
import { HttpResponse, type TLSConfig } from "./index.js"
import {
  type HttpOperation,
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
    this.emit("initializing")
  }

  listen(port: number): MaybeAwaitable<void> {
    try {
      return this._listen(port)
    } finally {
      this.emit("started")
      this.emit("listening", port)
    }
  }

  async close(graceful?: boolean): Promise<void> {
    this.emit("stopping")
    try {
      await this._close(graceful)
    } finally {
      this.emit("finished")
    }
  }

  abstract _listen(port: number): MaybeAwaitable<void>
  abstract _close(graceful?: boolean): MaybeAwaitable<void>

  setReady(enabled: boolean): boolean {
    this._ready = enabled
    return true
  }

  protected async getResponse(
    operation: HttpOperation,
  ): Promise<HttpResponse | HttpError> {
    const deferred = new DeferredPromise()

    // We are listening for the finish or the response to fire

    const fireDeferred = () => {
      deferred.resolve()
      operation.removeListener("finished", fireDeferred)
      operation.removeListener("response", fireDeferred)
    }

    operation.once("finished", fireDeferred).once("response", fireDeferred)

    // Emit the operation
    this.emit("received", operation)
    await deferred

    return (
      operation.response ??
      operation.error ?? { errorCode: HttpErrorCode.UNKNOWN }
    )
  }
}
