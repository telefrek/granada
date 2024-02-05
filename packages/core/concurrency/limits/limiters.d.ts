import { LimitAlgorithm, Limiter } from "./";
/**
 * Create a simple {@link Limiter} using a {@link Semaphore} as the backing limit
 *
 * @param limitAlgorithm The {@link LimitAlgorithm} to use
 * @param initialLimit The initial limit value to use (default is 1)
 * @returns A newly initialized {@link Limiter}
 */
export declare function simpleLimiter(limitAlgorithm: LimitAlgorithm, initialLimit?: number): Limiter;
