/**
 * HTTP Client
 */

import { isAbortError } from "@telefrek/core/errors.js"
import { EmitterFor, type Emitter } from "@telefrek/core/events.js"
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
import { Http2ClientTransport } from "./client/http2.js"
import { DEFAULT_CLIENT_PIPELINE_CONFIGURATION } from "./client/pipeline.js"
import { HttpErrorCode, type HttpError } from "./errors.js"
import {
  HttpOperationState,
  createHttpOperation,
  type HttpHandler,
  type HttpOperationSource,
  type HttpOperationSourceEvents,
  type HttpRequest,
  type HttpResponse,
  type TLSConfig,
} from "./index.js"
import { createPipeline, type HttpPipeline } from "./pipeline.js"

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
 * The interface that represents an Http Client
 */
export interface HttpClient extends Emitter<HttpClientEvents> {
  /**
   * Submit the request to the client to be processed
   *
   * @param request The {@link HttpRequest} to submit
   * @param timeout The optional {@link Duration} before timing out the request
   */
  submit(request: HttpRequest, timeout?: Duration): Promise<HttpResponse>

  /**
   * Closes the client and prevents further operations from being submitted
   */
  close(): MaybeAwaitable<void>
}

/**
 * Represents a layer that knows how to write a {@link HttpRequest} and read the
 * {@link HttpResponse} from the wire
 */
export interface HttpClientTransport {
  /**
   *
   * @param request The {@link HttpRequest} to write
   * @param onHeaderWrite A callback to fire when the headers are written
   * @param abort
   */
  marshal(
    request: HttpRequest,
    abort?: AbortSignal,
  ): MaybeAwaitable<HttpResponse>
}

/**
 * The configuration options available for {@link HttpClientTransport}
 */
export interface HttpTransportOptions {
  name: string
  host: string
  port?: number
  tls?: TLSConfig
}

type ClientTransportConstructor<
  T extends HttpTransportOptions = HttpTransportOptions,
> = {
  new (config: T): HttpClientTransport
}

export class HttpClientBuilder<
  T extends HttpTransportOptions = HttpTransportOptions,
> {
  private _options: T
  private _transport: ClientTransportConstructor<T> | HttpClientTransport =
    Http2ClientTransport<T>
  private _logger: Optional<Logger>

  private _pipeline: HttpPipeline = createPipeline(
    DEFAULT_CLIENT_PIPELINE_CONFIGURATION,
  )

  constructor(options: T) {
    this._options = options
  }

  withLogger(logger: Logger): HttpClientBuilder<T> {
    this._logger = logger
    return this
  }

  withTransport(
    transport: ClientTransportConstructor<T> | HttpClientTransport,
  ): HttpClientBuilder<T> {
    this._transport = transport
    return this
  }

  withPipeline(pipeline: HttpPipeline): HttpClientBuilder<T> {
    this._pipeline = pipeline
    return this
  }

  build(): HttpClient {
    const transport =
      typeof this._transport === "function"
        ? new this._transport(this._options)
        : (this._transport as HttpClientTransport)

    const handler: HttpHandler = async (
      request: HttpRequest,
      abort?: AbortSignal,
    ): Promise<HttpResponse> => {
      try {
        // Set the response and move to reading
        return await transport.marshal(request, abort)
      } catch (err) {
        throw <HttpError>{
          errorCode: isAbortError(err)
            ? HttpErrorCode.ABORTED
            : HttpErrorCode.UNKNOWN,
          description: String(err),
          cause: err,
        }
      }
    }

    const client = new DefaultHttpClient(this._options.name, this._logger)
    if (
      this._pipeline.add(client as HttpOperationSource, handler, {
        highWaterMark: 2,
      })
    ) {
      return client
    }

    throw new Error("Pipeline is not accepting clients")
  }
}

/**
 * Base class for extending Http Client behaviors
 */
class DefaultHttpClient
  extends EmitterFor<HttpClientEvents>
  implements HttpClient
{
  private readonly _logger: Logger
  private _closed: boolean

  readonly id: string

  constructor(id: string, logger: Logger = HTTP_CLIENT_LOGGER) {
    super({ captureRejections: true })

    this._closed = false
    this._logger = logger
    this.id = id
  }

  close(): MaybeAwaitable<void> {}

  public submit(
    request: HttpRequest,
    timeout: Duration = Duration.ofSeconds(15),
  ): Promise<HttpResponse> {
    // Fail subsequent submit on closed
    if (this._closed) {
      return Promise.reject(<HttpError>{ errorCode: HttpErrorCode.CLOSED })
    }

    this._logger.debug(
      `(${request.id}): Submitting [${request.method}] ${request.path.original}${request.query ? request.query.original : ""}`,
      request,
    )

    // Create the operation
    const operation = createHttpOperation(request, timeout)

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
        case HttpOperationState.WRITING:
        case HttpOperationState.COMPLETED:
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
      }
    })

    this.emit("received", operation)

    return deferred
  }
}

/**
 * Set of supported events on an {@link HttpServer}
 */
interface HttpClientEvents extends LifecycleEvents, HttpOperationSourceEvents {
  /**
   * Fired when there is an error with the underlying {@link HttpServer}
   *
   * @param error The error that was encountered
   */
  error: (error: unknown) => void
}
