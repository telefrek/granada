/**
 * HTTP Server implementation
 */

import {
  ROOT_CONTEXT,
  createContextKey,
  trace,
  type Context,
  type Span,
} from "@opentelemetry/api"
import { Emitter } from "@telefrek/core/events.js"
import { DeferredPromise, type MaybeAwaitable } from "@telefrek/core/index.js"
import { LifecycleEvents, registerShutdown } from "@telefrek/core/lifecycle.js"
import {
  DefaultLogger,
  LogLevel,
  Logger,
  error,
  type LogWriter,
} from "@telefrek/core/logging.js"
import { getTracer } from "@telefrek/core/observability/tracing.js"
import {
  CircularArrayBuffer,
  createIterator,
} from "@telefrek/core/structures/circularBuffer.js"
import { Timer, delay, type Duration } from "@telefrek/core/time.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import { randomUUID as v4 } from "crypto"
import EventEmitter, { captureRejectionSymbol } from "events"
import * as http2 from "http2"
import { Readable, Stream, finished, pipeline } from "stream"
import type { HttpError } from "./errors.js"
import {
  HttpBody,
  HttpHeaders,
  HttpMethod,
  HttpOperationState,
  HttpPath,
  HttpQuery,
  HttpRequest,
  HttpResponse,
  HttpStatusCode,
  HttpVersion,
  type HttpOperation,
  type HttpOperationSource,
  type TLSConfig,
} from "./index.js"
import { HttpRequestMetrics, HttpServerMetrics } from "./metrics.js"
import { emptyHeaders, injectHeaders, parsePath } from "./utils.js"

/**
 * The default {@link Logger} for {@link HttpPipeline} operations
 */
let HTTP_SERVER_LOGGER: Logger = new DefaultLogger({
  name: "HttpServer",
  level: LogLevel.INFO,
  includeTimestamps: true,
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
 * Update the pipeline log writer
 *
 * @param writer the {@link LogWriter} to use for {@link HttpPipeline}
 * {@link Logger} objects
 */
export function setHttpServerLogWriter(writer: LogWriter): void {
  HTTP_SERVER_LOGGER = new DefaultLogger({
    name: "HttpServer",
    level: HTTP_SERVER_LOGGER.level,
    writer: writer,
    includeTimestamps: true,
  })
}

/**
 * Server specific implementation of the {@link HttpOperation} that manipulates
 * the state machine correctly for this scenario
 */
class ServerHttpOperation extends EventEmitter implements HttpOperation {
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

      // Mark this as in a writing state
      if (this._check(HttpOperationState.WRITING)) {
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
        HTTP_SERVER_LOGGER.info(`Failed to set writing ${this._state}`)
      }
    } else {
      HTTP_SERVER_LOGGER.error(
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
    HTTP_SERVER_LOGGER.fatal(
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
    return this._check(HttpOperationState.READING)
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
  read(): boolean {
    try {
      return this._check(HttpOperationState.READING)
    } finally {
      // Hook the body writing
      if (this._state === HttpOperationState.READING && this.request.body) {
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
   * Indicates the {@link HttpRequest} has been fully read
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
    if (ServerHttpOperation.verifyTransition(this._state, state)) {
      this.state = state
      return true
    } else if (state !== this._state) {
      HTTP_SERVER_LOGGER.debug(
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

/**
 * Set of supported events on an {@link HttpServer}
 */
interface HttpServerEvents extends LifecycleEvents {
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
}

export interface HttpServerConfig {
  tls?: TLSConfig
  enabledOnStart?: boolean
  requestTimeout?: Duration
}

export abstract class HttpServerBase
  extends EventEmitter
  implements HttpServer, HttpOperationSource
{
  protected readonly _config: HttpServerConfig
  protected readonly _logger: Logger

  private _ready: boolean

  protected get isReady(): boolean {
    return this._ready
  }

  constructor(config: HttpServerConfig, logger: Logger = HTTP_SERVER_LOGGER) {
    super({ captureRejections: true })

    this._config = config
    this._logger = logger
    this._ready = config.enabledOnStart ?? true
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

  abstract listen(port: number): MaybeAwaitable<void>
  abstract close(graceful?: boolean): MaybeAwaitable<void>

  protected queueRequest(request: HttpRequest): HttpOperation {
    const operation = new ServerHttpOperation(request)
    this.emit("received", operation)

    return operation
  }
}

/**
 * The options used to configure the {@link HttpServer}
 */
interface HttpServerOptions extends http2.SecureServerOptions {
  maxBufferedRequests?: number
  maxDuplexListeners?: number
  loadShedRetryAfter?: number
  disableReady?: boolean
}

/**
 * Default {@link HttpServerBuilder} that utilizes the underlying node `http2` package
 * @returns The default {@link HttpServerBuilder} in the framework
 */
export function httpServerBuilder(): HttpServerBuilder {
  return new HttpServerBuilder()
}

/**
 * Default implementation of a {@link HttpServerBuilder}
 */
class HttpServerBuilder {
  options: HttpServerOptions = {
    allowHTTP1: true,
  }

  /**
   * Add the required TLS details
   *
   * @param details The TLS details
   * @returns An updated {@link HttpServerBuilder}
   */
  withTls(details: {
    cert: string | Buffer
    key: string | Buffer
    passphrase?: string
    caFile?: Optional<string | Buffer>
    mutualAuth?: Optional<boolean>
  }): HttpServerBuilder {
    this.options = {
      ...this.options,
      ...details,
    }

    return this
  }

  /**
   * Enable/disable HTTP1.1
   *
   * @param enable Flag to ocntrol if HTTP1.1 is enabled
   * @returns An updated {@link HttpServerBuilder}
   */
  enableHttp1(enable: boolean): HttpServerBuilder {
    this.options.allowHTTP1 = enable

    return this
  }

  /**
   * Builds a new {@link HttpServer} based on the information provided
   *
   * @returns A new {@link HttpServer}
   */
  build(): HttpServer {
    return new HttpServerImpl(this.options)
  }
}

/**
 * Default implementation of the {@link HttpServer} using the node `http2` package
 */
class HttpServerImpl extends EventEmitter implements HttpServer {
  private _server: http2.Http2Server
  private _tracer = trace.getTracer("Granada.HttpServer")
  private _sessions: http2.ServerHttp2Session[] = []
  private _logger: Logger
  private _options: HttpServerOptions
  private _ready: boolean

  constructor(options: HttpServerOptions) {
    super()

    this._options = options
    this._ready = !(options.disableReady ?? false)
    Stream.Duplex.setMaxListeners(options.maxDuplexListeners ?? 128)

    this._logger = HTTP_SERVER_LOGGER
    this._server = http2.createSecureServer(options)

    this._server.on("session", (session) => {
      this._logger.debug("New session created", session)

      this._sessions.push(session)
      session.once("close", () => {
        const idx = this._sessions.indexOf(session)
        if (idx >= 0) {
          this._sessions.splice(idx, 1)
          this._logger.debug("Session closed", session)
        }
      })
    })

    // Make sure to map requests
    this._setupRequestMapping()
  }

  ready(enable: boolean): void {
    this._ready = enable
  }

  [Symbol.asyncIterator](): AsyncIterator<HttpRequest, void, never> {
    const buffer = new CircularArrayBuffer<HttpRequest>({
      highWaterMark: this._options.maxBufferedRequests ?? 32,
    })

    this.on("request", (request: HttpRequest) => {
      // If we can't add to the buffer, need to reject
      if (!buffer.tryAdd(request)) {
        this._logger.warn("Failed to enqueue request, shedding load")
        const headers = emptyHeaders()

        headers.set(
          "Retry-After",
          (~~(this._options.loadShedRetryAfter ?? 60)).toString(),
        )
      }
    })

    // Shut down the buffer when we detect it is stopping
    this.on("stopping", () => {
      buffer.close()
    })

    return createIterator(buffer)
  }

  listen(port: number): Promise<void> {
    if (!this._server.listening) {
      this.emit("started")
      this._server.listen(port, "0.0.0.0")
      this.emit("listening", port)

      // Register the shutdown hook
      registerShutdown(() => this.close(false))
    } else {
      throw new Error("Server is already listening on another port")
    }

    this._logger.info(`Server listening on ${port}`)

    return new Promise((resolve) => {
      this.once("finished", resolve)
    })
  }

  async close(graceful: boolean = true): Promise<void> {
    this._logger.info(`close invoked (graceful=${graceful})`)

    // We want to indicate we aren't ready and wait for existing requests to
    // close out
    if (graceful && this._ready) {
      // Mark this is not ready for more traffic
      this.ready(false)

      // Wait 15 seconds
      // TODO: Make this driven by a signal on outstanding requests...
      await delay(15_000)
    }

    if (this._server.listening) {
      this.emit("stopping")
      const deferred = new DeferredPromise()

      // Close the server to stop accepting new streams
      this._server.close((err) => {
        this.emit("finished")
        this._logger.info("server closed")
        if (err) {
          this.emit("error", err)
          deferred.reject(err)
        } else {
          deferred.resolve()
        }
      })

      // Close all existing streams
      this._sessions.map((s) => s.close())

      // Return the promise
      await deferred
    }
  }

  _setupRequestMapping(): void {
    this._server.on("error", (err) => {
      this._logger.error(`Error: ${err}`, err)
      this.emit("error", err)
    })

    this._server.on("request", (req, resp) => {
      // Handle health
      if (req.url === "/health") {
        resp.writeHead(HttpStatusCode.NO_CONTENT).end()
        return
      }

      // Handle ready
      if (req.url === "/ready") {
        resp
          .writeHead(
            this._ready ? HttpStatusCode.NO_CONTENT : HttpStatusCode.NOT_FOUND,
          )
          .end()
        return
      }

      // Emit the request and let it process downstream
      this.emit(
        "request",
        new Http2Request(req, resp).on("finished", () => {
          this._logger.debug(`Request finished`)
        }),
      )
    })
  }
}

/**
 * Map between Node and framework http header representations
 *
 * @param incomingHeaders The {@link http2.IncomingHeaders} to parse
 * @returns The mapped {@link HttpHeaders}
 */
function parseHttp2Headers(
  incomingHeaders: http2.IncomingHttpHeaders,
): HttpHeaders {
  const headers = emptyHeaders()

  for (const key in incomingHeaders) {
    switch (key) {
      // Keys that we don't need to map explicitly as they are more protocol based
      case http2.constants.HTTP2_HEADER_AUTHORITY:
      case http2.constants.HTTP2_HEADER_METHOD:
      case http2.constants.HTTP2_HEADER_PATH:
      case http2.constants.HTTP2_HEADER_SCHEME:
        break
      default:
        headers.set(key, incomingHeaders[key]!)
        break
    }
  }

  return headers
}

const HTTP_REQUEST_KEY = createContextKey("HTTP_REQUEST_KEY")

class Http2Request extends EventEmitter implements HttpRequest {
  readonly id: string = v4()
  readonly path: HttpPath
  readonly method: HttpMethod
  readonly headers: HttpHeaders
  readonly version: HttpVersion
  readonly query: Optional<HttpQuery>
  readonly body: Optional<HttpBody>
  readonly context: Optional<Context>

  private _timer: Timer
  private _state: HttpOperationState
  private _response: http2.Http2ServerResponse
  private _delay: Optional<Duration>
  private readonly _span: Span

  get state(): HttpOperationState {
    return this._state
  }

  set state(state: HttpOperationState) {
    // Check for duration lag
    if (this._state === HttpOperationState.QUEUED) {
      this._delay = this._timer.elapsed()
    }

    // Verify state changes
    switch (state) {
      case HttpOperationState.ABORTED:
      case HttpOperationState.COMPLETED:
      case HttpOperationState.TIMEOUT:
        break
      case HttpOperationState.PROCESSING:
        break
      case HttpOperationState.READING:
        break
      case HttpOperationState.WRITING:
        break
    }

    this._state = state
  }

  constructor(
    request: http2.Http2ServerRequest,
    response: http2.Http2ServerResponse,
  ) {
    super()
    this._timer = Timer.startNew()

    this.context = ROOT_CONTEXT.setValue(HTTP_REQUEST_KEY, this)

    this._span = getTracer().startSpan(
      "HttpRequest",
      {
        attributes: {
          "http.request.url": request.url,
          "http.request.method": request.method,
          "http.request.version": HttpVersion.HTTP_2,
        },
      },
      this.context,
    )

    this.on("finished", () => {
      this._span.setAttributes({
        "http.response.status": this._response.statusCode,
      })
      this._span.end()
    })

    // Log the incoming request
    HTTP_SERVER_LOGGER.info(`${request.method} ${request.url}`)

    const { path, query } = parsePath(request.url)
    this.path = path
    this.query = query
    this._state = HttpOperationState.QUEUED
    this.headers = parseHttp2Headers(request.headers)
    this.version = HttpVersion.HTTP_2
    this.method = request.method.toUpperCase() as HttpMethod
    this.body = { contents: request as Readable }

    this._response = response

    request.stream
      .once("aborted", () => {
        HTTP_SERVER_LOGGER.error(
          `Request aborted: ${this.path.original} (${this._state})`,
        )
        this.state = HttpOperationState.ABORTED
      })
      .once("close", () => {
        HTTP_SERVER_LOGGER.info(
          `Request stream.close: ${this.path.original} (${this._state})`,
        )
      })
      .once("streamClosed", () => {
        HTTP_SERVER_LOGGER.info(
          `Request.stream.streamClosed ${this.path.original} (${this._state})`,
        )
      })

    // Ensure we track the response completion event
    finished(response, (_err) => {
      this.emit("finished")
      if (_err) {
        error(`error on finish ${JSON.stringify(_err)}`)
      }
    })

    request.setTimeout(5000, () => {
      // Respond...
      this.respond(
        {
          status: {
            code: HttpStatusCode.SERVICE_UNAVAILABLE,
          },
          headers: emptyHeaders(),
        },
        HttpOperationState.TIMEOUT,
      )
    })
  }

  drop(headers?: HttpHeaders): void {
    this.respond(
      {
        status: { code: HttpStatusCode.SERVICE_UNAVAILABLE },
        headers: headers ?? emptyHeaders(),
      },
      HttpOperationState.COMPLETED,
    )
  }

  respond(
    response: HttpResponse,
    state: HttpOperationState = HttpOperationState.COMPLETED,
  ): void {
    try {
      // We're now writing
      this.state = HttpOperationState.WRITING

      // Verify headers weren't sent
      if (!this._response.headersSent) {
        // TODO: Need to handle headers...

        const headers: http2.OutgoingHttpHeaders = {}
        injectHeaders(response.headers, headers)
        this._response.writeHead(response.status.code, headers)

        // Write the body
        if (response.body?.contents && !this._response.writableEnded) {
          pipeline(response.body.contents, this._response.stream, (err) => {
            if (err) {
              error(
                `not good...${JSON.stringify(err)} at ${JSON.stringify(
                  this.path,
                )}`,
              )
            }
            this._response.end()
            this.state = state
          })
        } else {
          this._response.end()
          this.state = state
        }
      }
    } catch (err) {
      error(`error during response ${JSON.stringify(err)}`)
      if (!this._response.writableEnded) {
        this._response.end()
      }
      this.state = HttpOperationState.COMPLETED
    } finally {
      if (this._delay) {
        HttpRequestMetrics.RequestDelayDuration.record(this._delay.seconds(), {
          wasDropped: this._state === HttpOperationState.COMPLETED,
        })
      }

      if (this._state === HttpOperationState.TIMEOUT) {
        HttpRequestMetrics.RequestTimeout.add(1)
      } else {
        HttpRequestMetrics.RequestCompleted.add(1)
      }

      HttpServerMetrics.ResponseStatus.add(1, {
        status: this._response.statusCode.toString(),
      })

      finished(this._response, {}, (_) => {
        HTTP_SERVER_LOGGER.info(
          `\t${this.method} ${this.path.original} => ${this._response.statusCode}`,
        )

        HttpServerMetrics.IncomingRequestDuration.record(
          this._timer.stop().seconds(),
        )

        this.emit("finished")
      })
    }
  }
}
