/**
 * Package containing all of the routing information for associating a given path/method combination with a handler
 */

import { HTTP_METHODS, HttpBodyContent, HttpHandler, HttpMethod, HttpRequest } from "../core"

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
    lookup<T extends HttpBodyContent = any>(request: HttpRequest<T>): HttpHandler | undefined

    /**
     * Register the given {@link HttpHandler} with the template and optionally {@link HttpMethod}.
     * 
     * If this path has a collision with another or fails the structural validations this will throw an error
     * 
     * @param template The path (valid URI with optional parameter segment interpolation) to use
     * @param handler The {@link HttpHandler} to associate with this path
     * @param method The optional {@link HttpMethod} to use for this handler (default is all undefined methods)
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

    private root: RouteSegment = new RouteSegment()

    lookup<T extends HttpBodyContent = any>(request: HttpRequest<T>): HttpHandler | undefined {
        const segments = request.path.replace(/^\//, "").replace(/\/$/, "").split("/")
        if (segments.length > 0) {
            let current = this.root
            for (const segment of segments) {
                if (current.children !== undefined) {
                    let match: boolean = false
                    for (const child of current.children) {
                        if (child.info & RouteSegmentInfo.Terminal) {
                            return child.handlers[request.method]
                        } else if (child.info & RouteSegmentInfo.Wildcard) {
                            current = child
                        } else if (child.info & RouteSegmentInfo.Parameter) {
                            current = child
                            if (request.parameters === undefined) {
                                request.parameters = new Map()
                            }
                            const parameterName = child.parameter!
                            if (request.parameters.has(parameterName)) {
                                const v = request.parameters.get(parameterName)!
                                if (Array.isArray(v)) {
                                    v.push(segment)
                                } else {
                                    request.parameters.set(parameterName, [v, segment])
                                }
                            } else {
                                request.parameters.set(parameterName, segment)
                            }
                        } else if (segment === child.segment) {
                            current = child
                        }
                    }

                    if (!match) {
                        return
                    }
                } else {
                    return
                }
            }

            return current.handlers[request.method]
        }
    }

    register(template: string, handler: HttpHandler, method?: HttpMethod): void {
        // verify the template matches
        if (!TEMPLATE_REGEX.test(template)) {
            throw new RoutingError("Template is not valid")
        }

        // verify all of the segments are valid
        const segments = template.replace(/^\//, "").replace(/\/$/, "").split("/")
        if (segments.length === 0) {
            throw new RoutingError("No valid segments found!")
        }

        // Check the segments for valid contents
        const l = segments.length
        for (let n = 0; n < l; ++n) {
            const segment = segments[n]
            if (WILDCARD === segment ||
                URI_SEGMENT_REGEX.test(segment) || PARAMETER_REGEX.test(segment)) {
                continue
            } else if (TERMINATOR === segment) {
                if (n < segments.length - 1) {
                    throw new RoutingError("Cannot have pathing after termination")
                }
                continue
            }
            throw new RoutingError(`Invalid segment: ${segment}`)
        }

        // It feels silly to loop through twice but this only happens once and we don't want to pollute
        // the tree with invalid data
        let current: RouteSegment = this.root
        for (const segment of segments) {
            let info: RouteSegmentInfo = RouteSegmentInfo.None
            let parameter: string | undefined

            if (WILDCARD === segment) {
                console.log("wildcard!")
                info &= RouteSegmentInfo.Wildcard
            } else if (TERMINATOR === segment) {
                info &= RouteSegmentInfo.Terminal
            } else if (PARAMETER_REGEX.test(segment)) {
                console.log("parameter")
                info &= RouteSegmentInfo.Parameter
                parameter = segment.slice(1, -1) // Remove the {} characters
            }

            console.log("info", info)

            // There is no path through here yet, safe to add
            if (current.children === undefined) {
                current.children = []
                const child = <RouteSegment>{
                    info,
                    parameter,
                    parent: current,
                    handlers: noHandlers()
                }

                current.children.push(child)
                current = child
            } else {

                let match: RouteSegment | undefined
                // Check for any children that share the segment
                for (const child of current.children) {

                    // If this is non-zero there 
                    if (child.info & info) {

                        console.log("match", child.info, info)

                        // Verify there is no conflicting data
                        if (child.info & RouteSegmentInfo.Parameter) {
                            if (parameter === child.parameter) {
                                match = child
                                break
                            }
                        } else {
                            // Can only be terminal or wildcard
                            match = child
                            break
                        }

                    } else if (segment === child.segment) {
                        // The segment is a match
                        match = child
                        break
                    } else if ((child.info & RouteSegmentInfo.Wildcard && info & RouteSegmentInfo.Parameter) ||
                        (child.info & RouteSegmentInfo.Parameter && info & RouteSegmentInfo.Wildcard)) {
                        throw new RoutingError("Indeterminate wildcard and parameter collision")
                    } else {
                        console.log("child != info", child.info, info)
                    }
                }

                if (match) {
                    current = match
                } else {
                    const child = <RouteSegment>{
                        info,
                        parameter,
                        parent: current,
                        handlers: noHandlers()
                    }

                    current.children.push(child)
                    current = child
                }
            }
        }

        // Current at this point is located with our target
        if (method !== undefined) {
            if (current.handlers[method]) {
                throw new RoutingError("Method is already overloaded")
            }

            current.handlers[method] = handler
        } else {
            for (const value of HTTP_METHODS) {
                if (current.handlers[value] === undefined) {
                    current.handlers[value] = handler
                }
            }
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
    Parameter = 0x4
}

/**
 * Single segment of a route at any point in the tree
 */
class RouteSegment {
    parent?: RouteSegment
    children?: RouteSegment[]
    parameter?: string
    segment?: string
    info: RouteSegmentInfo = RouteSegmentInfo.None
    handlers: RouteHandler = noHandlers()
}

const noHandlers = (): RouteHandler =>
    <RouteHandler>{
        GET: undefined,
        PUT: undefined,
        POST: undefined,
        PATCH: undefined,
        DELETE: undefined,
        OPTIONS: undefined
    }