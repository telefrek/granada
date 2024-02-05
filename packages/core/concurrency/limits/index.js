"use strict";
/**
 * Port of a subset of the Netflix Concurrency Limits functionality {@link https://github.com/Netflix/concurrency-limits}
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSimpleLimiter = exports.LOG10 = void 0;
const algorithms_1 = require("./algorithms");
const limiters_1 = require("./limiters");
// Memoize the lookup for the first 1000 values
const _LOG_10_LOOKUP = Array.from(Array(1000).keys()).map((k) => Math.max(1, Math.log10(k)));
/**
 * Memoized Log10 function for the first 1000 values capping at >= 1
 *
 * @param n The value to calculate the log of 10 for
 * @returns The value of log10(n)
 */
function LOG10(n) {
    return n < 1000 ? _LOG_10_LOOKUP[n] : Math.log10(n);
}
exports.LOG10 = LOG10;
/**
 * Create a simple {@link Limiter} that works via a {@link Semaphore}
 *
 * @param limitAlgorithm The {@link LimitAlgorithm} to use (default is a fixed limit of 1)
 * @param initialLimit The initial limit value to use (default is 1)
 * @returns A newly initialized {@link Limiter}
 */
function createSimpleLimiter(limitAlgorithm = (0, algorithms_1.fixedLimit)(1), initialLimit = 1) {
    return (0, limiters_1.simpleLimiter)(limitAlgorithm, initialLimit);
}
exports.createSimpleLimiter = createSimpleLimiter;
