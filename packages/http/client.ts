/**
 * HTTP Client
 */

import type { LifecycleEvents } from "@telefrek/core/lifecycle.js"
import type { HttpRequest, HttpResponse } from "./index.js"

/**
 * Set of supported events on an {@link HttpServer}
 */
interface HttpClientEvents extends LifecycleEvents {
  /**
   * Fired when there is an error with the underlying {@link HttpServer}
   *
   * @param error The error that was encountered
   */
  error: (error: unknown) => void
}

export interface HttpClient extends HttpClientEvents {
  /**
   * Sends a {@link HttpRequest} through the client
   *
   * @param request The {@link HttpRequest} to send
   *
   * @returns A {@link Promise} with the {@link HttpResponse}
   */
  send(request: HttpRequest): Promise<HttpResponse>
}
