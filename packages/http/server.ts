/**
 * HTTP Server implementation
 */

import { trace } from "@opentelemetry/api"
import { Emitter } from "@telefrek/core/events"
import { LifecycleEvents, registerShutdown } from "@telefrek/core/lifecycle"
import EventEmitter from "events"
import * as http2 from "http2"
import { Readable, finished, pipeline } from "stream"
import {
  HttpBody,
  HttpHeaders,
  HttpMethod,
  HttpPath,
  HttpQuery,
  HttpRequest,
  HttpResponse,
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

  toReadable(): Readable
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

    // TODO: Start looking at options for more configurations.  If no TLS, HTTP 1.1, etc.
    this.#server = http2.createSecureServer(options)

    this.#server.on("session", (session) => {
      this.#sessions.push(session)
      session.on("close", () => {
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

  toReadable(): Readable {
    const readable = Readable.from(async *function()=>{
      let next = new Awaitable
    })

    return readable
  }

  #setupRequestMapping(): void {
    this.#server.on("error", (err) => {
      console.log("error...")
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
  path: HttpPath
  method: HttpMethod
  headers: HttpHeaders
  version: HttpVersion
  query?: HttpQuery | undefined
  body?: HttpBody | undefined

  #response: http2.Http2ServerResponse

  constructor(
    request: http2.Http2ServerRequest,
    response: http2.Http2ServerResponse,
  ) {
    super()
    const { path, query } = parsePath(request.url)
    this.path = path
    this.query = query
    this.headers = parseHttp2Headers(request.headers)
    this.version = HttpVersion.HTTP_2
    this.method = request.method.toUpperCase() as HttpMethod
    this.body = { contents: request as Readable }

    this.#response = response

    // Ensure we track the response completion event
    finished(response, (_err) => {
      this.emit("finished")
    })

    request.setTimeout(5000, () => {
      if (this.#response.writable && !this.#response.headersSent) {
        this.#response.writeHead(503)
        this.#response.end()
      }
    })
  }

  respond(response: HttpResponse): void {
    // Verify timeout or other things didn't end us...
    if (this.#response.writable) {
      // Write the head section
      if (response.body?.mediaType) {
        this.#response.writeHead(response.status, {
          "Content-Type": mediaTypeToString(response.body.mediaType),
        })
      } else {
        this.#response.writeHead(response.status)
      }

      // Write the body

      if (response.body?.contents) {
        pipeline(
          response.body.contents as Readable,
          this.#response.stream,
          (err) => {
            if (err) {
              console.log(`not good...${JSON.stringify(err)}`)
            }
            this.#response.end()
          },
        )
      } else {
        this.#response.end()
      }
    }
  }
}
