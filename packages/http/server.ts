/**
 * HTTP Server implementation
 */

import { trace } from "@opentelemetry/api";
import { Emitter } from "@telefrek/core/events";
import { LifecycleEvents, registerShutdown } from "@telefrek/core/lifecycle";
import EventEmitter from "events";
import * as http2 from "http2";

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
   * Fired when there is an error with the underlying {@link HttpServer}
   *
   * @param error The error that was encountered
   */
  error: (error: Error) => void;
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
  listen(port: number): void;

  /**
   * Closes the server, rejecting any further calls
   */
  close(): Promise<void>;
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
    cert: string;
    /** The key path */
    key: string;
    /** The key password */
    passphrase: string;
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
export function getDefaultBuilder(): HttpServerBuilder {
  return new HttpServerBuilderImpl();
}

/**
 * Default implementation of a {@link HttpServerBuilder}
 */
class HttpServerBuilderImpl implements HttpServerBuilder {
  options: http2.SecureServerOptions = {};

  withTls(details: {
    cert: string;
    key: string;
    passphrase: string;
    caFile?: string | undefined;
    mutualAuth?: boolean | undefined;
  }): HttpServerBuilder {
    this.options = {
      ...this.options,
      ...details,
    };

    return this;
  }

  build(): HttpServer {
    return new HttpServerImpl(this.options);
  }
}

/**
 * Default implementation of the {@link HttpServer} using the node `http2` package
 */
class HttpServerImpl extends EventEmitter implements HttpServer {
  #server: http2.Http2Server;
  #tracer = trace.getTracer("Granada.HttpServer");

  constructor(options: http2.SecureServerOptions) {
    super();

    // TODO: Start looking at options for more configurations.  If no TLS, HTTP 1.1, etc.
    this.#server = http2.createServer(options);

    // Register the shutdown hook
    registerShutdown(() => this.close());
  }

  listen(port: number): void {
    if (!this.#server.listening) {
      this.#server.listen(port);
    } else {
      throw new Error("Server is already listening on another port");
    }
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.#server.listening) {
        this.#server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}
