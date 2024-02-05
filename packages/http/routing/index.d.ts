/**
 * Package containing all of the routing information for associating a given path/method combination with a handler
 */
import { HttpHandler, HttpMethod, SegmentValue } from "..";
/**
 * Custom {@link Error} raised for routing issues
 */
export declare class RoutingError extends Error {
    constructor(message?: string);
}
/**
 * Indicates a {@link Router} that has a prefix for service hosting
 */
export interface RoutableApi {
    router: Router;
    prefix?: string;
}
/**
 * Type guard for finding {@link RoutableApi}
 *
 * @param routable The object to inspect
 * @returns True if this is a {@link RoutableApi}
 */
export declare function isRoutableApi(routable: unknown): routable is RoutableApi;
/**
 * Represents the information about the route found
 */
export interface RouteInfo {
    /** Any parameters that were retrieved */
    parameters?: Map<string, SegmentValue>;
    /** The handler to invoke */
    handler: HttpHandler;
}
/**
 * Represents a request for a lookup
 */
export interface LookupRequest {
    path: string;
    method: HttpMethod;
}
/**
 * The router is responsible for mapping requests to their handlers and extracting information
 * from the given path that should be included in the request
 */
export interface Router {
    /**
     * Lookup the {@link RouteInfo} that can fulfill the provided {@link LookupRequest}
     *
     * @param request The {@link LookupRequest} to find a handler for
     *
     * @returns A {@link RouteInfo} object that best matches the {@link LookupRequest} if found
     */
    lookup(request: LookupRequest): RouteInfo | undefined;
    /**
     * Register the given {@link HttpHandler} with the template and optionally {@link HttpMethod}.
     *
     * If this path has a collision with another or fails the structural validations this will throw an error
     *
     * @param template The path this handler resolves
     * @param handler The {@link HttpHandler} to associate with this path/method
     * @param method The optional {@link HttpMethod} to use for this handler (default is all methods)
     *
     * @throws A {@link RoutingError} when there is an issue with the template syntax or overlapping routes
     */
    addHandler(template: string, handler: HttpHandler, method?: HttpMethod): void;
    /**
     *
     * Register the given {@link Router} with the template
     *
     * If this path has a collision with another or fails the structural validations this will throw an error
     *
     * @param template The path this router resolves
     * @param router The {@link Router} to offload requests to at this position
     */
    addRouter(template: string, router: Router): void;
}
/**
 * Create a new router
 *
 * @returns A newly initialized {@link Router}
 */
export declare function createRouter(): Router;
