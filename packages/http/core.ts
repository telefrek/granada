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
export function emptyHeaders() : HttpHeaders {
    return new Map()
}

/**
 * An interface defining the behavior of an HTTP Request
 */
export interface HttpRequest<T extends HttpBodyContent = any> {
    path: string,
    method: HttpMethod,
    headers: HttpHeaders,
    hasBody: boolean

    /**
     * Get the body of the request
     * @returns A deferred method for reading the body
     */
    body: () => Promise<T>
}

/**
 * An interface defining the shape of an HTTP Response
 */
export interface HttpResponse<T extends HttpBodyContent = any> {
    status: number,
    headers: HttpHeaders,
    hasBody: boolean

    /**
     * Get the body of the resonse
     * @returns A deferred method for reading the body
     */
    body: ()=>Promise<T>
}

/**
 * Simple type for contracting the async model for an HTTP request/response operation
 */
export type HttpHandler = <T extends HttpBodyContent = any, U extends HttpBodyContent = any>(request: HttpRequest<T>) => Promise<HttpResponse<U>>