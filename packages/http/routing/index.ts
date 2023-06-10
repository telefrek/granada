/**
 * Package containing all of the routing information for associating a given path/method combination with a handler
 */

import { HttpBodyContent, HttpHandler, HttpMethod, HttpRequest } from "../core"

/**
 * Custom {@link Error} raised for routing issues
 */
export class RoutingError extends Error {

    constructor(message?: string) {
        super(message)
    }
}

/**
 * The router is responsible for mapping requests to their handlers and extracting information
 * from the given path that should be included in the request
 */
export interface Router {

    /**
     * Lookup the {@link HttpHandler} that can fulfill the provided {@link httpRequest} 
     * 
     * @param request The {@link HttpRequest} to find a handler for
     * 
     * @returns A {@link HttpHandler} associtaed with the request or `undefined`
     */
    lookup<T extends HttpBodyContent = any>(request: HttpRequest<T>) : HttpHandler | undefined

    /**
     * Register the given {@link HttpHandler} with the template and optionally {@link HttpMethod}.
     * 
     * If this path has a collision with another or fails the structural validations this will throw an error
     * 
     * @param template The path (valid URI with optional parameter segment interpolation) to use
     * @param handler The {@link HttpHandler} to associate with this path
     * @param method The optional {@link HttpMethod} to use for this handler (default is for all methods)
     * 
     * @throws A {@link RoutingError} when there is an issue with the template syntax or overlapping routes
     */
    register(template: string, handler: HttpHandler, method?: HttpMethod): void
}

export function createRouter(): Router {
    return new RouterImpl()
}

/**
 * Represents the route handler information for a given request
 */
type RouteHandler = Record<HttpMethod, HttpHandler | undefined>

/**
 * Default {@link Router} implementation that uses a tree structure to hold the mapping information
 */
class RouterImpl implements Router {
    
    lookup<T extends HttpBodyContent = any>(request: HttpRequest<T>): HttpHandler | undefined {
        return undefined
    }

    register(template: string, handler: HttpHandler, method?: HttpMethod): void {
        // verify the template matches
        if(!TEMPLATE_REGEX.test(template)){
            throw new RoutingError("Template is not valid")
        }

        // verify all of the segments are valid
        const segments = template.replace(/^\//, "").replace(/\/$/, "").split("/")
        if(segments.length === 0){
            throw new RoutingError("No valid segments found!")
        }

        for(const segment of segments){
            if(WILDCARD === segment || TERMINATOR === segment ||
                URI_SEGMENT_REGEX.test(segment) || PARAMETER_REGEX.test(segment)){
                continue
            }
            throw new RoutingError(`Invalid segment: ${segment}`)
        }
    }
}

const WILDCARD: string = "*"
const TERMINATOR: string = "**"
const URI_SEGMENT_REGEX: RegExp = /^[a-zA-Z0-9-]+$/
const PARAMETER_REGEX: RegExp = /^\{[a-zA-Z_$][0-9a-zA-Z_$]*\}$/
const TEMPLATE_REGEX: RegExp = /(?:\/(?:[a-zA-Z0-9-]+|\{[a-zA-Z_$][0-9a-zA-Z_$]*\})+)+/

/**
 * Internal enum to track {@link RouteSegment} state information
 */
enum RouteSegmentInfo {
    None = 0x0,
    Terminal = 0x1,
    Wildcard = 0x2,
    Property = 0x4
}

/**
 * Single segment of a route at any point in the tree
 */
class RouteSegment {
    parent?: RouteSegment
    children?: RouteSegment[]
    info: RouteSegmentInfo = RouteSegmentInfo.None
}