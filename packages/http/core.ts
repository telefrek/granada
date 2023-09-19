/**
 * Core package definitions and interfaces
 */

/**
 * Create an error {@link HttpResponse} to return
 * 
 * @param status The optional status code (default is 503)
 * @returns A new {@link HttpResponse} for that error type
 */
export function httpError(status: number = 503): HttpResponse<undefined> {
    return new ErrorResponse(status)
}
/**
 * Create an empty {@link HttpResponse} to return
 * 
 * @returns A new {@link HttpResponse} for no content responses
 */
export function noContent(): HttpResponse<undefined> {
    return new NoContentResponse()
}

/**
 * Supported methods for HTTP operations
 */
export enum HttpMethod {
    GET = "GET",
    PUT = "PUT",
    POST = "POST",
    PATCH = "PATCH",
    DELETE = "DELETE",
    OPTIONS = "OPTIONS"
}

/**
 * Valid {@link HttpMethod} values as an array
 */
export const HTTP_METHODS = <HttpMethod[]>[HttpMethod.GET, HttpMethod.PUT, HttpMethod.POST, HttpMethod.PATCH, HttpMethod.DELETE, HttpMethod.OPTIONS]

/**
 * Supported HTTP Versions
 */
export enum HttpVersion {
    HTTP1_1 = "HTTP1.1",
    HTTP_2 = "HTTP2"
}

/**
 * HttpHeaders are collections of key, value pairs where the value can be singular or an array
 */
export interface HttpHeaders extends Map<string, string | string[]> {
}

/**
 * Create an empty set of {@link HttpHeaders}
 * @returns An empty set of {@link HttpHeaders}
 */
export function emptyHeaders(): HttpHeaders {
    return new Map()
}

/**
 * Helper definition for 
 */
export type HttpBodyProvider<T> = () => Promise<T | T[] | undefined>

/**
 * Default {@link HttpBodyProvider} that returns a rejected promise if called
 * 
 * @returns A failed promise
 */
export const NO_BODY: HttpBodyProvider<any> = () => Promise.reject(new Error("No Body Available"))

/**
 * An interface defining the behavior of an HTTP Request
 */
export interface HttpRequest<T> {
    path: string
    method: HttpMethod
    headers: HttpHeaders
    hasBody: boolean
    parameters?: Map<string, string | string[]>

    /**
     * Get the body of the request
     * 
     * @returns A deferred method for reading the body
     */
    body: HttpBodyProvider<T>

    /**
     * Create a response for the requeset
     * 
     * @param status The status code for the response
     * @param bodyProvider An optional {@link HttpBodyProvider} for the body 
     * 
     * @returns An initialized {@link HttpResponse}
     */
    respond: <U>(status: number, bodyProvider?: HttpBodyProvider<T>) => HttpResponse<U>
}

/**
 * An interface defining the shape of an HTTP Response
 */
export interface HttpResponse<T> {
    status: number
    headers: HttpHeaders
    hasBody: boolean

    /**
     * Get the body of the resonse
     * @returns A deferred method for reading the body
     */
    body: HttpBodyProvider<T>
}


/**
 * Simple type for contracting the async model for an HTTP request/response operation
 */
export type HttpHandler<T, U> = (request: HttpRequest<T>) => Promise<HttpResponse<U>>

/**
 * Simple interface for defining middleware operation
 */
export interface HttpMiddleware {

    /**
     * Get the name of the middleware
     */
    get name(): string

    /**
     * Set the next middleware
     */
    set next(next: HttpMiddleware | undefined)

    /**
     * Handle the request
     * 
     * @param request The {@link httpRequest} being processed
     * @param next The next {@link HttpMiddleware} in the chain if present
     */
    handle: HttpHandler<any | any[] | undefined, any | any[] | undefined>
}

class NoContentResponse implements HttpResponse<undefined> {
    readonly status: number = 204
    readonly headers: HttpHeaders = emptyHeaders()
    readonly hasBody: boolean = false
    readonly body: HttpBodyProvider<any> = NO_BODY
}

/**
 * Internal error response
 */
class ErrorResponse implements HttpResponse<undefined> {
    readonly status: number
    readonly headers: HttpHeaders = emptyHeaders()
    readonly hasBody: boolean = false
    readonly body: HttpBodyProvider<undefined> = NO_BODY

    constructor(status: number) {
        this.status = status
    }
}