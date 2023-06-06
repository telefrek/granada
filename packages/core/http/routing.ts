/**
 * Package for handling routing with parameterization, wildcards and termination
 */

import { HttpHandler } from "./core";

/**
 * Handles routing in the application
 */
export interface Router {

    /**
     * Attempts to find a defined route for the given path
     * 
     * @param path The path to try to route
     * 
     * @returns Either the associated {@link Route} for the call or `undefined`
     */
    tryRoute(path: string): Route | undefined

    /**
     * Adds the route if it does not collide with any others
     * 
     * @param template The template to add
     */
    addRoute(template: RouteTemplate): boolean
}

/**
 * The information necessary to handle a route in teh system
 */
export interface RouteTemplate {
    /** The path associated with this template */
    path: string,

    /** The {@link HttpHandler} for this call */
    handler: HttpHandler,
}

/**
 * The runtime definition for a route
 */
export interface Route {
    /** The {@link RouteTemplate} this was associated with */
    template: RouteTemplate,

    /** The set of parameters found in the route */
    parameters: Map<string, string>
}

/**
 * Create the default {@link HttpRouter} for the sytem
 * 
 * @returns A newly initialized {@link Router}
 */
export function createRouter(): Router {
    return new HttpRouter()
}

class HttpRouter implements Router {

    tryRoute(path: string): Route | undefined {
        throw new Error("Method not implemented.");
    }

    addRoute(template: RouteTemplate): boolean {
        throw new Error("Method not implemented.");
    }

}