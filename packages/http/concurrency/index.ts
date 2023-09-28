/**
 * Handles HTTP extensions for concurrency controls
 */

import { Limiter } from "@telefrek/core/concurrency/limits";
import { HttpMiddleware, HttpRequest, HttpResponse, httpError, noContent } from "../core";

/**
 * Custom {@link HttpMiddleware} that leverages {@link Limiter} objects
 */
export abstract class RateLimitingMiddleware implements HttpMiddleware {

    readonly #name: string
    #next: HttpMiddleware | undefined = undefined

    constructor(name: string) {
        this.#name = name
    }

    get name(): string {
        return this.#name
    }

    set next(next: HttpMiddleware | undefined) {
        this.#next = next
    }

    /**
     * Map the {@link httpRequest} to an optional {@link Limiter} for the object
     * @param request The {@link HttpRequest} being processed
     * 
     * @returns An optional {@link Limiter} that can be used to gate access beyond this middleware
     */
    protected abstract _getLimit(request: HttpRequest<unknown>): Limiter | undefined

    async handle(request: HttpRequest<unknown>): Promise<HttpResponse<unknown>> {

        // Check if we have a limit
        const limit = this._getLimit(request)

        if (limit) {

            // Try to retrieve an operation
            const operation = limit.tryAcquire()

            // Either handle or reject here
            if (operation) {
                if (this.#next) {
                    try {
                        const response = await this.#next.handle(request)
                        operation.success()
                        return response
                    } catch (err: unknown) {
                        // TODO: Check for framework errors that would indicate to throw it away operation.ignore()
                        operation.dropped()
                        throw err
                    }
                } else {
                    // This is highly unexpected...
                    operation.ignore()
                    return noContent()
                }
            }

            // Return an error if we make it here
            return httpError()
        } else if (this.#next) {
            return await this.#next.handle(request)
        } else {
            return noContent()
        }
    }
}