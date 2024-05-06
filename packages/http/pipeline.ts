/**
 * The goal of this package is to provide the scaffolding for creating an HTTP pipeline
 */

import { Signal } from "@telefrek/core/concurrency.js"
import { Emitter, EmitterFor } from "@telefrek/core/events.js"
import { MaybeAwaitable } from "@telefrek/core/index.js"
import { LifecycleEvents } from "@telefrek/core/lifecycle.js"
import {
  DefaultLogger,
  LogLevel,
  type LogWriter,
  type Logger,
} from "@telefrek/core/logging.js"
import {
  GenericTransform,
  drain,
  type StreamCallback,
  type TransformFunc,
} from "@telefrek/core/streams.js"
import { Timestamp } from "@telefrek/core/time.js"
import { on } from "events"
import {
  Readable,
  promises as StreamPromise,
  Transform,
  Writable,
  type TransformOptions,
} from "stream"
import {
  HTTP_OPERATION_CONTEXT_STORE,
  isTerminal,
  type HttpOperationContext,
} from "./context.js"
import { translateHttpError } from "./errors.js"
import {
  type HttpHandler,
  type HttpRequest,
  type HttpResponse,
} from "./index.js"
import { type HttpOperation, type HttpOperationSource } from "./operations.js"
import { notFound } from "./utils.js"

/**
 * The default {@link Logger} for {@link HttpPipeline} operations
 */
let PIPELINE_LOGGER: Logger = new DefaultLogger({
  name: "http.pipeline",
  level: LogLevel.WARN,
})

/**
 * Update the pipeline log levels
 *
 * @param level The {@link LogLevel} for the {@link HttpPipeline} {@link Logger}
 */
export function setPipelineLogLevel(level: LogLevel): void {
  PIPELINE_LOGGER.setLevel(level)
}

/**
 * Update the pipeline log writer
 *
 * @param writer the {@link LogWriter} to use for {@link HttpPipeline}
 * {@link Logger} objects
 */
export function setPipelineWriter<T extends LogWriter>(writer: T): void {
  PIPELINE_LOGGER = new DefaultLogger({
    name: PIPELINE_LOGGER.name,
    level: PIPELINE_LOGGER.level,
    writer: writer,
  })
}

/**
 * Log an error in the pipeline logger
 *
 * @param message The message to send as an error
 * @param reason The reason for the error
 */
export function pipelineError(message: string, reason?: unknown): void {
  PIPELINE_LOGGER.error(message, reason)
}

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
   * Adds the given {@link HttpOperationSource} to this pipeline using the
   * specified {@link HttpPipelineOptions} for controlling behavior.
   *
   * @param source The {@link HttpOperationSource} to add
   * @param handler The {@link HttpHandler} to use
   * @param options The {@link HttpPipelineOptions} for this source
   *
   * @returns True if the {@link HttpOperationSource} was successfully added
   */
  add(
    source: HttpOperationSource,
    handler: HttpHandler,
    options?: HttpPipelineOptions,
  ): boolean

  /**
   * Attempts to remove the given {@link HttpOperationSource} from this pipeline
   *
   * @param source The {@link HttpOperationSource} to remove
   *
   * @returns True if the {@link HttpOperationSource} was removed
   */
  remove(source: HttpOperationSource): MaybeAwaitable<boolean>

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
 * Options for controlling {@link HttpPipeline} runtime behavior
 */
export interface HttpPipelineOptions {
  /** Optional cap for the maximum number of concurrent operations to support */
  maxConcurrency?: number

  /** The maximum amount of operations to let build up before  */
  highWaterMark?: number
}

/**
 * Define the shape for all required operation handlers
 */
export type HttpOperationHandler = (
  request: HttpRequest,
  abort: AbortSignal,
) => MaybeAwaitable<HttpResponse>

/**
 * Explicitly define the stages of a pipeline
 */
export enum HttpPipelineStage {
  AUDITING = "auditing",
  AUTHENTICATION = "authentication",
  AUTHORIZATION = "authorization",
  COMPLETED = "completed",
  CONTENT_PARSING = "contentParsing",
  LOAD_SHEDDING = "loadShedding",
  MIDDLEWARE = "middleware",
  RATE_LIMITING = "rateLimiting",
  ROUTING = "routing",
}

/**
 * A simple type representing a stream transform on a {@link HttpOperation}
 */
export type HttpTransform = TransformFunc<
  HttpOperationContext,
  HttpOperationContext
>

export interface HttpPipelineConfiguration {
  /** Transforms for the request handling portion */
  requestTransforms?: HttpTransform[]
  /** Transforms for the response handling portion */
  responseTransforms?: HttpTransform[]
  /** Logger to use (default to the core pipeline logger) */
  logger?: Logger
  /** Flag to automatically cleanup the pipeline when all sources are removed */
  autoDestroy?: boolean
}

export function createPipeline(
  configuration: HttpPipelineConfiguration,
): HttpPipeline {
  return new DefaultHttpPipeline(configuration)
}

/**
 * Contains details about the pipelines that are running
 */
interface PipelineDetails {
  destination: Writable
  middleware: Middleware
  source: Readable
  started: Timestamp
  options: HttpPipelineOptions
}

const DEFAULT_TRANSFORM_OPTS = <TransformOptions>{
  objectMode: true,
  allowHalfOpen: false,
  autoDestroy: true,
  emitClose: true,
}

type Middleware = {
  start: GenericTransform<HttpOperationContext, HttpOperationContext>
  end: GenericTransform<HttpOperationContext, HttpOperationContext>
}

class DefaultHttpPipeline
  extends EmitterFor<HttpPipelineEvents>
  implements HttpPipeline
{
  private _state: HttpPipelineState
  private readonly _signal: Signal
  private readonly _logger: Logger
  private readonly _configuration: HttpPipelineConfiguration

  private _sources: Map<HttpOperationSource, PipelineDetails> = new Map()

  get state(): HttpPipelineState {
    return this._state
  }

  constructor(configuration: HttpPipelineConfiguration) {
    super()

    this._state = HttpPipelineState.PROCESSING
    this._signal = new Signal()
    this._logger = configuration.logger ?? PIPELINE_LOGGER
    this._configuration = configuration
  }

  private _createHandlerTransform(defaultHandler: HttpHandler): HttpTransform {
    const logger = this._logger
    return async (
      context: HttpOperationContext,
    ): Promise<HttpOperationContext> => {
      // Only process if we're not completed and there are no other responses already
      if (
        context.stage !== HttpPipelineStage.COMPLETED &&
        !(context.operation.response || context.response)
      ) {
        try {
          // Either use the context handler or the default
          const handler = context.handler ?? defaultHandler

          // Call the handler
          context.response = await HTTP_OPERATION_CONTEXT_STORE.run(
            context,
            async () => {
              const response = await handler(
                context.operation.request,
                context.operation.signal,
              )

              return response
            },
          )
        } catch (err) {
          context.operation.fail(translateHttpError(err))
        } finally {
          // Remove any references
          context.handler = undefined

          if (
            context.operation.request.body &&
            !context.operation.request.body.contents.readableEnded
          ) {
            logger.error(
              `[${context.operation.request.method}] ${context.operation.request.path.original} didn't read, draining body`,
            )
            await drain(context.operation.request.body.contents)
          }
        }
      }

      return context
    }
  }

  private _buildMiddleware(handler: HttpHandler): Middleware {
    const logger = this._logger
    const start = new GenericTransform((context: HttpOperationContext) => {
      logger.debug(
        `dequeueing: ${context.operation.request.method} ${context.operation.request.path.original}`,
      )
      context.operation.dequeue()
      return context
    }, DEFAULT_TRANSFORM_OPTS)

    let end = start

    // Check for any request transforms
    if (this._configuration.requestTransforms) {
      for (const transform of this._configuration.requestTransforms) {
        end = end
          .on("error", (err: unknown) => {
            logger.error(`Error in pipeline during requestTransform: ${err}`)
          })
          .pipe(new GenericTransform(transform, DEFAULT_TRANSFORM_OPTS))
      }
    }

    // Add the handler stage
    end = end
      .on("error", (err: unknown) => {
        logger.error(`Error in pipeline during before handler: ${err}`)
      })
      .pipe(
        new GenericTransform(
          this._createHandlerTransform(handler),
          DEFAULT_TRANSFORM_OPTS,
        ),
      )

    // Check for any response transforms
    if (this._configuration.responseTransforms) {
      for (const transform of this._configuration.responseTransforms) {
        end = end
          .on("error", (err: unknown) => {
            logger.error(`Error in pipeline during responseTransform: ${err}`)
          })
          .pipe(new GenericTransform(transform, DEFAULT_TRANSFORM_OPTS))
      }
    }

    return { start, end }
  }

  private _buildReadable(
    source: HttpOperationSource,
    options: HttpPipelineOptions,
  ): Readable {
    const logger = this._logger

    const readable = Readable.from(on(source, "received"), {
      highWaterMark: options.highWaterMark,
      objectMode: true,
      emitClose: true,
      autoDestroy: true,
    })

    source.once("finished", () => {
      // Destroy the readable stream
      readable.destroy()
    })

    return readable
      .on("error", (err) => {
        logger.error(`Error in pipeline ${err}`)
      })
      .pipe(
        new Transform({
          objectMode: true,
          highWaterMark: options.highWaterMark,
          write(
            chunk: unknown,
            encoding: BufferEncoding,
            callback: StreamCallback,
          ) {
            // Stupid iterator pushes the tuple...
            const operation: HttpOperation = Array.isArray(chunk)
              ? (chunk[0] as HttpOperation)
              : (chunk as HttpOperation)
            this.push(
              <HttpOperationContext>{
                operation,
                stage: HttpPipelineStage.AUDITING,
              },
              encoding,
            )

            callback()
          },
        }),
      )
  }

  private _buildConsumer(options: HttpPipelineOptions): Writable {
    const logger = this._logger
    const check = this._checkState.bind(this)

    return new Writable({
      objectMode: true,
      emitClose: true,
      highWaterMark: options?.highWaterMark,
      destroy: (err, callback) => {
        if (err) {
          logger.error(`Error during pipeline causing destroy: ${err}`)
        }
        logger.debug(`Closing pipeline`)
        callback()
      },
      write(
        context: HttpOperationContext,
        _: BufferEncoding,
        callback: StreamCallback,
      ) {
        check()
          .then(() => {
            if (!isTerminal(context)) {
              context.operation.complete(context.response ?? notFound())
            }
          })
          .finally(() => {
            callback()
          })
      },
    })
  }

  private _buildPipeline(
    source: HttpOperationSource,
    handler: HttpHandler,
    options: HttpPipelineOptions,
  ): PipelineDetails {
    const logger = this._logger

    const details: PipelineDetails = {
      started: Timestamp.now(),
      source: this._buildReadable(source, options),
      middleware: this._buildMiddleware(handler),
      destination: this._buildConsumer(options),
      options,
    }

    // Link the pipelines
    details.source
      .on("error", (err) => {
        logger.error(`Error in pipeline source: ${err}`)
      })
      .pipe(details.middleware.start)
    details.middleware.end
      .on("error", (err) => {
        logger.error(`Error in pipeline middleware: ${err}`)
      })
      .pipe(details.destination)

    return details
  }

  private async _checkState(): Promise<void> {
    if (this._state === HttpPipelineState.PAUSED) {
      await this._signal.wait()
    }
  }

  add(
    source: HttpOperationSource,
    handler: HttpHandler,
    options: HttpPipelineOptions = {},
  ): boolean {
    if (this._state !== HttpPipelineState.COMPLETED) {
      let details = this._sources.get(source)
      if (details) {
        return false
      }

      // Create the readable
      details = this._buildPipeline(source, handler, options)
      this._sources.set(source, details)

      // Remove the source if it's still attached
      const remove = this.remove.bind(this)
      source.once("finished", () => {
        void remove(source)
      })

      return true
    }

    return false
  }

  async remove(source: HttpOperationSource): Promise<boolean> {
    const details = this._sources.get(source)
    if (details) {
      this._logger.debug(`Removing source: ${source.id}`)

      const finished = StreamPromise.finished(details.destination, {
        error: true,
        writable: true,
      })

      await finished
    }

    return this._sources.delete(source)
  }

  async stop(): Promise<void> {
    // Allow anything that was waiting to finish
    await this.resume()

    // Mark this as complete
    this._state = HttpPipelineState.COMPLETED

    // Clear the sources
    for (const source of this._sources.keys()) {
      await this.remove(source)
    }
  }

  pause(): MaybeAwaitable<void> {
    if (this._state === HttpPipelineState.PROCESSING) {
      this._state = HttpPipelineState.PAUSED
    }
  }

  resume(): MaybeAwaitable<void> {
    if (this._state === HttpPipelineState.PAUSED) {
      this._state = HttpPipelineState.PROCESSING
      this._signal.notifyAll()
    }
  }
}
