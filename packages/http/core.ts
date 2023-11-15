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
  OPTIONS = "OPTIONS",
}

/**
 * Valid {@link HttpMethod} values as an array
 */
export const HTTP_METHODS = [
  HttpMethod.GET,
  HttpMethod.PUT,
  HttpMethod.POST,
  HttpMethod.PATCH,
  HttpMethod.DELETE,
  HttpMethod.OPTIONS,
] as HttpMethod[];

/**
 * Supported HTTP Versions
 */
export enum HttpVersion {
  HTTP1_1 = "HTTP1.1",
  HTTP_2 = "HTTP2",
}

/**
 * HttpHeaders are collections of key, value pairs where the value can be singular or an array
 */
export type HttpHeaders = Map<string, string | string[]>;

/**
 * Create an empty set of {@link HttpHeaders}
 * @returns An empty set of {@link HttpHeaders}
 */
export function emptyHeaders(): HttpHeaders {
  return new Map();
}

/**
 * Helper definition for a method that provides the contents of the http body
 */
export type HttpBodyProvider<T> = () => Promise<T | T[] | undefined>;

/**
 * Default {@link HttpBodyProvider} that returns a rejected promise if called
 *
 * @returns A failed promise
 */
export function NO_BODY<T>(): HttpBodyProvider<T> {
  return () => Promise.reject<T>(new Error("No Body Available"));
}

/**
 * An interface defining the behavior of an HTTP Request
 */
export interface HttpRequest<T> {
  path: string;
  method: HttpMethod;
  headers: HttpHeaders;
  hasBody: boolean;
  parameters?: Map<string, string | string[]>;

  /**
   * Get the body of the request
   *
   * @returns A deferred method for reading the body
   */
  body: HttpBodyProvider<T>;
}

/**
 * An interface defining the shape of an HTTP Response
 */
export interface HttpResponse<T> {
  status: number;
  headers: HttpHeaders;
  hasBody: boolean;

  /**
   * Get the body of the resonse
   * @returns A deferred method for reading the body
   */
  body: HttpBodyProvider<T>;

  /**
   * Method that should be called when the system is done modifying the response and it's ready to send
   */
  finish: () => void;
}

/**
 * Simple type for contracting the async model for an HTTP request/response operation
 */
export type HttpHandler<T, U> = (
  request: HttpRequest<T>
) => Promise<HttpResponse<U>>;
