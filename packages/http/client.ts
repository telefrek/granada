/**
 * HTTP Client
 */

import { isAbortError } from "@telefrek/core/errors.js"
import { EmitterFor, type Emitter } from "@telefrek/core/events.js"
import { DeferredPromise, type MaybeAwaitable } from "@telefrek/core/index.js"
import type { LifecycleEvents } from "@telefrek/core/lifecycle.js"
import { DefaultLogger, LogLevel, Logger } from "@telefrek/core/logging.js"
import { getTracer } from "@telefrek/core/observability/tracing.js"
import { Duration } from "@telefrek/core/time.js"
import { Http2ClientTransport } from "./client/http2.js"
import { DEFAULT_CLIENT_PIPELINE_CONFIGURATION } from "./client/pipeline.js"
import { HttpErrorCode, type HttpError } from "./errors.js"
import {
  HttpStatusCode,
  type HttpHandler,
  type HttpRequest,
  type HttpResponse,
  type TLSConfig,
} from "./index.js"
import {
  createHttpOperation,
  type HttpOperationSource,
  type HttpOperationSourceEvents,
} from "./operations.js"
import { createPipeline, type HttpPipeline } from "./pipeline.js"
import { emptyHeaders } from "./utils.js"

/** The logger used for HTTP Clients */
const HTTP_CLIENT_LOGGER: Logger = new DefaultLogger({
  name: "http.client",
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
   * @param abort The optional {@link AbortSignal} to use
   */
  marshal(
    request: HttpRequest,
    abort?: AbortSignal,
  ): MaybeAwaitable<HttpResponse>

  /**
   * Close the transport and allow no further interactions
   */
  close(): MaybeAwaitable<void>
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

  private _pipeline: HttpPipeline = createPipeline(
    DEFAULT_CLIENT_PIPELINE_CONFIGURATION,
  )

  constructor(options: T) {
    this._options = options
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

    const client = new DefaultHttpClient(this._options.name)
    client.once("finished", () => {
      transport.close()
    })
    if (this._pipeline.add(client as HttpOperationSource, handler)) {
      return client
    }

    throw new Error("Pipeline is not accepting clients")
  }
}

/**
 * Base class for extending Http Client behaviors
 */
export class DefaultHttpClient
  extends EmitterFor<HttpClientEvents>
  implements HttpClient
{
  private _closed: boolean

  readonly id: string

  constructor(id: string) {
    super({ captureRejections: true })

    this._closed = false
    this.id = id
  }

  close(): MaybeAwaitable<void> {
    this._closed = true
    this.emit("finished")
  }

  public async submit(
    request: HttpRequest,
    timeout: Duration = Duration.ofSeconds(15),
  ): Promise<HttpResponse> {
    // Fail subsequent submit on closed
    if (this._closed) {
      return Promise.reject(<HttpError>{ errorCode: HttpErrorCode.CLOSED })
    }

    // TODO: Add all the span details, status, etc.
    const span = getTracer().startSpan("http.client.request")

    // Create the operation
    const operation = createHttpOperation({ request, timeout, span })

    // Create our promise
    const deferred = new DeferredPromise()

    operation
      .once("finished", () => {
        deferred.resolve()
      })
      .once("response", () => {
        deferred.resolve()
      })

    this.emit("received", operation)

    await deferred

    if (operation.response) {
      return operation.response
    } else {
      return {
        status: {
          code:
            operation.error?.errorCode === HttpErrorCode.TIMEOUT
              ? HttpStatusCode.GATEWAY_TIMEOUT
              : HttpStatusCode.SERVICE_UNAVAILABLE,
        },
        headers: emptyHeaders(),
      }
    }
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
