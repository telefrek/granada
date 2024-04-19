/**
 * HTTP Server implementation
 */

import { trace } from "@opentelemetry/api"
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
import {
  CircularArrayBuffer,
  createIterator,
} from "@telefrek/core/structures/circularBuffer.js"
import { Timer, delay, type Duration } from "@telefrek/core/time.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import EventEmitter from "events"
import * as http2 from "http2"
import { Readable, Stream, finished, pipeline } from "stream"
import { mediaTypeToString } from "./content.js"
import {
  HttpBody,
  HttpHeaders,
  HttpMethod,
  HttpPath,
  HttpQuery,
  HttpRequest,
  HttpRequestState,
  HttpResponse,
  HttpStatus,
  HttpVersion,
  emptyHeaders,
  isTerminal,
  parsePath,
} from "./index.js"
import { HttpRequestMetrics, HttpServerMetrics } from "./metrics.js"

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
   * Fired when a new {@link HttpRequest} is received
   *
   * @param request The {@link HttpRequest} that was received
   */
  request: (request: HttpRequest) => void

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
  listen(port: number): Promise<void>

  /**
   * Enable/Disable queries for the /ready endpoint
   *
   * @param enable The enable flag
   */
  enableReady(enable: boolean): void

  /**
   * Closes the server, rejecting any further calls
   *
   * @param graceful Flag to indicate if we want a graceful shutdown
   */
  close(graceful: boolean): MaybeAwaitable<void>

  /**
   * Allow iterating over the {@link HttpRequest} that are received
   */
  [Symbol.asyncIterator](): AsyncIterator<HttpRequest>
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

  enableReady(enable: boolean): void {
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
        request.respond(
          {
            status: HttpStatus.SERVICE_UNAVAILABLE,
            headers,
          },
          HttpRequestState.DROPPED,
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
      this.enableReady(false)

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
        resp.writeHead(HttpStatus.NO_CONTENT).end()
        return
      }

      // Handle ready
      if (req.url === "/ready") {
        resp
          .writeHead(this._ready ? HttpStatus.NO_CONTENT : HttpStatus.NOT_FOUND)
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

class Http2Request extends EventEmitter implements HttpRequest {
  readonly path: HttpPath
  readonly method: HttpMethod
  readonly headers: HttpHeaders
  readonly version: HttpVersion
  readonly query: Optional<HttpQuery>
  readonly body: Optional<HttpBody>

  private _timer: Timer
  private _state: HttpRequestState
  private _response: http2.Http2ServerResponse
  private _delay: Optional<Duration>

  get state(): HttpRequestState {
    return this._state
  }

  set state(state: HttpRequestState) {
    // Check for duration lag
    if (this._state === HttpRequestState.PENDING) {
      this._delay = this._timer.elapsed()
    }

    // Verify state changes
    switch (state) {
      case HttpRequestState.DROPPED:
        // Increment the request shed counter
        HttpServerMetrics.RequestsShedCounter.add(1)
      case HttpRequestState.COMPLETED:
      case HttpRequestState.ERROR:
      case HttpRequestState.TIMEOUT:
        break
      case HttpRequestState.PENDING:
        break
      case HttpRequestState.PROCESSING:
        break
      case HttpRequestState.READING:
        break
      case HttpRequestState.WRITING:
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

    // Log the incoming request
    HTTP_SERVER_LOGGER.info(`${request.method} ${request.url}`)

    const { path, query } = parsePath(request.url)
    this.path = path
    this.query = query
    this._state = HttpRequestState.PENDING
    this.headers = parseHttp2Headers(request.headers)
    this.version = HttpVersion.HTTP_2
    this.method = request.method.toUpperCase() as HttpMethod
    this.body = { contents: request as Readable }

    this._response = response

    // Ensure we track the response completion event
    finished(response, (_err) => {
      ;(this as HttpRequest).emit("finished")
      if (_err) {
        error(`error on finish ${JSON.stringify(_err)}`)
      }
    })

    request.setTimeout(5000, () => {
      // Respond...
      this.respond(
        {
          status: HttpStatus.SERVICE_UNAVAILABLE,
        },
        HttpRequestState.TIMEOUT,
      )
    })
  }

  respond(
    response: HttpResponse,
    state: HttpRequestState = HttpRequestState.COMPLETED,
  ): void {
    // Verify we aren't already done
    if (isTerminal(this)) {
      HTTP_SERVER_LOGGER.error(
        `Request attempted to finish twice: ${this._state}, ${state}`,
      )
      return
    }

    try {
      // We're now writing
      this.state = HttpRequestState.WRITING

      // Verify headers weren't sent
      if (!this._response.headersSent) {
        // TODO: Need to handle headers...

        // Write the head section
        if (response.body?.mediaType) {
          this._response.writeHead(response.status, {
            "Content-Type": mediaTypeToString(response.body.mediaType),
          })
        } else {
          this._response.writeHead(response.status)
        }

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
      this.state = HttpRequestState.ERROR
    } finally {
      if (this._delay) {
        HttpRequestMetrics.RequestDelayDuration.record(this._delay.seconds(), {
          wasDropped: this._state === HttpRequestState.DROPPED,
        })
      }

      if (this._state === HttpRequestState.TIMEOUT) {
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
      })
    }
  }
}
