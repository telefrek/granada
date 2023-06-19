/**
 * Core package definitions and interfaces
 */

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
 * Represents valid body shapes
 */
export type HttpBodyContent = any | any[] | undefined

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
export type HttpBodyProvider<T extends HttpBodyContent> = () => Promise<T>

/**
 * Default {@link HttpBodyProvider} that returns a rejected promise if called
 * 
 * @returns A failed promise
 */
export const NO_BODY: HttpBodyProvider<HttpBodyContent> = () => Promise.reject(new Error("No Body Available"))

/**
 * An interface defining the behavior of an HTTP Request
 */
export interface HttpRequest<T extends HttpBodyContent> {
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
    respond: <U extends HttpBodyContent>(status: number, bodyProvider?: HttpBodyProvider<U>) => HttpResponse<U>
}

/**
 * An interface defining the shape of an HTTP Response
 */
export interface HttpResponse<T extends HttpBodyContent> {
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
export type HttpHandler = (request: HttpRequest<HttpBodyContent>) => Promise<HttpResponse<HttpBodyContent>>