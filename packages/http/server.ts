/**
 * HTTP Server implementation
 */

import { trace } from "@opentelemetry/api"
import { Emitter } from "@telefrek/core/events"
import { LifecycleEvents, registerShutdown } from "@telefrek/core/lifecycle"
import {
  CircularArrayBuffer,
  createIterator,
} from "@telefrek/core/structures/circularBuffer"
import EventEmitter from "events"
import * as http2 from "http2"
import { Readable, Stream, finished, pipeline } from "stream"
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
  parsePath,
} from "."
import { mediaTypeToString } from "./content"

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
   * Closes the server, rejecting any further calls
   */
  close(): Promise<void>

  /**
   * Allow iterating over the {@link HttpRequest} that are received
   */
  [Symbol.asyncIterator](): AsyncIterator<HttpRequest>
}

/**
 * Builder style creation for a {@link HttpServer}
 */
export interface HttpServerBuilder {
  /**
   * Add TLS to the server
   *
   * @param details The details for the certificate locations and allowed usage
   *
   * @returns An updated builder
   */
  withTls(details: {
    /** The certificate path */
    cert: string | Buffer
    /** The key path */
    key: string | Buffer
    /** The key password */
    passphrase?: string
    /** The optional CA Chain file */
    caFile?: string
    /** Flag to indicate if mutual authentication should be used to validate client certificates */
    mutualAuth?: boolean
  }): HttpServerBuilder

  /**
   * Builds a {@link HttpServer} from the parameters given
   *
   * @returns A fully initialized {@link HttpServer}
   */
  build(): HttpServer
}

/**
 * Default {@link HttpServerBuilder} that utilizes the underlying node `http2` package
 * @returns The default {@link HttpServerBuilder} in the framework
 */
export function getDefaultBuilder(): HttpServerBuilder {
  return new HttpServerBuilderImpl()
}

/**
 * Default implementation of a {@link HttpServerBuilder}
 */
class HttpServerBuilderImpl implements HttpServerBuilder {
  options: http2.SecureServerOptions = {
    allowHTTP1: true,
  }

  withTls(details: {
    cert: string | Buffer
    key: string | Buffer
    passphrase?: string
    caFile?: string | undefined
    mutualAuth?: boolean | undefined
  }): HttpServerBuilder {
    this.options = {
      ...this.options,
      ...details,
    }

    return this
  }

  build(): HttpServer {
    return new HttpServerImpl(this.options)
  }
}

/**
 * Default implementation of the {@link HttpServer} using the node `http2` package
 */
class HttpServerImpl extends EventEmitter implements HttpServer {
  #server: http2.Http2Server
  #tracer = trace.getTracer("Granada.HttpServer")
  #sessions: http2.ServerHttp2Session[] = []

  constructor(options: http2.SecureServerOptions) {
    super()

    Stream.Duplex.setMaxListeners(200)

    // TODO: Start looking at options for more configurations.  If no TLS, HTTP 1.1, etc.
    this.#server = http2.createSecureServer(options)

    this.#server.on("session", (session) => {
      this.#sessions.push(session)
      session.once("close", () => {
        const idx = this.#sessions.indexOf(session)
        if (idx >= 0) {
          this.#sessions.splice(idx, 1)
        }
      })
    })

    // Register the shutdown hook
    registerShutdown(() => this.close())

    // Make sure to map requests
    this.#setupRequestMapping()
  }

  [Symbol.asyncIterator](): AsyncIterator<HttpRequest, void, never> {
    // TODO: Make this configurable
    const buffer = new CircularArrayBuffer<HttpRequest>({ highWaterMark: 256 })

    this.on("request", (request: HttpRequest) => {
      // If we can't add to the buffer, need to reject
      if (!buffer.tryAdd(request)) {
        const headers = emptyHeaders()

        // TODO: Make this configurable...
        headers.set("Retry-After", "60")
        request.respond({
          status: HttpStatus.SERVICE_UNAVAILABLE,
          headers,
        })
      }
    })

    return createIterator(buffer)
  }

  listen(port: number): Promise<void> {
    if (!this.#server.listening) {
      this.emit("started")
      this.#server.listen(port, "0.0.0.0")
      this.emit("listening", port)
    } else {
      throw new Error("Server is already listening on another port")
    }

    return new Promise((resolve) => {
      this.once("finished", resolve)
    })
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.#server.listening) {
        this.emit("stopping")

        // Close the server to stop accepting new streams
        this.#server.close((err) => {
          this.emit("finished")
          if (err) {
            this.emit("error", err)
            reject(err)
          } else {
            resolve()
          }
        })

        // Close all existing streams
        this.#sessions.map((s) => s.close())
      } else {
        resolve()
      }
    })
  }

  #setupRequestMapping(): void {
    this.#server.on("error", (err) => {
      console.error("error...")
      this.emit("error", err)
    })
    this.#server.on("request", (req, resp) => {
      this.emit("request", new Http2Request(req, resp))
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
  incomingHeaders: http2.IncomingHttpHeaders
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

let counter = 0

class Http2Request extends EventEmitter implements HttpRequest {
  path: HttpPath
  method: HttpMethod
  headers: HttpHeaders
  version: HttpVersion
  state: HttpRequestState

  query: HttpQuery | undefined
  body: HttpBody | undefined
  #status: number | undefined

  #response: http2.Http2ServerResponse
  #id: number | undefined

  constructor(
    request: http2.Http2ServerRequest,
    response: http2.Http2ServerResponse
  ) {
    super()
    const { path, query } = parsePath(request.url)
    this.path = path
    this.query = query
    this.state = HttpRequestState.PENDING
    this.headers = parseHttp2Headers(request.headers)
    this.version = HttpVersion.HTTP_2
    this.method = request.method.toUpperCase() as HttpMethod
    this.body = { contents: request as Readable }

    this.#response = response

    // Ensure we track the response completion event
    finished(response, (_err) => {
      this.emit("finished")
      if (_err) {
        console.log(`error on finish ${JSON.stringify(_err)}`)
      }
    })

    request.setTimeout(5000, () => {
      this.state = HttpRequestState.TIMEOUT
      this.#response.writeHead(503)
      this.#response.end()
    })
  }

  respond(response: HttpResponse): void {
    try {
      if (this.#id !== undefined) {
        console.log(`id before inc: ${this.#id}`)
      }

      this.#id = counter++
      switch (true) {
        case this.state === HttpRequestState.COMPLETED:
          console.log(`BAD MONKEY!! ${this.#id}  ${JSON.stringify(this.path)}`)
      }

      // We're now writing
      this.state = HttpRequestState.WRITING
      this.#status = response.status

      // Verify headers weren't sent
      if (!this.#response.headersSent) {
        // Write the head section
        if (response.body?.mediaType) {
          this.#response.writeHead(response.status, {
            "Content-Type": mediaTypeToString(response.body.mediaType),
          })
        } else {
          this.#response.writeHead(response.status)
        }

        // Write the body

        if (response.body?.contents && !this.#response.writableEnded) {
          pipeline(response.body.contents, this.#response.stream, (err) => {
            if (err) {
              console.log(
                `not good...${JSON.stringify(err)} at ${JSON.stringify(
                  this.path
                )}`
              )
            }
            this.#response.end()
            this.state = HttpRequestState.COMPLETED
          })
        } else {
          this.#response.end()
          this.state = HttpRequestState.COMPLETED
        }
      }
    } catch (err) {
      console.trace(`error during response ${JSON.stringify(err)}`)
      if (!this.#response.writableEnded) {
        this.#response.end()
      }
      this.state = HttpRequestState.ERROR
    }
  }
}
