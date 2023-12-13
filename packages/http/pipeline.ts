/**
 * The goal of this package is to provide the scaffolding for creating an HTTP pipeline
 */

import { Emitter } from "@telefrek/core/events"
import { LifecycleEvents } from "@telefrek/core/lifecycle"
import type { HttpRequest } from "."

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
 * Combine two {@link HttpPipelineTransform} together
 *
 * @param left The first {@link HttpPipelineTransform} to run
 * @param right seocond {@link HttpPipelineTransform} to run
 * @returns A new {@link HttpPipelineTransform} that combines the two inputs
 */
export function combine(
  left: HttpPipelineTransform,
  right: HttpPipelineTransform,
): HttpPipelineTransform {
  return (readable: ReadableStream<HttpRequest>) => {
    return right(left(readable))
  }
}

/**
 * Represents an abstract pipeline for processing requests
 */
export interface HttpPipeline extends Emitter<HttpPipelineEvents> {
  /**
   * Stops the pipeline from processing further requests
   */
  stop(): void
}

/**
 * Simple pipeline transformation
 */
export type HttpPipelineTransform = (
  requests: ReadableStream<HttpRequest>,
) => ReadableStream<HttpRequest>

export function createPipeline(
  source: ReadableStream,
  stages: StagedPipeline,
): HttpPipeline {
  return new DefaultPipeline(source, stages)
}

class DefaultPipeline extends EventEmitter implements HttpPipeline {
  #pipeline: ReadableStream<HttpRequest> | undefined

  constructor(source: ReadableStream<HttpRequest>, stages: StagedPipeline) {
    super()

    const test = Readable.fromWeb(source)
  }

  stop(): void {
    throw new Error("Method not implemented.")
  }
}
