/**
 * HTTP Server implementation
 */

import { LifecycleEvents } from "@telefrek/core/lifecycle"
import EventEmitter from "events"
import * as http2 from "http2"
import { HttpBodyContent, HttpBodyProvider, HttpHeaders, HttpMethod, HttpRequest, HttpResponse, NO_BODY, emptyHeaders } from "./core"
import { Router, createRouter } from "./routing"

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
export interface HttpServer {

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
     * Match all EventEmitter.on functionality
     *
     * @param event The event that was raised
     * @param listener The listener to add
     */
    on<T extends keyof HttpServerEvents>(
        event: T,
        listener: HttpServerEvents[T]
    ): this

    /**
     * Match all EventEmitter.on functionality
     *
     * @param event The event that was raised
     * @param listener The listener to add to the next invocation only
     */
    once<T extends keyof HttpServerEvents>(
        event: T,
        listener: HttpServerEvents[T]
    ): this

    /**
     * Match all EventEmitter.off functionality
     *
     * @param event The event that was raised
     * @param listener The listener to remove
     */
    off<T extends keyof HttpServerEvents>(
        event: T,
        listener: HttpServerEvents[T]
    ): this

    /**
     * Match all EventEmitter.emit functionality
     *
     * @param event The event that was raised
     * @param args  The parameters for the function to invoke
     */
    emit<T extends keyof HttpServerEvents>(
        event: T,
        ...args: Parameters<HttpServerEvents[T]>
    ): boolean
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

    server: http2.Http2Server
    router: Router

    constructor(options: http2.SecureServerOptions, router: Router) {
        super()
        this.router = router

        // TODO: Start looking at options for more configurations.  If no TLS, HTTP 1.1, etc.
        this.server = http2.createServer(options)

        // Hook lifecycle events
        this.server.on('stream', async (stream, headers, _flags) => {
            const request = new Http2Request(stream, headers)

            const handler = router.lookup(request)
            if (handler) {
                try {
                    const response = await handler(request)
                    const headers = <http2.OutgoingHttpHeaders>{
                        ':status': response.status
                    }
                    if (response.hasBody) {
                        headers[http2.constants.HTTP2_HEADER_CONTENT_TYPE] = 'text/html'
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
            }

        })

        // Setup default request handling
    }

    listen(port: number): void {
        this.server.listen(port)
    }

    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.close((err) => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            })
        })
    }
}

class Http2Request<T extends HttpBodyContent> implements HttpRequest<T> {

    private stream: http2.Http2Stream

    path: string
    method: HttpMethod
    headers: HttpHeaders
    hasBody: boolean
    parameters?: Map<string, string | string[]> | undefined
    body: HttpBodyProvider<T>
    respond: <U extends HttpBodyContent>(status: number, bodyProvider?: HttpBodyProvider<U>) => HttpResponse<U>

    constructor(stream: http2.Http2Stream, headers: http2.IncomingHttpHeaders) {
        this.stream = stream
        this.path = <string>headers[http2.constants.HTTP2_HEADER_PATH]
        this.method = <HttpMethod>headers[http2.constants.HTTP2_HEADER_METHOD]
        this.headers = emptyHeaders()

        for (const key in headers) {
            this.headers.set(key, headers[key]!)
        }

        if (!stream.readableEnded) {
            this.hasBody = true
            this.body = () => {
                if (this.stream.closed) {
                    throw new Error("Underlying stream was closed")
                }

                // TODO: Replace this with content type parsing
                return new Promise((resolve, reject) => {

                    let data = ""

                    this.stream.on('data', (chunk) => {
                        if (typeof chunk === "string") {
                            data += chunk
                        } else {
                            data += chunk.toString("utf-8")
                        }
                    }).once('end', () => {
                        try {
                            resolve(JSON.parse(data))
                        } catch (err) {
                            reject(err)
                        }
                    })

                })
            }
        } else {
            this.hasBody = false
            this.body = NO_BODY
        }

        this.respond = (status: number, bodyProvider?: HttpBodyProvider<HttpBodyContent>) => new Http2Response(this.stream, status, bodyProvider)
    }
}

class Http2Response<T extends HttpBodyContent> implements HttpResponse<T> {
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
        this.body = bodyProvider ?? NO_BODY
    }

}