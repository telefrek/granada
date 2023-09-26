/**
 * HTTP Server implementation
 */

import { SpanKind, Tracer, context, trace } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { Emitter } from "@telefrek/core/events";
import { LifecycleEvents, registerShutdown } from "@telefrek/core/lifecycle";
import EventEmitter from "events";
import * as http2 from "http2";
import { HttpBodyProvider, HttpHeaders, HttpMethod, HttpMiddleware, HttpRequest, HttpResponse, NO_BODY, emptyHeaders } from "./core";
import { Router, createRouter, routingMiddleware } from "./routing";
import { Readable } from 'stream';
import { MediaType, parseContents, parseMediaType } from './content';

/**
 * Set of supported events on an {@link HttpServer}
 */
interface HttpServerEvents extends LifecycleEvents {

    /**
     * Fired when the {@link HttpServer} is started
     * 
     * @param port The port that was opened
     */
    listening: (port: number) => void

    /**
     * Fired when there is an error with the underlying {@link HttpServer}
     * 
     * @param error The error that was encountered
     */
    error: (error: Error) => void
}

/**
 * The interface representing an HTTP Server
 */
export interface HttpServer extends Emitter<HttpServerEvents> {

    /**
     * Starts the server accepting connections on the given port
     * 
     * @param port The port to listen on
     */
    listen(port: number): void

    /**
     * Closes the server, rejecting any further calls
     */
    close(): Promise<void>

    /**
     * @returns The current {@link HttpMiddleware} objects
     */
    get middleware(): HttpMiddleware[]

    /**
     * @param middleware The new {@link HttpMiddleware} to use
     */
    set middleware(middleware: HttpMiddleware[])
}

/**
 * Builder style creation for a {@link HttpServer}
 */
export interface HttpServerBuilder {

    /**
     * Add TLS to the server
     * 
     * @param details The details for the certificate locations and allowed usage
     * 
     * @returns An updated builder
     */
    withTls(details: {
        /** The certificate path */
        cert: string,
        /** The key path */
        key: string,
        /** The key password */
        passphrase: string,
        /** The optional CA Chain file */
        caFile?: string,
        /** Flag to indicate if mutual authentication should be used to validate client certificates */
        mutualAuth?: boolean
    }): HttpServerBuilder

    /**
     * Associate the given router to the requests
     * 
     * @param router The {@link Router} to use with reqeusts
     * 
     * @returns An updated builder
     */
    withRouter(router: Router): HttpServerBuilder

    /**
     * Builds a {@link HttpServer} from the parameters given
     * 
     * @returns A fully initialized {@link HttpServer}
     */
    build(): HttpServer
}

/**
 * Default {@link HttpServerBuilder} that utilizes the underlying node `http2` package
 * @returns The default {@link HttpServerBuilder} in the framework
 */
export function getDefaultBuilder(): HttpServerBuilder {
    return new HttpServerBuilderImpl()
}

/**
 * Default implementation of a {@link HttpServerBuilder}
 */
class HttpServerBuilderImpl implements HttpServerBuilder {

    options: http2.SecureServerOptions = {}
    router: Router = createRouter()

    withTls(details: { cert: string; key: string; passphrase: string, caFile?: string | undefined; mutualAuth?: boolean | undefined }): HttpServerBuilder {

        this.options = {
            ...this.options,
            ...details,
        }

        return this
    }

    withRouter(router: Router): HttpServerBuilder {
        this.router = router

        return this
    }

    build(): HttpServer {
        return new HttpServerImpl(this.options, this.router)
    }
}

/**
 * Default implementation of the {@link HttpServer} using the node `http2` package
 */
class HttpServerImpl extends EventEmitter implements HttpServer {

    #server: http2.Http2Server
    #routerMiddleware: HttpMiddleware
    #middleware: HttpMiddleware[] = []
    #tracer = trace.getTracer('Granada.HttpServer')

    constructor(options: http2.SecureServerOptions, router: Router) {
        super()
        this.#routerMiddleware = routingMiddleware(router)
        this.#middleware.push(this.#routerMiddleware)

        // TODO: Start looking at options for more configurations.  If no TLS, HTTP 1.1, etc.
        this.#server = http2.createServer(options)

        // Register the shutdown hook
        registerShutdown(async () => {
            await this.close()
        })

        // Hook lifecycle events
        this.#server.on('stream', async (stream, headers, _flags) => {

            const request = new Http2Request(stream, headers, this.#tracer)

            // Fire middleware chains
            try {
                const response = await this.#middleware[0].handle(request)
                const headers = <http2.OutgoingHttpHeaders>{
                    ':status': response.status
                }
                if (response.hasBody) {
                    headers[http2.constants.HTTP2_HEADER_CONTENT_TYPE] = 'text/html; charset=utf-8'
                    stream.respond(headers)
                    stream.end(await response.body())
                } else {
                    stream.respond(headers, { endStream: true })
                }
            } catch (err) {
                stream.respond({
                    ':status': 503,
                    'content-type': 'text/html; charset=utf-8'
                }, { endStream: true })
            }
        })

        this.#server.on('request', (request, response) => {

        })
    }

    listen(port: number): void {
        if (!this.#server.listening) {
            this.#server.listen(port)
        } else {
            throw new Error('Server is already listening on another port')
        }
    }

    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.#server.listening) {
                this.#server.close((err) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve()
                    }
                })
            } else {
                resolve()
            }
        })
    }

    get middleware(): HttpMiddleware[] {
        return this.#middleware
    }

    set middleware(middleware: HttpMiddleware[]) {
        // Clear the references and their next pointers
        while (this.#middleware.length > 0) {
            this.#middleware.pop()!.next = undefined
        }

        // Make sure we aren't clearing it out
        if (middleware.length > 0) {

            // Push the objects into the array
            for (let n = 1; n < middleware.length; ++n) {

                // Update the pointers and assign
                middleware[n - 1].next = middleware[n]
                this.#middleware.push(middleware[n])
            }

            middleware[middleware.length - 1].next = this.#routerMiddleware
        } else {
            this.#middleware.push(this.#routerMiddleware)
        }
    }
}

class Http2Request<T> implements HttpRequest<T> {

    private stream: http2.ServerHttp2Stream
    private tracer: Tracer

    path: string
    method: HttpMethod
    headers: HttpHeaders
    hasBody: boolean
    parameters?: Map<string, string | string[]> | undefined
    body: HttpBodyProvider<T>
    readable: () => Readable | undefined
    respond: <U>(status: number, bodyProvider?: HttpBodyProvider<U>) => HttpResponse<U>

    constructor(stream: http2.ServerHttp2Stream, headers: http2.IncomingHttpHeaders, tracer: Tracer) {
        this.stream = stream
        this.path = <string>headers[http2.constants.HTTP2_HEADER_PATH]
        this.method = <HttpMethod>headers[http2.constants.HTTP2_HEADER_METHOD]
        this.headers = emptyHeaders()
        this.tracer = tracer
        const addr = stream.session.socket.localAddress
        const remoteAddr = stream.session.socket.remoteAddress
        const remotePort = stream.session.socket.remotePort

        const spanContext = context.active()

        // Create the root span or this operation
        const rootSpan = tracer.startSpan('newStream', {
            kind: SpanKind.SERVER,
            attributes: {
                [SemanticAttributes.HTTP_METHOD]: this.method,
                [SemanticAttributes.NET_PEER_IP]: remoteAddr,
                [SemanticAttributes.NET_PEER_PORT]: remotePort,
                [SemanticAttributes.NET_HOST_IP]: addr,
                [SemanticAttributes.HTTP_FLAVOR]: "2.0"
            },
        }, spanContext)

        for (const key in headers) {
            this.headers.set(key, headers[key]!)
            rootSpan.setAttribute(`http.header.${key}`, headers[key]!)
        }

        let mediaType: MediaType | undefined

        // Check for Conntent-Type
        if (headers['content-type']) {
            mediaType = parseMediaType(headers['content-type'])
        }

        if (!stream.readableEnded && mediaType) {
            this.hasBody = true
            this.body = async () => {
                // Get the previous span
                const previousContext = context.active()
                const previousSpan = trace.getSpan(previousContext)

                try {
                    return await context.with(spanContext, () => {

                        trace.setSpan(spanContext, rootSpan);

                        if (this.stream.closed) {
                            // TODO: Handle errors in trace
                            throw new Error("Underlying stream was closed");
                        }

                        return parseContents<T>(mediaType!, stream)()
                    });
                } finally {
                    // Restore context as needed
                    if (previousContext && previousSpan) {
                        trace.setSpan(previousContext, previousSpan);
                    }

                    rootSpan.end()
                }
            }
        } else {
            this.hasBody = false
            this.body = NO_BODY()
            rootSpan.end()
        }

        this.respond = <U>(status: number, bodyProvider?: HttpBodyProvider<U>) => new Http2Response<U>(this.stream, status, bodyProvider)
        this.readable = () => this.stream.readableEnded ? undefined : this.stream
    }
}

class Http2Response<T> implements HttpResponse<T> {
    private stream: http2.Http2Stream
    status: number
    headers: HttpHeaders
    hasBody: boolean
    body: HttpBodyProvider<T>

    constructor(stream: http2.Http2Stream, status: number, bodyProvider?: HttpBodyProvider<T>) {
        this.stream = stream
        this.status = status
        this.headers = emptyHeaders()
        this.hasBody = bodyProvider !== undefined
        this.body = bodyProvider ?? NO_BODY()
    }

}