/**
 * The goal of this package is to provide the scaffolding for creating an HTTP pipeline
 */
import { MaybeAwaitable } from "@telefrek/core";
import { Emitter } from "@telefrek/core/events";
import { LifecycleEvents } from "@telefrek/core/lifecycle";
import { TransformFunc } from "@telefrek/core/streams";
import { type HttpRequest } from ".";
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
    /**
     * Fired when the pipeline is paused
     */
    paused: () => void;
    /**
     * Fired when the pipeline resumes processing
     */
    resumed: () => void;
}
/**
 * Explicitly define the stages of a pipeline
 */
export declare enum PipelineStage {
    LOAD_SHEDDING = "loadShedding",
    AUTHENTICATION = "authentication",
    CONTENT_PARSING = "contentParsing",
    MIDDLEWARE = "middleware",
    ROUTING = "routing",
    AUTHORIZATION = "authorization",
    HANDLER = "handler"
}
/**
 * Define a type that has transforms for each stage
 */
export type StagedPipeline = Partial<Record<PipelineStage, HttpPipelineTransform>>;
/**
 * Interface for a pipeline {@link HttpRequest}
 */
export interface PipelineRequest extends HttpRequest {
    /**
     * The current {@link PipelineStage}
     */
    pipelineStage: PipelineStage;
}
/**
 * Represents an abstract pipeline for processing requests
 */
export interface HttpPipeline extends Emitter<HttpPipelineEvents> {
    /**
     * Stops the {@link HttpPipeline} from processing further requests
     */
    stop(): Promise<void>;
}
/**
 * Builder class for creating pipelines using a flow style api
 */
declare class HttpPipelineBuilder {
    #private;
    constructor(source: RequestSource, unhandled?: UnhandledRequestConsumer);
    withContentParsing(transform: HttpPipelineTransform): HttpPipelineBuilder;
    withContentHosting(transform: HttpPipelineTransform): HttpPipelineBuilder;
    withApi(routable: unknown): HttpPipelineBuilder;
    build(): HttpPipeline;
}
/**
 * Simple pipeline transformation
 */
export type HttpPipelineTransform = TransformFunc<HttpRequest, HttpRequest>;
/**
 * We only want an iterable source so we can control the flow of consumption
 */
export type RequestSource = Iterable<HttpRequest> | AsyncIterable<HttpRequest>;
/**
 * Simple method that consumes a {@link HttpRequest} and ensures a response is provided
 *
 * @param request The {@link HttpRequest} to finish
 */
export type UnhandledRequestConsumer = (request: HttpRequest) => MaybeAwaitable<void>;
/**
 * The default {@link UnhandledRequestConsumer} that just returns 404
 *
 * @param request The unhandled {@link HttpRequest}
 * @returns A {@link UnhandledRequestConsumer} that responds as 404
 */
export declare const NOT_FOUND_CONSUMER: UnhandledRequestConsumer;
/**
 *
 * @param source The {@link RequestSource} for the pipeline
 * @param unhandledRequest The optional {@link UnhandledRequestConsumer} (default is {@link NOT_FOUND_CONSUMER})
 * @returns
 */
export declare const createPipeline: (source: RequestSource, unhandledRequest?: UnhandledRequestConsumer) => HttpPipelineBuilder;
export {};
