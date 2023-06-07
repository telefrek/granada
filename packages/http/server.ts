/**
 * HTTP Server implementation
 */

import EventEmitter from "events"
import * as http2 from "http2"
import { Router, createRouter } from "./routing"
import { LifecycleEvents } from "@telefrek/core/lifecycle"

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
    }) : HttpServerBuilder

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
export function getDefaultBuilder() : HttpServerBuilder {
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

    constructor(options: http2.SecureServerOptions, router: Router){
        super()


        // TODO: Start looking at options for more configurations.  If no TLS, HTTP 1.1, etc.
        this.server = http2.createServer(options)

        // Hook lifecycle events

        // Setup default request handling
    }

    listen(port: number): void {
        this.server.listen(port)
    }
}