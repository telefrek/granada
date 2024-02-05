"use strict";
/**
 * Package exports
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerShutdown = void 0;
/**
 * Register the callback to be invoked on shutdown
 *
 * @param callback The callback to invoke on a shutdown
 */
function registerShutdown(callback) {
    shutdownHooks.push(callback);
}
exports.registerShutdown = registerShutdown;
/** Set of shutdown hooks to fire on exit */
const shutdownHooks = [];
/** Simple method to invoke shutdowns */
const shutdown = () => {
    // Fire all the hooks and hope for the best...
    Promise.all(shutdownHooks.map(async (s) => await s())).then(() => console.log("shutdown finished"), (err) => {
        console.error(`error: ${err}`);
    });
};
// Local process kill (ctrl+c)
process.on("SIGINT", shutdown);
// Container process kill (docker, etc.)
process.on("SIGTERM", shutdown);
