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
  type StreamCallback,
  type TransformFunc,
} from "@telefrek/core/streams.js"
import { on } from "events"
import { Readable, Transform, Writable, type TransformOptions } from "stream"
import { translateHttpError } from "./errors.js"
import {
  HttpStatusCode,
  type HttpHandler,
  type HttpOperation,
  type HttpOperationSource,
  type HttpRequest,
  type HttpResponse,
} from "./index.js"
import { emptyHeaders } from "./utils.js"

/**
 * The default {@link Logger} for {@link HttpPipeline} operations
 */
let PIPELINE_LOGGER: Logger = new DefaultLogger({
  name: "http.pipeline",
  level: LogLevel.WARN,
  includeTimestamps: true,
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
export function setPipelineWriter(writer: LogWriter): void {
  PIPELINE_LOGGER = new DefaultLogger({
    name: PIPELINE_LOGGER.name,
    level: PIPELINE_LOGGER.level,
    writer: writer,
    includeTimestamps: true,
  })
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
  remove(source: HttpOperationSource): boolean

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
 * Context for the current {@link HttpOperation} as it moves through a {@link HttpPipeline}
 */
export interface HttpOperationContext {
  stage: HttpPipelineStage
  operation: HttpOperation
  response?: HttpResponse
  handler?: HttpHandler
}

/**
 * A simple type representing a stream transform on a {@link HttpOperation}
 */
export type HttpTransform = TransformFunc<
  HttpOperationContext,
  HttpOperationContext
>

export interface HttpPipelineConfiguration {
  requestTransforms?: HttpTransform[]
  responseTransforms?: HttpTransform[]
  logger?: Logger
}

export function createPipeline(
  configuration: HttpPipelineConfiguration,
): HttpPipeline {
  return new DefaultHttpPipeline(configuration)
}

function createReadable(
  source: HttpOperationSource,
  logger: Logger,
  options?: HttpPipelineOptions,
): Readable {
  return Readable.from(on(source, "received"), {
    highWaterMark: options?.highWaterMark,
    objectMode: true,
    emitClose: true,
    autoDestroy: true,
    destroy(error, callback) {
      if (error) {
        logger.info(`Source pipeline destroyed: ${error}`)
      }

      callback()
    },
  }).pipe(
    new Transform({
      objectMode: true,
      highWaterMark: options?.highWaterMark,
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

function createHandlerTransform(defaultHandler: HttpHandler): HttpTransform {
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
        context.response = await handler(
          context.operation.request,
          context.operation.signal,
        )
      } catch (err) {
        context.operation.fail(translateHttpError(err))
      }
    }

    return context
  }
}

const DEFAULT_TRANSFORM_OPTS = <TransformOptions>{
  objectMode: true,
  allowHalfOpen: false,
  autoDestroy: true,
  emitClose: true,
}

class DefaultHttpPipeline
  extends EmitterFor<HttpPipelineEvents>
  implements HttpPipeline
{
  private _state: HttpPipelineState
  private readonly _signal: Signal
  private readonly _logger: Logger
  private readonly _configuration: HttpPipelineConfiguration

  private _sources: Map<HttpOperationSource, Readable> = new Map()

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

  private _buildPipeline(
    source: HttpOperationSource,
    handler: HttpHandler,
    options?: HttpPipelineOptions,
  ): Readable {
    const logger = this._logger

    const readable = createReadable(source, logger, options)

    // Start building the pipeline stages after dequeueing
    let current = readable.pipe(
      new GenericTransform((context: HttpOperationContext) => {
        logger.debug("dequeueing")
        context.operation.dequeue()
        return context
      }, DEFAULT_TRANSFORM_OPTS),
      { end: true },
    )

    // Check for any request transforms
    if (this._configuration.requestTransforms) {
      for (const transform of this._configuration.requestTransforms) {
        current = current.pipe(
          new GenericTransform(transform, DEFAULT_TRANSFORM_OPTS),
          { end: true },
        )
      }
    }

    // Add the handler stage
    current = current.pipe(
      new GenericTransform(
        createHandlerTransform(handler),
        DEFAULT_TRANSFORM_OPTS,
      ),
      { end: true },
    )

    // Check for any response transforms
    if (this._configuration.responseTransforms) {
      for (const transform of this._configuration.responseTransforms) {
        current = current.pipe(
          new GenericTransform(transform, DEFAULT_TRANSFORM_OPTS),
          { end: true },
        )
      }
    }

    const check = this._checkState.bind(this)

    // Finally set the write
    current
      .pipe(
        new Writable({
          objectMode: true,
          emitClose: true,
          highWaterMark: options?.highWaterMark,
          destroy: (err, callback) => {
            if (err) {
              logger.error(`Error during pipeline causing destroy: ${err}`)
            }
            logger.info(`Closing pipeline`)
            callback()
          },
          write(
            context: HttpOperationContext,
            _: BufferEncoding,
            callback: StreamCallback,
          ) {
            check()
              .catch((err) => {
                logger.error(`Error during pipeline: ${err}`)
              })
              .then(() => {
                context.stage = HttpPipelineStage.COMPLETED
                if (!context.operation.response) {
                  context.operation.complete(
                    context.response ?? {
                      status: {
                        code: HttpStatusCode.NOT_FOUND,
                      },
                      headers: emptyHeaders(),
                    },
                  )
                }
              })
              .finally(() => {
                callback()
              })
          },
        }),
        { end: true },
      )
      .on("finish", () => {
        logger.info(`Finished pipeline!`)
      })

    return readable
  }

  private async _checkState(): Promise<void> {
    if (this._state === HttpPipelineState.PAUSED) {
      await this._signal.wait()
    }
  }

  add(
    source: HttpOperationSource,
    handler: HttpHandler,
    options?: HttpPipelineOptions,
  ): boolean {
    if (this._state !== HttpPipelineState.COMPLETED) {
      let readable = this._sources.get(source)
      if (readable) {
        return false
      }

      // Create the readable
      readable = this._buildPipeline(source, handler, options)
      this._sources.set(source, readable)

      return true
    }

    return false
  }

  remove(source: HttpOperationSource): boolean {
    const readable = this._sources.get(source)
    if (readable) {
      readable.destroy()
    }

    return this._sources.delete(source)
  }

  stop(): MaybeAwaitable<void> {
    // Allow anything that was waiting to finish
    this.resume()

    // Mark this as complete
    this._state = HttpPipelineState.COMPLETED

    // Clear the sources
    for (const source of this._sources.keys()) {
      this.remove(source)
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

export const NOOP_PIPELINE: HttpPipeline = new DefaultHttpPipeline({})

// /** Defines the stage processing order */
// export const PIPELINE_PROCESSING_ORDER = [
//   HttpPipelineStage.AUDITING,
//   HttpPipelineStage.LOAD_SHEDDING,
//   HttpPipelineStage.AUTHENTICATION,
//   HttpPipelineStage.RATE_LIMITING,
//   HttpPipelineStage.CONTENT_PARSING,
//   HttpPipelineStage.MIDDLEWARE,
//   HttpPipelineStage.ROUTING,
//   HttpPipelineStage.AUTHORIZATION,
//   HttpPipelineStage.HANDLER,
// ] as const

// /**
//  * Interface for a pipeline {@link HttpRequest}
//  */
// export interface PipelineRequest extends HttpRequest {
//   /**
//    * The current {@link HttpPipelineStage}
//    */
//   pipelineStage: HttpPipelineStage
// }

// /**
//  * Type guard for {@link PipelineRequest}
//  *
//  * @param request The {@link HttpRequest} to inspect
//  * @returns True if the request is a {@link PipelineRequest}
//  */
// export function isPipelineRequest(
//   request: HttpRequest,
// ): request is PipelineRequest {
//   return "pipelineStage" in request
// }

// /**
//  *
//  * @param source The {@link HttpRequestSource} to build the pipeline from
//  * @returns
//  */
// export function httpPipelineBuilder(
//   source: HttpOperationSource,
// ): HttpPipelineBuilder {
//   return new HttpPipelineBuilder(source)
// }

// export class HttpPipelineBuilder {
//   private _source: HttpOperationSource
//   private _transforms: HttpPipelineTransform[] = []
//   private _unhandled: UnhandledOperationConsumer = NOT_FOUND_CONSUMER
//   private _shedOnPause: boolean = false

//   constructor(source: HttpOperationSource) {
//     this._source = source
//   }

//   /**
//    * Add the api if it is a valid {@link RoutableApi}
//    *
//    * @param api The {@link RoutableApi} to use
//    *
//    * @returns A modified {@link HttpPipelineBuilder}
//    */
//   withApi(api: unknown): HttpPipelineBuilder {
//     if (isRoutableApi(api)) {
//       let router = api.router

//       if (api.prefix) {
//         router = createRouter()
//         router.addRouter(api.prefix, api.router)
//       }

//       this._transforms.push(new RoutingTransform(router))

//       return this
//     }

//     throw new Error("Object is not a routable API")
//   }

//   /**
//    * Add the transforms to the pipeline
//    * @param transforms The set of transforms to include
//    *
//    * @returns A modified {@link HttpPipelineBuilder}
//    */
//   withTransforms(...transforms: HttpPipelineTransform[]): HttpPipelineBuilder {
//     this._transforms.push(...transforms)
//     return this
//   }

//   /**
//    * Remove any transforms for the given stages
//    * @param stages The {@link HttpPipelineStage} to remove
//    *
//    * @returns A modified {@link HttpPipelineBuilder}
//    */
//   withoutStages(...stages: HttpPipelineStage[]): HttpPipelineBuilder {
//     this._transforms = this._transforms.filter((t) => !stages.includes(t.stage))
//     return this
//   }

//   withUnhandledConsumer(
//     unhandled: UnhandledOperationConsumer,
//   ): HttpPipelineBuilder {
//     this._unhandled = unhandled
//     return this
//   }

//   withLoadSheddingOnPause(shedOnPause: boolean): HttpPipelineBuilder {
//     this._shedOnPause = shedOnPause
//     return this
//   }

//   /**
//    * Builds a pipeline from the given stages
//    * @returns A new {@link HttpPipeline}
//    */
//   build(): HttpPipeline {
//     return new DefaultHttpPipeline({
//       source: this._source,
//       transforms: this._transforms,
//       shedOnPause: this._shedOnPause,
//       unhandledRequest: this._unhandled,
//     })
//   }
// }

// export interface HttpPipelineOptions {
//   /** The {@link HttpRequestSource} to process */
//   source: HttpOperationSource
//   /** The {@link HttpPipelineTransform} set to apply */
//   transforms: HttpPipelineTransform[]
//   /** The {@link UnhandledOperationConsumer} that deals with unhandled requests */
//   unhandledRequest?: UnhandledOperationConsumer
//   /** Flag to indicate if load should be shed on pause (default is false) */
//   shedOnPause?: boolean
// }

// export class DefaultHttpPipeline extends EventEmitter implements HttpPipeline {
//   private _abortController: AbortController
//   private _requestStream: Readable
//   private _transform: Optional<Transform>
//   private _consumer: Writable
//   private _shedding: Optional<Writable>
//   private _shedOnPause: boolean
//   private readonly _closedPromise: DeferredPromise = new DeferredPromise()
//   private readonly _buffer: CircularBuffer<HttpOperation>

//   state: HttpPipelineState

//   constructor(options: HttpPipelineOptions) {
//     super()

//     this._buffer = new CircularArrayBuffer({
//       highWaterMark: 16,
//     })

//     const { source, transforms } = options

//     const unhandledRequest: UnhandledOperationConsumer =
//       options.unhandledRequest ?? NOT_FOUND_CONSUMER

//     // Setup the abort controller
//     this._abortController = new AbortController()
//     this._shedOnPause = options.shedOnPause ?? false

//     if (this._shedOnPause) {
//       this._shedding = new Writable({
//         objectMode: true,
//         async write(chunk: HttpOperation, _encoding, callback) {
//           try {
//             if (!chunk.response) {
//               chunk.response = {
//                 status: { code: HttpStatusCode.SERVICE_UNAVAILABLE },
//                 headers: emptyHeaders(),
//               }
//             }
//             callback()
//           } catch (err) {
//             callback(err as Error)
//           }
//         },
//       })
//         .on("close", () => {
//           this._closedPromise.resolve()
//         })
//         .on("finish", () => {
//           this._closedPromise.resolve()
//         })
//         .on("error", (err) => {
//           this._closedPromise.reject(err)
//         })
//     }

//     // Create the stream and hook the error handling
//     this._requestStream = Readable.from(this._buffer, {
//       // autoDestroy: true,
//       objectMode: true,
//       // emitClose: true,
//       signal: this._abortController.signal,
//     })
//       .on("end", () => {
//         PIPELINE_LOGGER.info("End of request stream")
//       })
//       .on("error", (err) => {
//         if (isAbortError(err)) {
//           PIPELINE_LOGGER.info(`Pipeline has been aborted`)
//           // TODO: not sure this is necessary...
//           this._requestStream.emit("end")
//         } else {
//           // Forward the error along
//           PIPELINE_LOGGER.error(
//             `Encountered error during pipeline processing: ${err}`,
//             err,
//           )
//           this.emit("error", err)
//         }
//       })

//     // The consumer needs to handle all requests that make it this far
//     this._consumer = new Writable({
//       objectMode: true,
//       async write(chunk: HttpOperation, _encoding, callback) {
//         try {
//           await unhandledRequest(chunk)
//           callback()
//         } catch (err) {
//           callback(err as Error)
//         }
//       },
//     })
//       .on("close", () => {
//         this._closedPromise.resolve()
//       })
//       .on("finish", () => {
//         this._closedPromise.resolve()
//       })
//       .on("error", (err) => {
//         this._closedPromise.reject(err)
//       })

//     let httpTransform: Optional<HttpTransform>

//     // Start building the stages in order
//     for (const stage of PIPELINE_PROCESSING_ORDER) {
//       for (const stageTransform of transforms.filter(
//         (t) => t.stage === stage,
//       )) {
//         if (httpTransform) {
//           httpTransform = combineTransforms(
//             httpTransform,
//             stageTransform.transform,
//           )
//         } else {
//           httpTransform = stageTransform.transform
//         }
//       }
//     }

//     if (httpTransform) {
//       PIPELINE_LOGGER.info(`Creating transforms!`)
//       // Setup the transform and pipe it through to the consumer
//       this._transform = createTransform(httpTransform)
//       this._transform.pipe(this._consumer, {
//         end: true,
//       })
//     }

//     // Start processing...
//     const target = this._transform ?? this._consumer
//     this._requestStream.pipe(target, {
//       end: true,
//     })

//     source.on("received", async (operation) => {
//       try {
//         if (!(await this._buffer.add(operation))) {
//           operation.fail()
//         }
//       } catch (err) {
//         operation.fail(err)
//       }
//     })

//     this.state = HttpPipelineState.PROCESSING
//   }

//   pause(): MaybeAwaitable<void> {
//     if (this.state !== HttpPipelineState.PROCESSING) {
//       return
//     }

//     // Pause the request stream
//     this._requestStream.pause()

//     // Check if we should shed on pause
//     if (this._shedOnPause && this._shedding) {
//       // Get the original writeable target
//       const target: Writable = this._transform ?? this._consumer

//       this._requestStream.unpipe(target)
//       this._requestStream.pipe(this._shedding) // This should put it back into flowing mode
//     }
//   }

//   resume(): MaybeAwaitable<void> {
//     if (this.state !== HttpPipelineState.PAUSED) {
//       return
//     }

//     // If the stream is paused, resume it
//     if (this._requestStream.isPaused()) {
//       this._requestStream.resume()
//     }

//     if (this._shedOnPause && this._shedding) {
//       // Pause the flow of messages
//       this._requestStream.pause()

//       // Remove the old pipe and start it with the new destination
//       this._requestStream.unpipe(this._shedding)
//       const target: Writable = this._transform ?? this._consumer
//       this._requestStream.pipe(target, {
//         end: true,
//       })

//       if (this._requestStream.isPaused()) {
//         PIPELINE_LOGGER.warn("having to resume pipe after unpause...")
//         this._requestStream.resume()
//       }
//     }
//   }

//   stop(): MaybeAwaitable<void> {
//     // Remove the hook so we can release this object
//     removeShutdown(this.stop.bind(this))

//     if (
//       this.state === HttpPipelineState.COMPLETED ||
//       this._abortController.signal.aborted
//     ) {
//       return
//     } else if (
//       this.state === HttpPipelineState.PAUSED &&
//       this._shedding === undefined
//     ) {
//       // Turn things back on and then stop the flow to get the end events if not
//       // shedding to finish processing of requests
//       this.resume()
//     }

//     // Signal thta we want to be done and return the close event
//     this._abortController.abort("Pipeline stop requested")
//     return this._closedPromise
//   }
// }

// /**
//  * Simple pipeline transformation
//  */
// export interface HttpPipelineTransform {
//   transform: HttpTransform
//   stage: HttpPipelineStage
// }

// /**
//  * Helper class for building {@link HttpPipelineTransform} with correct request
//  * state handling and error tracking
//  */
// export abstract class BaseHttpPipelineTransform
//   implements HttpPipelineTransform
// {
//   readonly stage: HttpPipelineStage
//   protected readonly _logger: Logger

//   constructor(stage: HttpPipelineStage) {
//     this.stage = stage
//     this._logger = PIPELINE_LOGGER
//   }

//   /**
//    * Allows the implementation to process the request further
//    *
//    * @param request The {@link PipelineRequest} to process
//    */
//   protected abstract processRequest(
//     request: PipelineRequest,
//   ): MaybeAwaitable<Optional<HttpResponse>>

//   private static isTerminal(operation: HttpOperation): boolean {
//     switch (operation.state) {
//       case HttpOperationState.ABORTED:
//       case HttpOperationState.COMPLETED:
//       case HttpOperationState.TIMEOUT:
//         return true
//     }

//     return operation.response !== undefined
//   }

//   transform: HttpTransform = async (
//     operation: HttpOperation,
//   ): Promise<Optional<HttpOperation>> => {
//     // We can't process a request that is already completed
//     if (!BaseHttpPipelineTransform.isTerminal(operation)) {
//       // Either inject or apply the current stage
//       if (isPipelineRequest(operation.request)) {
//         operation.request.pipelineStage = this.stage
//       } else {
//         Object.defineProperty(operation.request, "pipelineStage", {
//           value: this.stage,
//           writable: true,
//         })
//       }

//       const timer = Timer.startNew()

//       try {
//         const response = await this.processRequest(
//           operation.request as PipelineRequest,
//         )
//         if (response) {
//           operation.response = response
//         }
//       } catch (err) {
//         // Log the failure
//         this._logger.error(`Error during ${this.stage} - ${err}`, err)

//         // We should complete the request as an error
//         operation.response = {
//           status: {
//             code: HttpStatusCode.INTERNAL_SERVER_ERROR,
//           },
//           headers: emptyHeaders(),
//         }
//       } finally {
//         HttpRequestPipelineMetrics.PipelineStageDuration.record(
//           timer.elapsed().seconds(),
//           {
//             stage: this.stage,
//           },
//         )
//         HttpRequestPipelineMetrics.PipelineExecutions.add(1, {
//           stage: this.stage,
//         })
//       }

//       // Don't pass this along if something happened (timeout, failure in
//       // handler, etc.)
//       if (!operation.response) {
//         return operation
//       }
//     } else {
//       this._logger.info(
//         `Received completed request at stage ${this.stage}: ${operation.request.path.original} (${operation.state})`,
//       )
//     }

//     return
//   }
// }

// export class ContentParsingTransform extends BaseHttpPipelineTransform {
//   constructor() {
//     super(HttpPipelineStage.CONTENT_PARSING)
//   }

//   protected override async processRequest(
//     request: PipelineRequest,
//   ): Promise<Optional<HttpResponse>> {
//     // Process the body if there is an unknown mediaType (i.e. no one beat us to
//     // this)
//     if (request.body && request.body.mediaType === undefined) {
//       // Parse out the media type
//       parseBody(request.headers, request.body)
//     }

//     return
//   }
// }

// export class RoutingTransform extends BaseHttpPipelineTransform {
//   private _router: Router

//   constructor(router: Router) {
//     super(HttpPipelineStage.ROUTING)
//     this._router = router
//   }

//   protected override async processRequest(
//     request: PipelineRequest,
//   ): Promise<Optional<HttpResponse>> {
//     // Try to route it
//     const info = this._router.lookup({
//       path: request.path.original,
//       method: request.method,
//     })

//     if (info) {
//       this._logger.info(
//         `Mapped route to handler => ${request.method} ${request.path.original}`,
//       )

//       // Add the parameter mapping...
//       if (info.parameters) {
//         setRoutingParameters(info.parameters)
//       }

//       await info.handler(request)
//     } else {
//       this._logger.info(
//         `No Route found for ${request.method} ${request.path.original}`,
//       )
//     }
//     return
//   }
// }

// /**
//  * Simple method that consumes a {@link HttpRequest} and ensures a response is provided
//  *
//  * @param operation The {@link HttpOperation} to finish
//  */
// export type UnhandledOperationConsumer = (
//   operation: HttpOperation,
// ) => MaybeAwaitable<void>

// /**
//  * The default {@link UnhandledOperationConsumer} that just returns 404
//  *
//  * @param request The unhandled {@link HttpRequest}
//  * @returns A {@link UnhandledOperationConsumer} that responds as 404
//  */
// export const NOT_FOUND_CONSUMER: UnhandledOperationConsumer = (operation) => {
//   if (!operation.response) {
//     operation.response = {
//       status: { code: HttpStatusCode.NOT_FOUND },
//       headers: emptyHeaders(),
//     }
//   }
// }
