/**
 * The goal of this package is to provide the scaffolding for creating an HTTP pipeline
 */

import { MaybeAwaitable } from "@telefrek/core"
import { Emitter } from "@telefrek/core/events"
import { LifecycleEvents } from "@telefrek/core/lifecycle"
import {
  TransformFunc,
  combineTransforms,
  createTransform,
} from "@telefrek/core/streams"
import EventEmitter from "events"
import { Readable, Writable, pipeline } from "stream"
import { promisify } from "util"
import { HttpStatus, emptyHeaders, type HttpRequest } from "."

/**
 * Set of supported events on an {@link HttpServer}
 */
interface HttpPipelineEvents extends LifecycleEvents {
  /**
   * Fired when there is an error with the underlying {@link HttpServer}
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
}

/**
 * Explicitly define the stages of a pipeline
 */
export enum PipelineStage {
  LOAD_SHEDDING = "loadShedding",
  AUTHENTICATION = "authentication",
  CONTENT_PARSING = "contentParsing",
  MIDDLEWARE = "middleware",
  ROUTING = "routing",
  AUTHORIZATION = "authorization",
  HANDLER = "handler",
}

/**
 * Interface for a pipeline {@link HttpRequest}
 */
export interface PipelineRequest extends HttpRequest {
  /**
   * The current {@link PipelineStage}
   */
  pipelineStage: PipelineStage
}

/**
 * Define a type that has transforms for each stage
 */
export type StagedPipeline = Partial<
  Record<PipelineStage, HttpPipelineTransform>
>

/**
 * Represents an abstract pipeline for processing requests
 */
export interface HttpPipeline extends Emitter<HttpPipelineEvents> {
  paused: boolean
  closed: boolean

  /**
   * Pause processing incoming requests in the {@link HttpPipeline}
   */
  pause(): void

  /**
   * Resume processing of requests in the {@link HttpPipeline}
   */
  resume(): void

  /**
   * Stops the {@link HttpPipeline} from processing further requests
   */
  stop(): Promise<void>
}

/**
 * Simple pipeline transformation
 */
export type HttpPipelineTransform = TransformFunc<HttpRequest, HttpRequest>

export type RequestSource = Iterable<HttpRequest> | AsyncIterable<HttpRequest>

export type UnhandledRequestConsumer = (
  request: HttpRequest,
) => MaybeAwaitable<void>

export const NOT_FOUND_CONSUMER: UnhandledRequestConsumer = (request) =>
  request.respond({ status: HttpStatus.NOT_FOUND, headers: emptyHeaders() })

export function createPipeline(
  source: RequestSource,
  stages: StagedPipeline,
  unhandledRequest: UnhandledRequestConsumer = NOT_FOUND_CONSUMER,
): HttpPipeline {
  return new DefaultPipeline(source, stages, unhandledRequest)
}

class DefaultPipeline extends EventEmitter implements HttpPipeline {
  #reader: Readable
  #abort = new AbortController()
  #pipelineCompletion: Promise<void>

  constructor(
    source: RequestSource,
    stages: StagedPipeline,
    unhandledRequest: UnhandledRequestConsumer,
  ) {
    super()

    this.#reader = Readable.from(source)
    let transform: HttpPipelineTransform | undefined

    // Combine the transforms in order
    for (const key of Object.values(PipelineStage)) {
      if (stages[key]) {
        console.log(`Transform for ${key} loading`)
        transform = transform
          ? combineTransforms(transform, stages[key]!)
          : stages[key]!
      }
    }

    const unhandled = new Writable({
      async write(chunk, _encoding, callback) {
        try {
          await unhandledRequest(chunk as HttpRequest)
          callback()
        } catch (err) {
          callback(err as Error)
        }
      },
    })

    if (transform) {
      this.#pipelineCompletion = promisify(pipeline)(
        this.#reader,
        createTransform(transform),
        unhandled,
        {
          signal: this.#abort.signal,
          end: true,
        },
      )
    } else {
      this.#pipelineCompletion = promisify(pipeline)(
        this.#reader,
        unhandled,
        unhandled,
        {
          signal: this.#abort.signal,
          end: true,
        },
      )
    }
  }

  paused = false
  closed = false

  pause(): void {
    throw new Error("Method not implemented.")
  }

  resume(): void {
    throw new Error("Method not implemented.")
  }

  async stop(): Promise<void> {
    // Emit our stopping event
    this.emit("stopping")
    this.#abort.abort("stop requested")

    try {
      // Wait for the pipeline to complete
      await this.#pipelineCompletion
    } catch (err) {
      // Emit any errors
      this.emit("error", err)
    }

    // Emit our finished event
    this.emit("finished")
  }
}
