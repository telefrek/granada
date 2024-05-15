/**
 * The goal of this package is to provide the scaffolding for creating an HTTP pipeline
 */

import { Signal } from "@telefrek/core/concurrency.js"
import { Emitter, EmitterFor } from "@telefrek/core/events.js"
import { MaybeAwaitable } from "@telefrek/core/index.js"
import { LifecycleEvents } from "@telefrek/core/lifecycle.js"
import { DefaultLogger, LogLevel, type Logger } from "@telefrek/core/logging.js"
import { Tracing, TracingContext } from "@telefrek/core/observability/tracing"
import {
  StreamConcurrencyMode,
  createNamedTransform,
  drain,
  pipe,
  type PrioritizationOptions,
  type TransformFunc,
} from "@telefrek/core/streams.js"
import { Duration, Timestamp } from "@telefrek/core/time.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import { on } from "events"
import { Readable, Writable, type Transform } from "stream"
import { finished } from "stream/promises"
import {
  HTTP_OPERATION_CONTEXT_STORE,
  isTerminal,
  type HttpOperationContext,
} from "./context.js"
import { HttpErrorCode, translateHttpError } from "./errors.js"
import {
  type HttpHandler,
  type HttpRequest,
  type HttpResponse,
} from "./index.js"
import { HttpRequestPipelineMetrics, monitorTransform } from "./metrics.js"
import { type HttpOperationSource } from "./operations.js"
import {
  createRouter,
  setRoutingParameters,
  traceRoute,
  type Router,
} from "./routing.js"

/**
 * The default {@link Logger} for {@link HttpPipeline} operations
 */
const PIPELINE_LOGGER: Logger = new DefaultLogger({
  name: "http.pipeline",
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
 *
 * Audit (happens as received)
 *
 * Routing, LoadShedding, Authentication, RateLimiting, Authorization, Caching, ContentParsing, Middleware.before,
 * Handler, Middleware.after, Compression
 */
export enum HttpPipelineStage {
  // AUDITING = "auditing", // TODO: Make this it's own consumption point for
  // the operation
  AUTHENTICATION = "authentication",
  AUTHORIZATION = "authorization",
  CACHING = "caching",
  LOAD_SHEDDING = "loadShedding",
  RATE_LIMITING = "rateLimiting",
  ROUTING = "routing",
}

/**
 * A simple type representing a stream transform on a {@link HttpOperation}
 */
type HttpTransform = TransformFunc<HttpOperationContext, HttpOperationContext>

/**
 * Represents a transform bound to a specific stage
 */
type HttpPipelineStageTransform<Stage extends HttpPipelineStage> = {
  /** The name of the transform */
  transformName: string

  /** The {@link HttpPipelineStage} for the transform */
  stage: Stage
}

/**
 * Represents configuration for load shedding
 */
export type HttpPipelineLoadShedder =
  HttpPipelineStageTransform<HttpPipelineStage.LOAD_SHEDDING> &
    PrioritizationOptions & {
      maxOutstandingRequests?: number
    }

/**
 * Represents a pipeline router
 */
export type HttpPipelineRouter =
  HttpPipelineStageTransform<HttpPipelineStage.ROUTING> & {
    /** The {@link Router} to use */
    router: Router

    /** The base path to host the route at */
    basePath: string
  }

/** Supported transform types */
export type HttpPipelineTransform = HttpPipelineRouter | HttpPipelineLoadShedder

/**
 * Represents a middleware action in the pipeline
 */
export interface HttpPipelineMiddleware {
  /** The name of the middleware */
  name: string

  /**
   * Allows a hook point for modifying a request
   *
   * @param request The {@link HttpRequest} to modify
   * @returns An optional {@link HttpResponse} if it should be provided
   */
  modifyRequest?: (
    request: HttpRequest,
  ) => MaybeAwaitable<Optional<HttpResponse>>

  /**
   * Allows a hook point after a response has been generated to allow augmenting
   * before sending to the receiver
   *
   * @param request The original readonly {@link HttpRequest}
   * @param response The current {@link HttpResponse} which can be modified
   * before sending
   */
  modifyResponse?: (
    request: Readonly<HttpRequest>,
    response: HttpResponse,
  ) => MaybeAwaitable<void>
}

export interface HttpPipelineConfiguration {
  /** The set of {@link HttpPipelineTransform} to apply in the pipeline */
  transforms?: HttpPipelineTransform[]
  /** The middleware to execute as part of the pipeline */
  middleware?: HttpPipelineMiddleware[]
  /** Flag to automatically cleanup the pipeline when all sources are removed */
  autoDestroy?: boolean
}

export function createPipeline(
  configuration: HttpPipelineConfiguration,
): HttpPipeline {
  return new DefaultHttpPipeline(configuration)
}

function createTransform<Stage extends HttpPipelineStage>(
  stage: Stage,
  sources: HttpPipelineTransform[],
): Transform {
  switch (stage) {
    case HttpPipelineStage.ROUTING: {
      const router = createRouter()
      for (const source of sources) {
        const pipelineRouter = source as HttpPipelineRouter
        router.addRouter(pipelineRouter.basePath, pipelineRouter.router)
      }

      const routing = createNamedTransform<
        HttpOperationContext,
        HttpOperationContext
      >(
        (context) => {
          if (!isTerminal(context)) {
            HttpRequestPipelineMetrics.PipelineStageCounter.add(1, {
              stage: stage,
            })
            HttpRequestPipelineMetrics.PipelineStageArrivalTime.record(
              context.operation.started.duration.seconds(),
              { stage: stage },
            )
            const routeInfo = router.lookup({
              path: context.operation.request.path.original,
              method: context.operation.request.method,
            })

            if (routeInfo) {
              context.handler = traceRoute(routeInfo)
              if (routeInfo.parameters) {
                setRoutingParameters(routeInfo.parameters, context)
              }
            }

            return context
          }

          return
        },
        {
          name: "router",
          mode: StreamConcurrencyMode.Parallel,
          onBackpressure: () => {
            HttpRequestPipelineMetrics.PipelineStageBackpressure.add(1, {
              stage: stage,
              name: "router",
            })
          },
        },
      )

      monitorTransform(routing)

      return routing
    }
    case HttpPipelineStage.LOAD_SHEDDING: {
      let current: Optional<Transform>
      for (const source of sources) {
        const shedder = source as HttpPipelineLoadShedder

        const namedPipeline = createNamedTransform(
          (context: HttpOperationContext) => {
            if (!isTerminal(context)) {
              HttpRequestPipelineMetrics.PipelineStageCounter.add(1, {
                stage: stage,
              })
              HttpRequestPipelineMetrics.PipelineStageArrivalTime.record(
                context.operation.started.duration.seconds(),
                { stage: stage },
              )

              return context
            }

            return
          },
          {
            name: shedder.transformName,
            mode: StreamConcurrencyMode.PriorityFixed,
            maxConcurrency: shedder.maxOutstandingRequests,
            onBackpressure: () => {
              HttpRequestPipelineMetrics.PipelineStageBackpressure.add(1, {
                stage: stage,
                name: shedder.transformName,
              })
            },
            priority: {
              ...shedder,
            },
          },
        )

        monitorTransform(namedPipeline)

        if (current !== undefined) {
          current = pipe(current, namedPipeline)
        } else {
          current = namedPipeline
        }
      }

      return current!
    }
  }

  throw new Error(`Stage ${stage} is not yet supported`)
}

/**
 * Contains details about the pipelines that are running
 */
interface PipelineDetails {
  destination: Writable
  transformations: Transformations
  source: Readable
  started: Timestamp
  options: HttpPipelineOptions
}

type Transformations = {
  start: Transform
  end: Transform
}

class DefaultHttpPipeline
  extends EmitterFor<HttpPipelineEvents>
  implements HttpPipeline
{
  private _state: HttpPipelineState
  private readonly _signal: Signal
  private readonly _configuration: HttpPipelineConfiguration
  private _clearing: number = 0

  private _sources: Map<HttpOperationSource, PipelineDetails> = new Map()

  get state(): HttpPipelineState {
    return this._state
  }

  constructor(configuration: HttpPipelineConfiguration) {
    super()

    this._state = HttpPipelineState.PROCESSING
    this._signal = new Signal()
    this._configuration = configuration
  }

  private _createHandlerTransform(defaultHandler: HttpHandler): HttpTransform {
    return async (
      context: HttpOperationContext,
    ): Promise<Optional<HttpOperationContext>> => {
      // Only process if we're not completed and there are no other responses already
      if (!isTerminal(context)) {
        HttpRequestPipelineMetrics.PipelineStageCounter.add(1, {
          stage: "handler",
        })
        HttpRequestPipelineMetrics.PipelineStageArrivalTime.record(
          context.operation.started.duration.seconds(),
          { stage: "handler" },
        )
        try {
          // Either use the context handler or the default
          const handler = context.handler ?? defaultHandler

          // Call the handler
          context.response = await HTTP_OPERATION_CONTEXT_STORE.run(
            context,
            async () => {
              return TracingContext.with(
                Tracing.setSpan(
                  TracingContext.active(),
                  context.operation.span,
                ),
                async () => {
                  return await handler(
                    context.operation.request,
                    context.operation.signal,
                  )
                },
              )
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
            PIPELINE_LOGGER.warn(
              `[${context.operation.request.method}] ${context.operation.request.path.original} didn't read, draining body`,
            )
            await drain(context.operation.request.body.contents)
          }
        }

        return context
      }

      return
    }
  }

  private _buildMiddleware(
    handler: HttpHandler,
    options: HttpPipelineOptions,
  ): Transformations {
    const start = createNamedTransform(
      (context: HttpOperationContext) => {
        HttpRequestPipelineMetrics.PipelineStageCounter.add(1, {
          stage: "dequeue",
        })
        PIPELINE_LOGGER.debug(
          `dequeueing: ${context.operation.request.method} ${context.operation.request.path.original}`,
        )

        context.operation.dequeue()
        return context
      },
      {
        name: "pipeline.dequeue",
        mode: StreamConcurrencyMode.Parallel,
        onBackpressure: () => {
          HttpRequestPipelineMetrics.PipelineStageBackpressure.add(1, {
            stage: "dequeue",
          })
        },
      },
    )

    monitorTransform(start)

    let end = start

    // Add all the stages in order
    for (const stage of [
      HttpPipelineStage.ROUTING,
      HttpPipelineStage.LOAD_SHEDDING,
      HttpPipelineStage.AUTHENTICATION,
      HttpPipelineStage.RATE_LIMITING,
      HttpPipelineStage.AUTHORIZATION,
      HttpPipelineStage.CACHING,
    ]) {
      const transforms = this._configuration.transforms?.filter(
        (t) => t.stage === stage,
      )
      if (transforms && transforms.length > 0) {
        end = pipe(end, createTransform(stage, transforms))
      }
    }

    for (const middleware of this._configuration.middleware ?? []) {
      if (middleware.modifyRequest) {
        const middlewareTransform = createNamedTransform(
          (ctx: HttpOperationContext) => {
            return HTTP_OPERATION_CONTEXT_STORE.run(ctx, async () => {
              try {
                ctx.response = await middleware.modifyRequest!(
                  ctx.operation.request,
                )
              } catch (err) {
                ctx.operation.fail(translateHttpError(err))
              }

              return ctx
            })
          },
          {
            name: middleware.name,
            mode: StreamConcurrencyMode.Parallel, // Run in parallel
            onBackpressure: () => {
              HttpRequestPipelineMetrics.PipelineStageBackpressure.add(1, {
                stage: "middleware.before",
                name: middleware.name,
              })
            },
          },
        )
        monitorTransform(middlewareTransform)

        end = pipe(end, middlewareTransform)
      }
    }

    // Add the handler stage
    const handlerTransform = createNamedTransform(
      this._createHandlerTransform(handler),
      {
        name: "handler",
        mode: StreamConcurrencyMode.FixedConcurrency,
        maxConcurrency: options.maxConcurrency,
        writableHighWaterMark: 1, // Don't let work backlog here
        onBackpressure: () => {
          HttpRequestPipelineMetrics.PipelineStageBackpressure.add(1, {
            stage: "handler",
            name: "handler",
          })
        },
      },
    )

    monitorTransform(handlerTransform)

    end = pipe(end, handlerTransform)

    for (const middleware of this._configuration.middleware ?? []) {
      if (middleware.modifyResponse) {
        const middlewareTransform = createNamedTransform(
          (ctx: HttpOperationContext) => {
            return HTTP_OPERATION_CONTEXT_STORE.run(ctx, async () => {
              try {
                if (ctx.response) {
                  await middleware.modifyResponse!(
                    ctx.operation.request,
                    ctx.response,
                  )
                }
              } catch (err) {
                ctx.operation.fail(translateHttpError(err))
              }

              return ctx
            })
          },
          {
            name: middleware.name,
            mode: StreamConcurrencyMode.Parallel,
            onBackpressure: () => {
              HttpRequestPipelineMetrics.PipelineStageBackpressure.add(1, {
                stage: "middleware.before",
                name: middleware.name,
              })
            },
          },
        )
        monitorTransform(middlewareTransform)

        end = pipe(end, middlewareTransform)
      }
    }

    return { start, end }
  }

  private _buildReadable(
    source: HttpOperationSource,
    options: HttpPipelineOptions,
  ): Readable {
    const controller = new AbortController()

    const readable = Readable.from(
      on(source, "received", { signal: controller.signal }),
      {
        highWaterMark: options.highWaterMark,
        objectMode: true,
        emitClose: true,
        autoDestroy: true,
      },
    )

    source.once("finished", () => {
      // Abort the iteration
      controller.abort()

      // Destroy the readable stream
      readable.destroy()
    })

    const context = createNamedTransform<unknown, HttpOperationContext>(
      (chunk) => {
        return {
          operation: Array.isArray(chunk) ? chunk[0] : chunk,
        }
      },
      {
        mode: StreamConcurrencyMode.Parallel,
        name: "context.builder",
        onBackpressure: () => {
          HttpRequestPipelineMetrics.PipelineStageBackpressure.add(1, {
            stage: "context.builder",
          })
        },
      },
    )

    monitorTransform(context)

    return pipe(readable, context)
  }

  private _buildConsumer(): Writable {
    // const check = this._checkState.bind(this)

    return new Writable({
      objectMode: true,
      emitClose: true,
      autoDestroy: true,
      destroy(error, callback) {
        if (error) {
          PIPELINE_LOGGER.error(`Error during pipeline destroy: ${error}`)
        }

        PIPELINE_LOGGER.info(`Pipeline stream ended`)
        callback()
      },
      writev(chunks, callback) {
        // Pull chunks in bulk to finish them
        for (const chunk of chunks) {
          const ctx = chunk.chunk as HttpOperationContext
          HttpRequestPipelineMetrics.PipelineStageCounter.add(1, {
            stage: "complete",
          })
          HttpRequestPipelineMetrics.PipelineStageArrivalTime.record(
            ctx.operation.started.duration.seconds(),
            { stage: "complete" },
          )
          if (!isTerminal(ctx)) {
            if (ctx.response) {
              ctx.operation.complete(ctx.response)
            } else {
              ctx.operation.fail({
                errorCode: HttpErrorCode.UNKNOWN,
                description: "no response generated",
              })
            }
          }
        }

        callback()
      },
    }).on("error", (err) => {
      PIPELINE_LOGGER.error(`Error during pipeline write: ${err}`, err)
    })
  }

  private _buildPipeline(
    source: HttpOperationSource,
    handler: HttpHandler,
    options: HttpPipelineOptions,
  ): PipelineDetails {
    const details: PipelineDetails = {
      started: Timestamp.now(),
      source: this._buildReadable(source, options),
      transformations: this._buildMiddleware(handler, options),
      destination: this._buildConsumer(),
      options,
    }

    // Link the pipelines
    details.source
      .on("error", (err) => {
        PIPELINE_LOGGER.error(`Error in pipeline source: ${err}`)
      })
      .pipe(details.transformations.start)
    details.transformations.end
      .on("error", (err: unknown) => {
        PIPELINE_LOGGER.error(`Error in pipeline middleware: ${err}`)
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
    const ret = this._sources.delete(source)

    if (details) {
      PIPELINE_LOGGER.info(`Removing source: ${source.id}`)
      this._clearing++

      // Push a null
      details.source.push(null)

      await finished(details.destination, {
        error: true,
        writable: true,
      })

      PIPELINE_LOGGER.info(`Finished source: ${source.id}`)
      this._clearing--
      this._signal.notify()
    }

    return ret
  }

  async stop(): Promise<void> {
    // Allow anything that was waiting to finish
    await this.resume()

    // Mark this as complete
    this._state = HttpPipelineState.COMPLETED

    // Clear the sources
    for (const source of this._sources.keys()) {
      PIPELINE_LOGGER.info(`Removing source: ${source.id}`)
      await this.remove(source)
    }

    while (this._clearing > 0) {
      await this._signal.wait(Duration.ofMilli(100))
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
