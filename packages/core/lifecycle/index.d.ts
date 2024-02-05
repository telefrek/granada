/**
 * Package exports
 */
import { MaybeAwaitable } from "../";
/**
 * Set of supported events on an object with a defined lifecycle
 */
export interface LifecycleEvents {
    /**
     * Fired when the object is initializing itself
     */
    initializing: () => void;
    /**
     * Fired when the object is started
     */
    started: () => void;
    /**
     * Fired when the object is stopping
     */
    stopping: () => void;
    /**
     *
     * @returns Fired when the object has finished
     */
    finished: () => void;
}
/**
 * Register the callback to be invoked on shutdown
 *
 * @param callback The callback to invoke on a shutdown
 */
export declare function registerShutdown(callback: () => MaybeAwaitable<unknown>): void;
