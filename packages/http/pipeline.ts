/**
 * The goal of this package is to provide the scaffolding for creating an HTTP pipeline
 */

import {
  Limiter,
  createSimpleLimiter,
} from "@telefrek/core/concurrency/limits";
import { vegasBuilder } from "@telefrek/core/concurrency/limits/algorithms";
import { Emitter } from "@telefrek/core/events";
import { LifecycleEvents } from "@telefrek/core/lifecycle";
import { EventEmitter } from "stream";
import { HttpRequest, HttpStatus, emptyHeaders } from ".";
import { HttpServer } from "./server";

/**
 * Set of supported events on an {@link HttpServer}
 */
interface HttpPipelineEvents extends LifecycleEvents {
  /**
   * Fired when there is an error with the underlying {@link HttpServer}
   *
   * @param error The error that was encountered
   */
  error: (error: unknown) => void;
}

/**
 * Represents an abstract pipeline for processing requests
 */
export type HttpPipeline = Emitter<HttpPipelineEvents>;

/**
 * Simple pipeline transformation
 */
export type HttpPipelineTransform = (
  requests: ReadableStream<HttpRequest>
) => ReadableStream<HttpRequest>;

/**
 * Represents an object capable of building an {@link HttpPipeline}
 */
export interface HttpPipelineBuilder {
  /**
   * Adds a transform
   *
   * @param transform The {@link HttpPipelineTransform} to add
   */
  addTransform(transform: HttpPipelineTransform): HttpPipelineBuilder;

  /**
   * Builds an {@link HttpPipeline}
   */
  build(): HttpPipeline;
}

export function createDefaultPipelineBuilder(
  server: HttpServer
): HttpPipelineBuilder {
  return new DefaultPipelineBuilder(server);
}

class DefaultPipelineBuilder implements HttpPipelineBuilder {
  readonly #server: HttpServer;
  readonly #transforms: HttpPipelineTransform[] = [];

  constructor(server: HttpServer) {
    this.#server = server;
  }

  addTransform(transform: HttpPipelineTransform): HttpPipelineBuilder {
    this.#transforms.push(transform);
    return this;
  }

  build(): HttpPipeline {
    // Start the chain
    let readable = new ReadableStream<HttpRequest>({
      start: (controller: ReadableStreamDefaultController) => {
        console.log("starting request pump");
        this.#server.on("request", (request) => {
          controller.enqueue(request);
        });
      },
    });

    // Demo some throttling
    // eslint-disable-next-line no-constant-condition
    if (true) {
      readable = readable.pipeThrough(
        new ThrottlingTransform(
          createSimpleLimiter(
            vegasBuilder(10)
              .build()
              .on("changed", (l) => {
                console.log(`new limit: ${l}`);
              }),
            10
          ),
          250
        )
      );
    }

    // Apply the transformations
    for (const transform of this.#transforms) {
      readable = transform(readable);
    }

    // Return the pipeline that will run it all
    return new DefaultPipeline(readable);
  }
}

/**
 * Transform requested items to the given path
 */
class ThrottlingTransform extends TransformStream<HttpRequest, HttpRequest> {
  #limit: Limiter;

  /**
   * Create the {@link PathTransform} for the given directory
   * @param baseDir The base directory to serve from
   */
  constructor(limit: Limiter, timeoutMs = 100) {
    super({
      transform: (request, controller) => {
        const l = limit.tryAcquire();
        if (l) {
          const start = process.hrtime.bigint();
          request.on("finished", () => {
            const end = process.hrtime.bigint() - start;
            if (end / 1000000n > timeoutMs) {
              l.dropped();
              console.log("dropped due to exceeding timeout");
            } else {
              l.success();
            }
          });
          controller.enqueue(request);
        } else {
          console.log(`failed to get... ${limit.limit}`);
          // Load shedding...
          request.respond({
            status: HttpStatus.SERVICE_UNAVAILABLE,
            headers: emptyHeaders(),
          });
        }
      },
    });

    this.#limit = limit;
  }
}

class DefaultPipeline extends EventEmitter implements HttpPipeline {
  #requestStream: ReadableStream<HttpRequest>;
  #unhandledRequestWriter: WritableStream<HttpRequest>;

  constructor(requestStream: ReadableStream<HttpRequest>) {
    super();
    this.#requestStream = requestStream;
    this.#unhandledRequestWriter = new WritableStream({
      write: (
        request: HttpRequest,
        _controller: WritableStreamDefaultController
      ) => {
        request.respond({
          status: HttpStatus.NOT_FOUND,
          headers: emptyHeaders(),
        });
      },
    });

    setImmediate(() => void this.#processRequests());
  }

  /**
   * Process the requests and handle any errors or unhandled requests
   */
  async #processRequests(): Promise<void> {
    this.emit("started");
    await this.#requestStream
      .pipeTo(this.#unhandledRequestWriter, {})
      .catch((err) => this.emit("error", err))
      .finally(() => this.emit("finished"));
  }
}
