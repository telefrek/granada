"use strict";
/**
 * HTTP Server implementation
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultBuilder = void 0;
const api_1 = require("@opentelemetry/api");
const lifecycle_1 = require("@telefrek/core/lifecycle");
const circularBuffer_1 = require("@telefrek/core/structures/circularBuffer");
const events_1 = __importDefault(require("events"));
const http2 = __importStar(require("http2"));
const stream_1 = require("stream");
const _1 = require(".");
const content_1 = require("./content");
/**
 * Default {@link HttpServerBuilder} that utilizes the underlying node `http2` package
 * @returns The default {@link HttpServerBuilder} in the framework
 */
function getDefaultBuilder() {
    return new HttpServerBuilderImpl();
}
exports.getDefaultBuilder = getDefaultBuilder;
/**
 * Default implementation of a {@link HttpServerBuilder}
 */
class HttpServerBuilderImpl {
    options = {
        allowHTTP1: true,
    };
    withTls(details) {
        this.options = {
            ...this.options,
            ...details,
        };
        return this;
    }
    build() {
        return new HttpServerImpl(this.options);
    }
}
/**
 * Default implementation of the {@link HttpServer} using the node `http2` package
 */
class HttpServerImpl extends events_1.default {
    #server;
    #tracer = api_1.trace.getTracer("Granada.HttpServer");
    #sessions = [];
    constructor(options) {
        super();
        stream_1.Stream.Duplex.setMaxListeners(200);
        // TODO: Start looking at options for more configurations.  If no TLS, HTTP 1.1, etc.
        this.#server = http2.createSecureServer(options);
        this.#server.on("session", (session) => {
            this.#sessions.push(session);
            session.once("close", () => {
                const idx = this.#sessions.indexOf(session);
                if (idx >= 0) {
                    this.#sessions.splice(idx, 1);
                }
            });
        });
        // Register the shutdown hook
        (0, lifecycle_1.registerShutdown)(() => this.close());
        // Make sure to map requests
        this.#setupRequestMapping();
    }
    [Symbol.asyncIterator]() {
        // TODO: Make this configurable
        const buffer = new circularBuffer_1.CircularArrayBuffer({ highWaterMark: 256 });
        this.on("request", (request) => {
            // If we can't add to the buffer, need to reject
            if (!buffer.tryAdd(request)) {
                const headers = (0, _1.emptyHeaders)();
                // TODO: Make this configurable...
                headers.set("Retry-After", "60");
                request.respond({
                    status: _1.HttpStatus.SERVICE_UNAVAILABLE,
                    headers,
                });
            }
        });
        return (0, circularBuffer_1.createIterator)(buffer);
    }
    listen(port) {
        if (!this.#server.listening) {
            this.emit("started");
            this.#server.listen(port, "0.0.0.0");
            this.emit("listening", port);
        }
        else {
            throw new Error("Server is already listening on another port");
        }
        return new Promise((resolve) => {
            this.once("finished", resolve);
        });
    }
    close() {
        return new Promise((resolve, reject) => {
            if (this.#server.listening) {
                this.emit("stopping");
                // Close the server to stop accepting new streams
                this.#server.close((err) => {
                    this.emit("finished");
                    if (err) {
                        this.emit("error", err);
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
                // Close all existing streams
                this.#sessions.map((s) => s.close());
            }
            else {
                resolve();
            }
        });
    }
    #setupRequestMapping() {
        this.#server.on("error", (err) => {
            console.error("error...");
            this.emit("error", err);
        });
        this.#server.on("request", (req, resp) => {
            this.emit("request", new Http2Request(req, resp));
        });
    }
}
/**
 * Map between Node and framework http header representations
 *
 * @param incomingHeaders The {@link http2.IncomingHeaders} to parse
 * @returns The mapped {@link HttpHeaders}
 */
function parseHttp2Headers(incomingHeaders) {
    const headers = (0, _1.emptyHeaders)();
    for (const key in incomingHeaders) {
        switch (key) {
            // Keys that we don't need to map explicitly as they are more protocol based
            case http2.constants.HTTP2_HEADER_AUTHORITY:
            case http2.constants.HTTP2_HEADER_METHOD:
            case http2.constants.HTTP2_HEADER_PATH:
            case http2.constants.HTTP2_HEADER_SCHEME:
                break;
            default:
                headers.set(key, incomingHeaders[key]);
                break;
        }
    }
    return headers;
}
let counter = 0;
class Http2Request extends events_1.default {
    path;
    method;
    headers;
    version;
    state;
    query;
    body;
    #status;
    #response;
    #id;
    constructor(request, response) {
        super();
        const { path, query } = (0, _1.parsePath)(request.url);
        this.path = path;
        this.query = query;
        this.state = _1.HttpRequestState.PENDING;
        this.headers = parseHttp2Headers(request.headers);
        this.version = _1.HttpVersion.HTTP_2;
        this.method = request.method.toUpperCase();
        this.body = { contents: request };
        this.#response = response;
        // Ensure we track the response completion event
        (0, stream_1.finished)(response, (_err) => {
            this.emit("finished");
            if (_err) {
                console.log(`error on finish ${JSON.stringify(_err)}`);
            }
        });
        request.setTimeout(5000, () => {
            this.state = _1.HttpRequestState.TIMEOUT;
            this.#response.writeHead(503);
            this.#response.end();
        });
    }
    respond(response) {
        try {
            if (this.#id !== undefined) {
                console.log(`id before inc: ${this.#id}`);
            }
            this.#id = counter++;
            switch (true) {
                case this.state === _1.HttpRequestState.COMPLETED:
                    console.log(`BAD MONKEY!! ${this.#id}  ${JSON.stringify(this.path)}`);
            }
            // We're now writing
            this.state = _1.HttpRequestState.WRITING;
            this.#status = response.status;
            // Verify headers weren't sent
            if (!this.#response.headersSent) {
                // Write the head section
                if (response.body?.mediaType) {
                    this.#response.writeHead(response.status, {
                        "Content-Type": (0, content_1.mediaTypeToString)(response.body.mediaType),
                    });
                }
                else {
                    this.#response.writeHead(response.status);
                }
                // Write the body
                if (response.body?.contents && !this.#response.writableEnded) {
                    (0, stream_1.pipeline)(response.body.contents, this.#response.stream, (err) => {
                        if (err) {
                            console.log(`not good...${JSON.stringify(err)} at ${JSON.stringify(this.path)}`);
                        }
                        this.#response.end();
                        this.state = _1.HttpRequestState.COMPLETED;
                    });
                }
                else {
                    this.#response.end();
                    this.state = _1.HttpRequestState.COMPLETED;
                }
            }
        }
        catch (err) {
            console.trace(`error during response ${JSON.stringify(err)}`);
            if (!this.#response.writableEnded) {
                this.#response.end();
            }
            this.state = _1.HttpRequestState.ERROR;
        }
    }
}
