"use strict";
/**
 * Package for managing load shedding within an application
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.enableLoadShedding = void 0;
const limits_1 = require("@telefrek/core/concurrency/limits");
const algorithms_1 = require("@telefrek/core/concurrency/limits/algorithms");
const time_1 = require("@telefrek/core/time");
const __1 = require("..");
function enableLoadShedding(thresholdMs = 1_000, limiter = undefined) {
    // Get the limiter
    const limit = limiter ??
        (0, limits_1.createSimpleLimiter)((0, algorithms_1.vegasBuilder)(10)
            .build()
            .on("changed", (l) => {
            console.log(`new limit: ${l}`);
        }), 10);
    return (request) => {
        const l = limit.tryAcquire();
        if (l) {
            const timer = new time_1.Timer();
            request.on("finished", () => {
                const end = timer.stop();
                if (end.milliseconds() > thresholdMs) {
                    l.dropped();
                    console.log("dropped due to exceeding timeout");
                }
                else {
                    l.success();
                }
            });
            return request;
        }
        else {
            console.log(`failed to get... ${limit.limit}`);
            // Load shedding...
            request.respond({
                status: __1.HttpStatus.SERVICE_UNAVAILABLE,
                headers: (0, __1.emptyHeaders)(),
            });
        }
    };
}
exports.enableLoadShedding = enableLoadShedding;
