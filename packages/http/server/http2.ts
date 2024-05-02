/**
 * Custom HTTP2 implementation for the server
 */

import { DeferredPromise } from "@telefrek/core/index.js"
import { registerShutdown } from "@telefrek/core/lifecycle.js"
import { Timer, delay } from "@telefrek/core/time.js"
import { randomUUID as v4 } from "crypto"
import { Stream, type Readable } from "stream"
import {
  HttpStatusCode,
  HttpVersion,
  type HttpMethod,
  type HttpRequest,
} from "../index.js"
import { HttpServerBase, type HttpServerConfig } from "../server.js"
import { extractHeaders, injectHeaders, parsePath } from "../utils.js"

import { SpanKind } from "@opentelemetry/api"
import type { Logger } from "@telefrek/core/logging"
import { activateSpan, getTracer } from "@telefrek/core/observability/tracing"
import { drain, pipe } from "@telefrek/core/streams"
import {
  Http2Server,
  Http2ServerRequest,
  SecureServerOptions,
  ServerHttp2Session,
  createSecureServer,
  type OutgoingHttpHeaders,
} from "http2"
import { HttpServerMetrics } from "../metrics.js"

/**
 * Default implementation of the {@link HttpServer} using the node `http2` package
 */
export class NodeHttp2Server extends HttpServerBase {
  private _server: Http2Server
  private _sessions: ServerHttp2Session[] = []

  constructor(config: HttpServerConfig, logger?: Logger) {
    super(config, logger)
    Stream.Duplex.setMaxListeners(128)

    const options: SecureServerOptions = {
      ca: config.tls?.certificateAuthority,
      key: config.tls?.privateKey,
      cert: config.tls?.publicCertificate,
      allowHTTP1: true,
    }

    this._server = createSecureServer(options)

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
    if (graceful) {
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

    this._server.on("request", async (req, resp) => {
      const timer = Timer.startNew()
      const socket = req.stream.session?.socket

      const span = getTracer().startSpan("http.request", {
        root: true,
        kind: SpanKind.SERVER,
        attributes: {
          SEMATTRS_NET_HOST_IP: socket?.localAddress,
          SEMATTRS_NET_HOST_PORT: socket?.localPort,
          SEMATTRS_NET_PEER_IP: socket?.remoteAddress,
          SEMATTRS_NET_PEER_PORT: socket?.remotePort,
          SEMATTRS_HTTP_CLIENT_IP: socket?.remoteAddress,
          SEMATTRS_HTTP_HOST: req.headers["host"],
          SEMATTRS_HTTP_METHOD: req.headers[":method"],
          SEMATTRS_HTTP_SCHEME: req.headers[":scheme"],
          SEMATTRS_HTTP_FLAVOR: req.httpVersion,
          SEMATTRS_HTTP_ROUTE: req.url,
        },
      })

      const scope = activateSpan(span)

      // Handle health
      if (req.method === "GET") {
        if (req.url === "/health") {
          resp.writeHead(HttpStatusCode.NO_CONTENT).end()
          return
        }

        // Handle ready
        if (req.url === "/ready") {
          resp
            .writeHead(
              this.isReady
                ? HttpStatusCode.NO_CONTENT
                : HttpStatusCode.BAD_GATEWAY,
            )
            .end()
          return
        }
      }

      // Get the response
      const controller = new AbortController()
      req.on("aborted", () => {
        controller.abort("Request was abandoned")
      })

      try {
        const response = await this.handleRequest(
          createHttp2Request(req),
          controller,
        )

        // Deal with HTTP2 specific stuff
        const outgoing = <OutgoingHttpHeaders>{}

        // Inject remaining
        injectHeaders(response.headers, outgoing)
        resp.writeHead(response.status.code, outgoing)

        if (response.body) {
          pipe(response.body.contents, resp)
        } else {
          resp.end()
        }
      } catch (err) {
        this._logger.error(`[${req.method} -> ${req.url}]: ${err}`)

        if (!req.stream.endAfterHeaders && !req.readableEnded) {
          try {
            await drain(req)
          } catch {
            this._logger.fatal(`Failed to consume outstanding request body`)
          }
        }

        if (!resp.headersSent) {
          resp.writeHead(HttpStatusCode.INTERNAL_SERVER_ERROR).end()
        } else {
          resp.end()
        }
      } finally {
        HttpServerMetrics.ResponseStatus.add(1, {
          status: resp.statusCode.toString(),
        })

        HttpServerMetrics.IncomingRequestDuration.record(timer.stop().seconds())
        scope.finish()
        span.end()
      }
    })
  }
}

function createHttp2Request(request: Http2ServerRequest): HttpRequest {
  const { path, query } = parsePath(request.url)

  return {
    id: v4(),
    path,
    query,
    headers: extractHeaders(request.headers),
    version: HttpVersion.HTTP_2,
    method: request.method.toUpperCase() as HttpMethod,
    body: request.stream.endAfterHeaders
      ? undefined
      : {
          contents: request as Readable,
        },
  }
}
