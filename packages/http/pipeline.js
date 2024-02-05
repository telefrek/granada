"use strict";
/**
 * The goal of this package is to provide the scaffolding for creating an HTTP pipeline
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPipeline = exports.NOT_FOUND_CONSUMER = exports.PipelineStage = void 0;
const streams_1 = require("@telefrek/core/streams");
const events_1 = __importDefault(require("events"));
const stream_1 = require("stream");
const util_1 = require("util");
const _1 = require(".");
const routing_1 = require("./routing");
/**
 * Explicitly define the stages of a pipeline
 */
var PipelineStage;
(function (PipelineStage) {
    PipelineStage["LOAD_SHEDDING"] = "loadShedding";
    PipelineStage["AUTHENTICATION"] = "authentication";
    PipelineStage["CONTENT_PARSING"] = "contentParsing";
    PipelineStage["MIDDLEWARE"] = "middleware";
    PipelineStage["ROUTING"] = "routing";
    PipelineStage["AUTHORIZATION"] = "authorization";
    PipelineStage["HANDLER"] = "handler";
})(PipelineStage || (exports.PipelineStage = PipelineStage = {}));
/**
 * Builder class for creating pipelines using a flow style api
 */
class HttpPipelineBuilder {
    #source;
    #unhandled;
    #routing = {};
    #pipeline = {};
    constructor(source, unhandled = exports.NOT_FOUND_CONSUMER) {
        this.#source = source;
        this.#unhandled = unhandled;
    }
    withContentParsing(transform) {
        // Already defined, this is meant to be singular
        // TODO: Create the types to handle combined vs singular per stage so it's easy to see
        if (this.#pipeline.contentParsing) {
            throw new Error("ContentParsing is already specified");
        }
        this.#pipeline.contentParsing = transform;
        return this;
    }
    withContentHosting(transform) {
        this.#routing.hosting = this.#routing.hosting
            ? (0, streams_1.combineTransforms)(this.#routing.hosting, transform)
            : transform;
        return this;
    }
    withApi(routable) {
        if ((0, routing_1.isRoutableApi)(routable)) {
            // Ensure it exists
            if (this.#routing.apiRouting === undefined) {
                this.#routing.apiRouting = (0, routing_1.createRouter)();
            }
            this.#routing.apiRouting.addRouter(routable.prefix ?? "/", routable.router);
        }
        return this;
    }
    build() {
        // Build the routing
        let route = this.#routing.apiRouting
            ? routeTransform(this.#routing.apiRouting)
            : undefined;
        if (route) {
            route = this.#routing.hosting
                ? (0, streams_1.combineTransforms)(route, this.#routing.hosting)
                : route;
        }
        else {
            route = this.#routing.hosting;
        }
        this.#pipeline.routing = route;
        return new DefaultPipeline(this.#source, this.#pipeline, this.#unhandled);
    }
}
function routeTransform(router) {
    return async (request) => {
        const info = router.lookup({
            path: request.path.original,
            method: request.method,
        });
        if (info) {
            // Add the parameter mapping...
            request.path.parameters = info.parameters;
            await info.handler(request);
        }
        else {
            return request;
        }
    };
}
/**
 * The default {@link UnhandledRequestConsumer} that just returns 404
 *
 * @param request The unhandled {@link HttpRequest}
 * @returns A {@link UnhandledRequestConsumer} that responds as 404
 */
const NOT_FOUND_CONSUMER = (request) => request.respond({ status: _1.HttpStatus.NOT_FOUND, headers: (0, _1.emptyHeaders)() });
exports.NOT_FOUND_CONSUMER = NOT_FOUND_CONSUMER;
/**
 *
 * @param source The {@link RequestSource} for the pipeline
 * @param unhandledRequest The optional {@link UnhandledRequestConsumer} (default is {@link NOT_FOUND_CONSUMER})
 * @returns
 */
const createPipeline = (source, unhandledRequest = exports.NOT_FOUND_CONSUMER) => new HttpPipelineBuilder(source, unhandledRequest);
exports.createPipeline = createPipeline;
class DefaultPipeline extends events_1.default {
    #reader;
    #abort = new AbortController();
    #pipelineCompletion;
    constructor(source, stages, unhandledRequest) {
        super();
        this.#reader = stream_1.Readable.from(source);
        let transform;
        // Combine the transforms in order
        for (const key of Object.values(PipelineStage)) {
            if (stages[key] !== undefined) {
                transform =
                    transform !== undefined
                        ? (0, streams_1.combineTransforms)(transform, stages[key])
                        : stages[key];
            }
        }
        const unhandled = new stream_1.Writable({
            async write(chunk, _encoding, callback) {
                console.log("unhandled handler executing");
                try {
                    await unhandledRequest(chunk);
                    callback();
                }
                catch (err) {
                    callback(err);
                }
            },
        });
        if (transform) {
            this.#pipelineCompletion = (0, util_1.promisify)(stream_1.pipeline)(this.#reader.on("error", (err) => this.emit("error", err)), (0, streams_1.createTransform)(transform).once("error", (err) => this.emit("error", err)), unhandled, {
                signal: this.#abort.signal,
                end: true,
            });
        }
        else {
            this.#pipelineCompletion = (0, util_1.promisify)(stream_1.pipeline)(this.#reader, unhandled, {
                signal: this.#abort.signal,
                end: true,
            });
        }
    }
    async stop() {
        // Emit our stopping event
        this.emit("stopping");
        this.#abort.abort("stop requested");
        try {
            // Wait for the pipeline to complete
            await this.#pipelineCompletion;
        }
        catch (err) {
            // Emit any errors
            this.emit("error", err);
        }
        // Emit our finished event
        this.emit("finished");
    }
}
