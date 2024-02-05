"use strict";
/**
 * Package containing all of the routing information for associating a given path/method combination with a handler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRouter = exports.isRoutableApi = exports.RoutingError = void 0;
const __1 = require("..");
/**
 * Custom {@link Error} raised for routing issues
 */
class RoutingError extends Error {
    constructor(message) {
        super(message);
    }
}
exports.RoutingError = RoutingError;
/**
 * Type guard for finding {@link RoutableApi}
 *
 * @param routable The object to inspect
 * @returns True if this is a {@link RoutableApi}
 */
function isRoutableApi(routable) {
    return (typeof routable === "object" &&
        routable !== null &&
        "router" in routable &&
        typeof routable.router === "object");
}
exports.isRoutableApi = isRoutableApi;
/**
 * Create a new router
 *
 * @returns A newly initialized {@link Router}
 */
function createRouter() {
    return new RouterImpl();
}
exports.createRouter = createRouter;
const parseParameter = (s) => {
    switch (true) {
        case /^[+-]?\d*\.?\d+(?:[Ee][+-]?\d+)?$/.test(s):
            return +s;
        case s.toLowerCase() === "true":
            return true;
        case s.toLowerCase() === "false":
            return false;
        default:
            return s;
    }
};
/**
 * Default {@link Router} implementation that uses a tree structure to hold the mapping information
 */
class RouterImpl {
    #root = {
        info: RouteSegmentInfo.None,
    };
    lookup(request) {
        let current = this.#root;
        let remainder = request.path;
        let parameters;
        let nextSlash = -1;
        let children = this.#root.children;
        let info = this.#root.info;
        // Still more to search
        while (remainder.length > 0) {
            switch (true) {
                case info === RouteSegmentInfo.Wildcard:
                    // Advance to the next slash
                    nextSlash = remainder.indexOf("/");
                    remainder = nextSlash > 0 ? remainder.substring(nextSlash) : "";
                    info = RouteSegmentInfo.None;
                    children = current.children;
                    break;
                case info === RouteSegmentInfo.Parameter: {
                    if (parameters === undefined) {
                        parameters = new Map();
                    }
                    const val = nextSlash > 0 ? remainder.substring(0, nextSlash) : remainder;
                    nextSlash = remainder.indexOf("/");
                    parameters.set(current.parameter, parseParameter(val));
                    remainder = nextSlash > 0 ? remainder.substring(nextSlash) : "";
                    info = RouteSegmentInfo.None;
                    children = current.children;
                    break;
                }
                case info === RouteSegmentInfo.Terminal:
                    remainder = "";
                    break;
                case children !== undefined: {
                    // Check if any children cover this path
                    let child = children?.find((c) => c.segment !== undefined && remainder.startsWith(c.segment));
                    if (child) {
                        // Advance the remainder
                        remainder = remainder.substring(child.segment.length);
                        current = child;
                        children = current.children;
                        info = current.info;
                        // Check if we need to offload this
                        if (isRouterNode(current)) {
                            // Get any info from the child router
                            const routeInfo = current.router.lookup({
                                method: request.method,
                                path: remainder,
                            });
                            // If we found info
                            if (routeInfo && parameters) {
                                // Check for existing in case we have to merge the set
                                if (routeInfo.parameters) {
                                    for (const key of parameters.keys()) {
                                        routeInfo.parameters.set(key, parameters.get(key));
                                    }
                                }
                                else {
                                    routeInfo.parameters = parameters;
                                }
                            }
                            // Either we found it or it doesn't exist
                            return routeInfo;
                        }
                    }
                    else {
                        // Check for terminal, wildcard or parameter
                        child = children?.find((c) => c.info !== RouteSegmentInfo.None);
                        if (child) {
                            // Keep processing
                            current = child;
                            if (!remainder.startsWith("/")) {
                                // This isn't a valid path
                                return;
                            }
                            // Remove the leading slash
                            remainder = remainder.substring(1);
                            // Reset the search parameters
                            info = current.info;
                            children = current.children;
                        }
                        else {
                            return;
                        }
                    }
                    break;
                }
                default:
                    // Can't go any further down the tree, abandon hope all ye who enter here
                    return;
            }
        }
        // Check if we found a valid handler
        if (isHandlerNode(current)) {
            if (current.handlers[request.method]) {
                return {
                    handler: current.handlers[request.method],
                    parameters,
                };
            }
        }
    }
    addHandler(template, handler, method) {
        // Verify the template and get the set of segments
        const segments = this.#verifyRoute(template);
        // Get the last segment off the list
        const final = segments.pop();
        // No children so far, just embed this entire stack
        if (this.#root.children === undefined) {
            const handlerNode = {
                segment: final.segment,
                parameter: final.parameter,
                info: final.info,
                handlers: {},
            };
            if (method !== undefined) {
                handlerNode.handlers[method] = handler;
            }
            else {
                for (const value of __1.HTTP_METHODS) {
                    handlerNode.handlers[value] = handler;
                }
            }
            // Add the first node
            this.#addFast(this.#root, segments, handlerNode);
        }
        else {
            let current = this.#root;
            // Merge all the segments
            for (const segment of segments) {
                current = this.#mergeSegment(current, segment);
            }
            // Get the location for our handler from the final merge
            current = this.#mergeSegment(current, final);
            if (isHandlerNode(current)) {
                if (method) {
                    if (current.handlers[method]) {
                        throw new RoutingError(`There is already a handler at ${method}: ${template}`);
                    }
                    // Add the handler
                    current.handlers[method] = handler;
                }
                else {
                    throw new RoutingError(`Found partial handler at ${template} and unsure how to merge since no method defined`);
                }
            }
            else if (isRouterNode(current)) {
                throw new RoutingError(`Found routing node at ${template} in conflict with handler`);
            }
            else {
                // Add the handler for all methods
                const handlers = {};
                if (method) {
                    handlers[method] = handler;
                }
                else {
                    for (const method of __1.HTTP_METHODS) {
                        handlers[method] = handler;
                    }
                }
                // Inject this in
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
                ;
                current.handlers = handlers;
            }
        }
    }
    addRouter(template, router) {
        // Verify the template and get the set of segments
        const segments = this.#verifyRoute(template);
        // Get the last segment off the list
        const final = segments.pop();
        // No children so far, just embed this entire stack
        if (this.#root.children === undefined) {
            // Build the node
            const routerNode = {
                segment: final.segment,
                parameter: final.parameter,
                info: final.info,
                router,
            };
            // Add this to the root, no need for collision checks
            this.#addFast(this.#root, segments, routerNode);
        }
        else {
            let current = this.#root;
            // Merge all the segments
            for (const segment of segments) {
                current = this.#mergeSegment(current, segment);
            }
            // Get the location for our handler from the final merge
            current = this.#mergeSegment(current, final);
            if (isHandlerNode(current)) {
                throw new RoutingError(`Conflicting handler node already registerred at ${template}`);
            }
            else if (isRouterNode(current)) {
                throw new RoutingError(`Conflicting router node already registerred at ${template}`);
            }
            else {
                // Inject the router
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
                ;
                current.router = router;
            }
        }
    }
    /**
     * This method is here to protect against mapping types that can't be easily resolved at runtime between terminal, wildcard and parameters
     *
     * @param children The children to inspect
     * @param info The info for the collision check
     */
    #guardUnmappable(children, info) {
        if (children.some((c) => c.info !== info && c.info !== RouteSegmentInfo.None)) {
            throw new RoutingError(`There is a conflict between parameters, wildcards and terminal values`);
        }
    }
    /**
     * Merge a segment into the trie at this node
     *
     * @param current The current {@link RouteTrieNode} we ar eprocessing
     * @param segment The {@link RouteSegment} we want to add at this point
     * @returns The resulting {@link RouteTrieNode} where the next operations would happen
     */
    #mergeSegment(current, segment) {
        // Easy case
        if (current.children === undefined) {
            const next = {
                segment: segment.segment,
                parameter: segment.parameter,
                info: segment.info,
            };
            current.children = [next];
            return next;
        }
        // Depending on what type segment we're adding, we need to verify different things
        switch (segment.info) {
            // Handle terminal and wildcard where we are just looking for a match or inserting
            case RouteSegmentInfo.Wildcard:
            case RouteSegmentInfo.Terminal: {
                this.#guardUnmappable(current.children, segment.info);
                let next = current.children.find((child) => child.info === segment.info);
                // One doesn't already exist
                if (next === undefined) {
                    next = {
                        info: segment.info,
                    };
                }
                return next;
            }
            // Handle parameters which can have a match but need to have the same parameter info
            case RouteSegmentInfo.Parameter: {
                const paramNode = current.children.find((child) => child.info === RouteSegmentInfo.Parameter);
                if (paramNode) {
                    // This is bad
                    if (paramNode.parameter !== segment.parameter) {
                        throw new RoutingError(`Conflicting parameter (${segment.parameter} != ${paramNode.parameter}) found at same location in route tree`);
                    }
                    // Fine to share from here
                    return paramNode;
                }
                else {
                    this.#guardUnmappable(current.children, segment.info);
                    // Create the new node
                    const next = {
                        segment: segment.segment,
                        parameter: segment.parameter,
                        info: segment.info,
                    };
                    // No other parameters at this point so safe to add
                    current.children.push(next);
                    return next;
                }
            }
            default: {
                // covering is where some of the segments match
                const commonPrefix = (left, right) => {
                    let n = 0;
                    let lastSlash = -1;
                    while (n < left.length && n < right.length) {
                        // Match so far, keep going
                        if (left.charAt(n) === right.charAt(n)) {
                            // We found a dividing slash for a valid split in segments
                            if (left.charAt(n) === "/") {
                                lastSlash = n;
                            }
                            n++;
                        }
                        else {
                            break;
                        }
                    }
                    // Only a prefix if they both have a shared segment
                    return lastSlash > 0
                        ? left.substring(0, lastSlash)
                        : n === left.length || n === right.length
                            ? left.substring(0, n)
                            : "";
                };
                let covering;
                let lcp = 0;
                for (const child of current.children.filter((child) => child.info === RouteSegmentInfo.None)) {
                    const prefix = commonPrefix(child.segment, segment.segment);
                    if (prefix.length > lcp) {
                        covering = child;
                        lcp = prefix.length;
                    }
                }
                // We need to split the nodes
                if (covering) {
                    // Full overlap, return the covering
                    if (segment.segment === covering.segment) {
                        return covering;
                    }
                    return this.#split(covering, segment, lcp);
                }
                else {
                    // No covering, just add from here
                    const next = {
                        segment: segment.segment,
                        info: segment.info,
                    };
                    // No other parameters at this point so safe to add
                    current.children.push(next);
                    return next;
                }
            }
        }
    }
    #split(current, segment, prefixLegnth) {
        // Create a new node with the current children
        let left = {
            segment: current.segment.substring(prefixLegnth),
            info: current.info,
            children: current.children ? [...current.children] : undefined,
        };
        // Create the new node for our segment
        const right = {
            segment: segment.segment.substring(prefixLegnth),
            info: segment.info,
        };
        // Update the current to be the prefix
        current.segment = current.segment.substring(0, prefixLegnth);
        // It's possible we are splitting out a router node, need to send that through
        if (isRouterNode(current)) {
            left = {
                segment: left.segment,
                info: left.info,
                router: current.router,
            };
            // Remove the router from this object
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
            delete current.router;
        }
        // Change the children to be the two new nodes
        current.children = [left, right];
        // Return our new segment node
        return right;
    }
    /**
     * Does a fast addition without worry about child node merging
     *
     * @param current The {@link RouteTrieNode} to start at
     * @param segments The remaining {@link RouteSegment}
     * @param node The terminal {@link RouteTrieNode}
     */
    #addFast(current, segments, node) {
        // Add all but the last segment
        for (const segment of segments) {
            // Create the children if necessary and push the information
            current.children = current.children ?? [];
            current.children.push({
                segment: segment.segment,
                parameter: segment.parameter,
                info: segment.info,
            });
            // Move down the tree
            current = current.children[current.children.length - 1];
        }
        current.children = current.children ?? [];
        current.children.push(node);
    }
    /**
     * Internal method to verify a template as valid
     *
     * @param template The template to validate
     *
     * @returns The set of {@link RouteSegment} found for this template path
     */
    #verifyRoute(template) {
        // verify the template matches
        if (!TEMPLATE_REGEX.test(template)) {
            throw new RoutingError("Template is not valid");
        }
        // verify all of the segments are valid
        const segments = template.replace(/^\//, "").replace(/\/$/, "").split("/");
        if (segments.length === 0) {
            throw new RoutingError("No valid segments found!");
        }
        // Create the set of segments
        const routeSegments = [];
        // Check the segments for valid contents while building up the individual
        let currentSegment = "";
        // Helper to clear the current segment after pushing
        const checkCurrent = () => {
            if (currentSegment.length > 0) {
                routeSegments.push({
                    segment: currentSegment,
                    info: RouteSegmentInfo.None,
                });
                currentSegment = "";
            }
        };
        for (let n = 0; n < segments.length; ++n) {
            const segment = segments[n];
            switch (true) {
                // Test for wildcards
                case WILDCARD === segment:
                    // Add anything up to this point as a segment
                    checkCurrent();
                    // Push the wildcard
                    routeSegments.push({
                        info: RouteSegmentInfo.Wildcard,
                    });
                    break;
                case PARAMETER_REGEX.test(segment):
                    // Add anything up to this point as a segment
                    checkCurrent();
                    // Push the parameter
                    routeSegments.push({
                        info: RouteSegmentInfo.Parameter,
                        parameter: segment.slice(1, -1),
                    });
                    break;
                case TERMINATOR === segment:
                    // Guard no terminator in the middle
                    if (n < segments.length - 1) {
                        throw new RoutingError("Cannot have pathing after termination");
                    }
                    // Add anything up to this point as a segment
                    checkCurrent();
                    // Push the terminal
                    routeSegments.push({
                        info: RouteSegmentInfo.Terminal,
                    });
                    break;
                case URI_SEGMENT_REGEX.test(segment):
                    // Add this segment to the current and continue
                    currentSegment += `/${segment}`;
                    break;
                default:
                    // This should never happen iwth valid routes
                    throw new RoutingError(`Invalid segment: ${segment}`);
            }
        }
        // Add any remainder
        if (currentSegment.length > 0) {
            routeSegments.push({
                info: RouteSegmentInfo.None,
                segment: currentSegment,
            });
        }
        return routeSegments;
    }
}
const WILDCARD = "*";
const TERMINATOR = "**";
const URI_SEGMENT_REGEX = /^[a-zA-Z0-9-]+$/;
const PARAMETER_REGEX = /^\{[a-zA-Z_$][0-9a-zA-Z_$]*\}$/;
const TEMPLATE_REGEX = /(?:\/(?:[a-zA-Z0-9-]+|\{[a-zA-Z_$][0-9a-zA-Z_$]*\}|\*+)+)+/;
/**
 * Internal enum to track {@link RouteTrieNode} state information
 */
var RouteSegmentInfo;
(function (RouteSegmentInfo) {
    RouteSegmentInfo["None"] = "none";
    RouteSegmentInfo["Terminal"] = "terminal";
    RouteSegmentInfo["Wildcard"] = "wildcard";
    RouteSegmentInfo["Parameter"] = "parameter";
})(RouteSegmentInfo || (RouteSegmentInfo = {}));
/**
 * Type guard for {@link RouterNode}
 *
 * @param segment The {@link RouteTrieNode} to inspect
 * @returns True if the segment is a {@link RouterNode}
 */
function isRouterNode(segment) {
    return "router" in segment;
}
/**
 * Type guard for {@link HandlerNode}
 *
 * @param segment The {@link RouteTrieNode} to inspect
 * @returns True if the segment is a {@link HandlerNode}
 */
function isHandlerNode(segment) {
    return "handlers" in segment;
}
