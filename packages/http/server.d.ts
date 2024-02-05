/**
 * HTTP Server implementation
 */
/// <reference types="node" />
import { Emitter } from "@telefrek/core/events";
import { LifecycleEvents } from "@telefrek/core/lifecycle";
import { HttpRequest } from ".";
/**
 * Set of supported events on an {@link HttpServer}
 */
interface HttpServerEvents extends LifecycleEvents {
    /**
     * Fired when the {@link HttpServer} is started
     *
     * @param port The port that was opened
     */
    listening: (port: number) => void;
    /**
     * Fired when a new {@link HttpRequest} is received
     *
     * @param request The {@link HttpRequest} that was received
     */
    request: (request: HttpRequest) => void;
    /**
     * Fired when there is an error with the underlying {@link HttpServer}
     *
     * @param error The error that was encountered
     */
    error: (error: unknown) => void;
}
/**
 * The interface representing an HTTP Server
 */
export interface HttpServer extends Emitter<HttpServerEvents> {
    /**
     * Starts the server accepting connections on the given port
     *
     * @param port The port to listen on
     *
     * @returns A promise to optionally use for tracking listening
     */
    listen(port: number): Promise<void>;
    /**
     * Closes the server, rejecting any further calls
     */
    close(): Promise<void>;
    /**
     * Allow iterating over the {@link HttpRequest} that are received
     */
    [Symbol.asyncIterator](): AsyncIterator<HttpRequest>;
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
        cert: string | Buffer;
        /** The key path */
        key: string | Buffer;
        /** The key password */
        passphrase?: string;
        /** The optional CA Chain file */
        caFile?: string;
        /** Flag to indicate if mutual authentication should be used to validate client certificates */
        mutualAuth?: boolean;
    }): HttpServerBuilder;
    /**
     * Builds a {@link HttpServer} from the parameters given
     *
     * @returns A fully initialized {@link HttpServer}
     */
    build(): HttpServer;
}
/**
 * Default {@link HttpServerBuilder} that utilizes the underlying node `http2` package
 * @returns The default {@link HttpServerBuilder} in the framework
 */
export declare function getDefaultBuilder(): HttpServerBuilder;
export {};
