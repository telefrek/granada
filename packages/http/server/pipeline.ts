/**
 * The goal of this package is to provide the scaffolding for creating an HTTP pipeline
 */

import { isAbortError } from "@telefrek/core/errors.js"
import { Emitter } from "@telefrek/core/events.js"
import { DeferredPromise, MaybeAwaitable } from "@telefrek/core/index.js"
import { LifecycleEvents } from "@telefrek/core/lifecycle.js"
import {
  DefaultLogger,
  LogLevel,
  type LogWriter,
  type Logger,
} from "@telefrek/core/logging.js"
import { combineTransforms, createTransform } from "@telefrek/core/streams.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import EventEmitter from "events"
import { Readable, Writable, type Transform } from "stream"
import {
  HttpRequestState,
  HttpStatus,
  type HttpRequest,
  type HttpTransform,
} from "../index.js"
import { CONTENT_PARSERS, getContentType } from "../parsers.js"
import { createRouter, isRoutableApi, type Router } from "./routing.js"

/**
 * Set of supported events on an {@link HttpPipeline}
 */
interface HttpPipelineEvents extends LifecycleEvents {
  /**
   * Fired when there is an error with the underlying {@link HttpPipeline}
   *
   * @param error The error that was encountered
   */
  error: (error: unknown) => void

  /**
   * Fired when the pipeline is paused
   */
  paused: () => void

  /**
   * Fired when the pipeline resumes processing
   */
  resumed: () => void

  /**
   * Fired when the pipeline has been completed
   */
  completed: () => void
}

/**
 * The current state for the {@link HttpPipeline}
 */
export enum HttpPipelineState {
  PROCESSING = "processing",
  PAUSED = "paused",
  COMPLETED = "completed",
}

/**
 * Represents an abstract pipeline for processing requests
 */
export interface HttpPipeline extends Emitter<HttpPipelineEvents> {
  readonly state: HttpPipelineState

  /**
   * Stops the {@link HttpPipeline} from processing any further requests
   */
  stop(): MaybeAwaitable<void>

  /**
   * Temporarily stop the {@link HttpPipeline} from processing further requests.
   * Note this may result in timeouts or other undesirable behavior if paused
   * for extended periods of time.
   */
  pause(): MaybeAwaitable<void>

  /**
   * Resumes request processing in the {@link HttpPipeline}
   */
  resume(): MaybeAwaitable<void>
}

/**
 * Explicitly define the stages of a pipeline
 */
export enum HttpPipelineStage {
  AUDITING = "auditing",
  AUTHENTICATION = "authentication",
  AUTHORIZATION = "authorization",
  CONTENT_PARSING = "contentParsing",
  HANDLER = "handler",
  LOAD_SHEDDING = "loadShedding",
  MIDDLEWARE = "middleware",
  RATE_LIMITING = "rateLimiting",
  ROUTING = "routing",
}

/** Defines the stage processing order */
export const PIPELINE_PROCESSING_ORDER = [
  HttpPipelineStage.AUDITING,
  HttpPipelineStage.LOAD_SHEDDING,
  HttpPipelineStage.AUTHENTICATION,
  HttpPipelineStage.RATE_LIMITING,
  HttpPipelineStage.CONTENT_PARSING,
  HttpPipelineStage.MIDDLEWARE,
  HttpPipelineStage.ROUTING,
  HttpPipelineStage.AUTHORIZATION,
  HttpPipelineStage.HANDLER,
] as const

/**
 * Interface for a pipeline {@link HttpRequest}
 */
export interface PipelineRequest extends HttpRequest {
  /**
   * The current {@link HttpPipelineStage}
   */
  pipelineStage: HttpPipelineStage
}

/**
 * Type guard for {@link PipelineRequest}
 *
 * @param request The {@link HttpRequest} to inspect
 * @returns True if the request is a {@link PipelineRequest}
 */
export function isPipelineRequest(
  request: HttpRequest,
): request is PipelineRequest {
  return "pipelineStage" in request
}
/**
 *
 * @param source The {@link HttpRequestSource} to build the pipeline from
 * @returns
 */
export function httpPipelineBuilder(
  source: HttpRequestSource,
): HttpPipelineBuilder {
  return new HttpPipelineBuilder(source)
}

export class HttpPipelineBuilder {
  private _source: HttpRequestSource
  private _transforms: HttpPipelineTransform[] = []
  private _unhandled: UnhandledRequestConsumer = NOT_FOUND_CONSUMER
  private _shedOnPause: boolean = false

  constructor(source: HttpRequestSource) {
    this._source = source
  }

  /**
   * Add in framework defaults for things like content parsing, authentication, etc.
   * @returns A modified {@link HttpPipelineBuilder}
   */
  withDefaults(): Omit<HttpPipelineBuilder, "withDefaults"> {
    // TODO: Extend this with others for authorization, etc.
    this._transforms.push(new ContentParsingTransform())

    return this
  }

  /**
   * Add the api if it is a valid {@link RoutableApi}
   *
   * @param api The {@link RoutableApi} to use
   *
   * @returns A modified {@link HttpPipelineBuilder}
   */
  withApi(api: unknown): HttpPipelineBuilder {
    if (isRoutableApi(api)) {
      let router = api.router

      if (api.prefix) {
        router = createRouter()
        router.addRouter(api.prefix, api.router)
      }

      this._transforms.push(new RoutingTransform(router))

      return this
    }

    throw new Error("Object is not a routable API")
  }

  /**
   * Add the transforms to the pipeline
   * @param transforms The set of transforms to include
   *
   * @returns A modified {@link HttpPipelineBuilder}
   */
  withTransforms(...transforms: HttpPipelineTransform[]): HttpPipelineBuilder {
    this._transforms.push(...transforms)
    return this
  }

  /**
   * Remove any transforms for the given stages
   * @param stages The {@link HttpPipelineStage} to remove
   *
   * @returns A modified {@link HttpPipelineBuilder}
   */
  withoutStages(...stages: HttpPipelineStage[]): HttpPipelineBuilder {
    this._transforms = this._transforms.filter((t) => !stages.includes(t.stage))
    return this
  }

  withUnhandledConsumer(
    unhandled: UnhandledRequestConsumer,
  ): HttpPipelineBuilder {
    this._unhandled = unhandled
    return this
  }

  withLoadSheddingOnPause(shedOnPause: boolean): HttpPipelineBuilder {
    this._shedOnPause = shedOnPause
    return this
  }

  /**
   * Builds a pipeline from the given stages
   * @returns A new {@link HttpPipeline}
   */
  build(): HttpPipeline {
    return new DefaultHttpPipeline({
      source: this._source,
      transforms: this._transforms,
      shedOnPause: this._shedOnPause,
      unhandledRequest: this._unhandled,
    })
  }
}

export interface HttpPipelineOptions {
  /** The {@link HttpRequestSource} to process */
  source: HttpRequestSource
  /** The {@link HttpPipelineTransform} set to apply */
  transforms: HttpPipelineTransform[]
  /** The {@link UnhandledRequestConsumer} that deals with unhandled requests */
  unhandledRequest?: UnhandledRequestConsumer
  /** Flag to indicate if load should be shed on pause (default is false) */
  shedOnPause?: boolean
}

export class DefaultHttpPipeline extends EventEmitter implements HttpPipeline {
  private _abortController: AbortController
  private _requestStream: Readable
  private _transform: Optional<Transform>
  private _consumer: Writable
  private _shedding: Optional<Writable>
  private _shedOnPause: boolean
  private readonly _closedPromise: DeferredPromise = new DeferredPromise()

  state: HttpPipelineState

  constructor(options: HttpPipelineOptions) {
    super()

    const { source, transforms } = options

    const unhandledRequest: UnhandledRequestConsumer =
      options.unhandledRequest ?? NOT_FOUND_CONSUMER

    // Setup the abort controller
    this._abortController = new AbortController()
    this._shedOnPause = options.shedOnPause ?? false

    if (this._shedOnPause) {
      this._shedding = new Writable({
        objectMode: true,
        async write(chunk: HttpRequest, _encoding, callback) {
          try {
            if (!isTerminal(chunk)) {
              chunk.respond({
                status: HttpStatus.SERVICE_UNAVAILABLE,
              })
            }
            callback()
          } catch (err) {
            callback(err as Error)
          }
        },
      })
        .on("close", () => {
          this._closedPromise.resolve()
        })
        .on("finish", () => {
          this._closedPromise.resolve()
        })
        .on("error", (err) => {
          this._closedPromise.reject(err)
        })
    }

    // Create the stream and hook the error handling
    this._requestStream = Readable.from(source, {
      // autoDestroy: true,
      objectMode: true,
      // emitClose: true,
      signal: this._abortController.signal,
    })
      .on("end", () => {
        PIPELINE_LOGGER.info("End of request stream")
      })
      .on("error", (err) => {
        if (isAbortError(err)) {
          PIPELINE_LOGGER.info(`Pipeline has been aborted`)
          // TODO: not sure this is necessary...
          this._requestStream.emit("end")
        } else {
          // Forward the error along
          PIPELINE_LOGGER.error(
            `Encountered error during pipeline processing: ${err}`,
            err,
          )
          this.emit("error", err)
        }
      })

    // The consumer needs to handle all requests that make it this far
    this._consumer = new Writable({
      objectMode: true,
      async write(chunk: HttpRequest, _encoding, callback) {
        try {
          await unhandledRequest(chunk)
          callback()
        } catch (err) {
          callback(err as Error)
        }
      },
    })
      .on("close", () => {
        this._closedPromise.resolve()
      })
      .on("finish", () => {
        this._closedPromise.resolve()
      })
      .on("error", (err) => {
        this._closedPromise.reject(err)
      })

    let httpTransform: Optional<HttpTransform>

    // Start building the stages in order
    for (const stage of PIPELINE_PROCESSING_ORDER) {
      for (const stageTransform of transforms.filter(
        (t) => t.stage === stage,
      )) {
        if (httpTransform) {
          httpTransform = combineTransforms(
            httpTransform,
            stageTransform.transform,
          )
        } else {
          httpTransform = stageTransform.transform
        }
      }
    }

    if (httpTransform) {
      PIPELINE_LOGGER.info(`Creating transforms!`)
      // Setup the transform and pipe it through to the consumer
      this._transform = createTransform(httpTransform)
      this._transform.pipe(this._consumer, {
        end: true,
      })
    }

    // Start processing...
    const target = this._transform ?? this._consumer
    this._requestStream.pipe(target, {
      end: true,
    })

    this.state = HttpPipelineState.PROCESSING
  }

  pause(): MaybeAwaitable<void> {
    if (this.state !== HttpPipelineState.PROCESSING) {
      return
    }

    // Pause the request stream
    this._requestStream.pause()

    // Check if we should shed on pause
    if (this._shedOnPause && this._shedding) {
      // Get the original writeable target
      const target: Writable = this._transform ?? this._consumer

      this._requestStream.unpipe(target)
      this._requestStream.pipe(this._shedding) // This should put it back into flowing mode
    }
  }

  resume(): MaybeAwaitable<void> {
    if (this.state !== HttpPipelineState.PAUSED) {
      return
    }

    // If the stream is paused, resume it
    if (this._requestStream.isPaused()) {
      this._requestStream.resume()
    }

    if (this._shedOnPause && this._shedding) {
      // Pause the flow of messages
      this._requestStream.pause()

      // Remove the old pipe and start it with the new destination
      this._requestStream.unpipe(this._shedding)
      const target: Writable = this._transform ?? this._consumer
      this._requestStream.pipe(target, {
        end: true,
      })

      if (this._requestStream.isPaused()) {
        PIPELINE_LOGGER.warn("having to resume pipe after unpause...")
        this._requestStream.resume()
      }
    }
  }

  stop(): MaybeAwaitable<void> {
    if (
      this.state === HttpPipelineState.COMPLETED ||
      this._abortController.signal.aborted
    ) {
      return
    } else if (
      this.state === HttpPipelineState.PAUSED &&
      this._shedding === undefined
    ) {
      // Turn things back on and then stop the flow to get the end events if not
      // shedding to finish processing of requests
      this.resume()
    }

    // Signal thta we want to be done and return the close event
    this._abortController.abort("Pipeline stop requested")
    return this._closedPromise
  }
}

/**
 * Simple pipeline transformation
 */
export interface HttpPipelineTransform {
  transform: HttpTransform
  stage: HttpPipelineStage
}

let PIPELINE_LOGGER: Logger = new DefaultLogger({
  name: "HttpPipeline",
  level: LogLevel.WARN,
  includeTimestamps: true,
})

export function setPipelineLogLevel(level: LogLevel): void {
  PIPELINE_LOGGER.setLevel(level)
}

export function setPipelineWriter(writer: LogWriter): void {
  PIPELINE_LOGGER = new DefaultLogger({
    name: "HttpPipeline",
    level: PIPELINE_LOGGER.level,
    writer: writer,
    includeTimestamps: true,
  })
}

/**
 * Helper class for building {@link HttpPipelineTransform} with correct request
 * state handling and error tracking
 */
export abstract class BaseHttpPipelineTransform
  implements HttpPipelineTransform
{
  readonly stage: HttpPipelineStage
  protected readonly _logger: Logger

  constructor(stage: HttpPipelineStage) {
    this.stage = stage
    this._logger = PIPELINE_LOGGER
  }

  /**
   * Allows the implementation to process the request further
   *
   * @param request The {@link PipelineRequest} to process
   */
  protected abstract processRequest(request: PipelineRequest): MaybeAwaitable

  transform: HttpTransform = async (
    request: HttpRequest,
  ): Promise<Optional<HttpRequest>> => {
    // We can't process a request in these states...they are completed
    if (!isTerminal(request)) {
      // Either inject or apply the current stage
      if (isPipelineRequest(request)) {
        request.pipelineStage = this.stage
      } else {
        Object.defineProperty(request, "pipelineStage", {
          value: this.stage,
          writable: true,
        })
      }

      try {
        // Pass along logic
        await this.processRequest(request as PipelineRequest)
      } catch (err) {
        // Log the failure
        this._logger.error(`Error during ${this.stage} - ${err}`, err)

        // We should complete the request as an error
        request.respond({
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        })
      }

      // Don't pass this along if something happened (timeout, failure in
      // handler, etc.)
      if (!isTerminal(request)) {
        return request
      }
    } else {
      this._logger.debug(`Received completed request: ${request.state}`)
    }

    return
  }
}

export class ContentParsingTransform extends BaseHttpPipelineTransform {
  constructor() {
    super(HttpPipelineStage.CONTENT_PARSING)
  }

  protected override async processRequest(
    request: PipelineRequest,
  ): Promise<void> {
    // Process the body if there is an unknown mediaType (i.e. no one beat us to
    // this)
    if (request.body && request.body.mediaType === undefined) {
      // Parse out the media type
      request.body.mediaType = getContentType(request.headers)

      // If we know how to decode this, go ahead
      if (request.body.mediaType) {
        // Get the parser
        const parser = CONTENT_PARSERS[request.body.mediaType.type]

        // If found, let it do it's thing
        if (parser) {
          await parser(request.body)
        }
      }
    }

    return
  }
}

export class RoutingTransform extends BaseHttpPipelineTransform {
  private _router: Router

  constructor(router: Router) {
    super(HttpPipelineStage.ROUTING)
    this._router = router
  }

  protected override async processRequest(
    request: PipelineRequest,
  ): Promise<void> {
    this._logger.debug(`Routing transform checking ${request.path.original}`)

    const info = this._router.lookup({
      path: request.path.original,
      method: request.method,
    })

    if (info) {
      this._logger.debug(`Identified route for ${request.path.original}`)

      // Add the parameter mapping...
      request.path.parameters = info.parameters

      await info.handler(request)
    } else {
      this._logger.debug(`No route identified for ${request.path.original}`)
    }

    return
  }
}

/**
 * We only want an iterable source so we can control the flow of consumption
 */
export type HttpRequestSource =
  | Iterable<HttpRequest>
  | AsyncIterable<HttpRequest>

/**
 * Simple method that consumes a {@link HttpRequest} and ensures a response is provided
 *
 * @param request The {@link HttpRequest} to finish
 */
export type UnhandledRequestConsumer = (
  request: HttpRequest,
) => MaybeAwaitable<void>

/**
 * The default {@link UnhandledRequestConsumer} that just returns 404
 *
 * @param request The unhandled {@link HttpRequest}
 * @returns A {@link UnhandledRequestConsumer} that responds as 404
 */
export const NOT_FOUND_CONSUMER: UnhandledRequestConsumer = (request) => {
  if (~isTerminal(request)) {
    request.respond({ status: HttpStatus.NOT_FOUND })
  }
}

/**
 * Check to see if the request is in a terminal state (should not require
 * further processing))
 *
 * @param request The {@link HttpRequest} to check
 *
 * @returns True if the request is in a state indicating no further processing
 * is allowed
 */
export function isTerminal(request: HttpRequest): boolean {
  switch (request.state) {
    case HttpRequestState.COMPLETED:
    case HttpRequestState.TIMEOUT:
    case HttpRequestState.ERROR:
      return true
    default:
      return false
  }
}
