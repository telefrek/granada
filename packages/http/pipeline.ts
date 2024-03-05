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
import { Router, createRouter, isRoutableApi } from "./routing"

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
 * Define a type that has transforms for each stage
 */
export type StagedPipeline = Partial<
  Record<PipelineStage, HttpPipelineTransform>
>

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
 * Represents an abstract pipeline for processing requests
 */
export interface HttpPipeline extends Emitter<HttpPipelineEvents> {
  /**
   * Stops the {@link HttpPipeline} from processing further requests
   */
  stop(): Promise<void>
}

interface RoutingLayer {
  apiRouting?: Router
  hosting?: HttpPipelineTransform
}

/**
 * Builder class for creating pipelines using a flow style api
 */
class HttpPipelineBuilder {
  readonly #source: RequestSource
  readonly #unhandled: UnhandledRequestConsumer
  readonly #routing: RoutingLayer = {}
  readonly #pipeline: StagedPipeline = {}

  constructor(
    source: RequestSource,
    unhandled: UnhandledRequestConsumer = NOT_FOUND_CONSUMER,
  ) {
    this.#source = source
    this.#unhandled = unhandled
  }

  withContentParsing(transform: HttpPipelineTransform): HttpPipelineBuilder {
    // Already defined, this is meant to be singular
    // TODO: Create the types to handle combined vs singular per stage so it's easy to see
    if (this.#pipeline.contentParsing) {
      throw new Error("ContentParsing is already specified")
    }

    this.#pipeline.contentParsing = transform
    return this
  }

  withContentHosting(transform: HttpPipelineTransform): HttpPipelineBuilder {
    this.#routing.hosting = this.#routing.hosting
      ? combineTransforms(this.#routing.hosting, transform)
      : transform
    return this
  }

  withApi(routable: unknown): HttpPipelineBuilder {
    if (isRoutableApi(routable)) {
      // Ensure it exists
      if (this.#routing.apiRouting === undefined) {
        this.#routing.apiRouting = createRouter()
      }

      this.#routing.apiRouting.addRouter(
        routable.prefix ?? "/",
        routable.router,
      )
    }

    return this
  }

  build(): HttpPipeline {
    // Build the routing
    let route = this.#routing.apiRouting
      ? routeTransform(this.#routing.apiRouting)
      : undefined

    if (route) {
      route = this.#routing.hosting
        ? combineTransforms(route, this.#routing.hosting)
        : route
    } else {
      route = this.#routing.hosting
    }

    this.#pipeline.routing = route

    return new DefaultPipeline(this.#source, this.#pipeline, this.#unhandled)
  }
}

function routeTransform(router: Router): HttpPipelineTransform {
  return async (request: HttpRequest): Promise<HttpRequest | undefined> => {
    const info = router.lookup({
      path: request.path.original,
      method: request.method,
    })

    if (info) {
      // Add the parameter mapping...
      request.path.parameters = info.parameters

      await info.handler(request)
    } else {
      return request
    }
  }
}

/**
 * Simple pipeline transformation
 */
export type HttpPipelineTransform = TransformFunc<HttpRequest, HttpRequest>

/**
 * We only want an iterable source so we can control the flow of consumption
 */
export type RequestSource = Iterable<HttpRequest> | AsyncIterable<HttpRequest>

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
export const NOT_FOUND_CONSUMER: UnhandledRequestConsumer = (request) =>
  request.respond({ status: HttpStatus.NOT_FOUND, headers: emptyHeaders() })

/**
 *
 * @param source The {@link RequestSource} for the pipeline
 * @param unhandledRequest The optional {@link UnhandledRequestConsumer} (default is {@link NOT_FOUND_CONSUMER})
 * @returns
 */
export const createPipeline = (
  source: RequestSource,
  unhandledRequest: UnhandledRequestConsumer = NOT_FOUND_CONSUMER,
): HttpPipelineBuilder => new HttpPipelineBuilder(source, unhandledRequest)

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
      if (stages[key] !== undefined) {
        transform =
          transform !== undefined
            ? combineTransforms(transform, stages[key]!)
            : stages[key]
      }
    }

    const unhandled = new Writable({
      async write(chunk, _encoding, callback) {
        console.log("unhandled handler executing")
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
        this.#reader.on("error", (err) => this.emit("error", err)),

        createTransform(transform).once("error", (err) =>
          this.emit("error", err),
        ),
        unhandled,
        {
          signal: this.#abort.signal,
          end: true,
        },
      )
    } else {
      this.#pipelineCompletion = promisify(pipeline)(this.#reader, unhandled, {
        signal: this.#abort.signal,
        end: true,
      })
    }
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
