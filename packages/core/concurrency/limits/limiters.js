"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simpleLimiter = void 0;
const __1 = require("../");
const time_1 = require("../../time/");
/**
 * Base class for all implementations of the {@link Limiter}
 */
class AbstractLimiter {
    #limitAlgorithm;
    #limit;
    #inFlight;
    // Allow retrieving the internal limit
    get limit() {
        return this.#limit;
    }
    /**
     * Base constructor for all {@link Limiter} abstractions built from this class
     *
     * @param limitAlgorithm The {@link LimitAlgorithm} to utilize
     * @param initialLimit The initial limit
     */
    constructor(limitAlgorithm, initialLimit) {
        if (initialLimit <= 0) {
            throw new Error(`Invalid initialLimit: ${initialLimit}`);
        }
        this.#limitAlgorithm = limitAlgorithm;
        this.#limit = initialLimit;
        this.#inFlight = 0;
        this.#limitAlgorithm.on("changed", this.onChange.bind(this));
    }
    /**
     * @returns The current limit
     */
    getLimit() {
        return this.#limit;
    }
    tryAcquire() {
        return;
    }
    /**
     * Handler for the {@link LimitAlgorithm} `changed` event
     *
     * @param newLimit The new limit to use
     */
    onChange(newLimit) {
        this.#limit = newLimit;
    }
    /**
     * Create a {@link LimitedOperation} to manipulate the state of the current {@link Limiter}
     *
     * @returns A basic {@link LimitedOperation}
     */
    createOperation() {
        return new this.AbstractLimitOperation(this);
    }
    /**
     * Base {@link LimitedOperation} that handles state tracking and mainpulation of the underlying {@link AbstractLimiter}
     */
    AbstractLimitOperation = class {
        #limiter;
        #finished;
        #timer;
        #running;
        /**
         * Requires the base {@link AbstractLimiter} which can be updated
         *
         * @param limiter The {@link AbstractLimiter} to update
         */
        constructor(limiter) {
            this.#limiter = limiter;
            this.#finished = false;
            this.#running = ++limiter.#inFlight;
            this.#timer = new time_1.Timer();
            this.#timer.start();
        }
        success() {
            this.#update();
            this.#limiter.#limitAlgorithm.update(this.#timer.stop(), this.#running, false);
        }
        ignore() {
            this.#update();
        }
        dropped() {
            this.#update();
            this.#limiter.#limitAlgorithm.update(this.#timer.stop(), this.#running, true);
        }
        /**
         * Private method to update the finished state and limiter inFlight value
         */
        #update() {
            // Ensure we only finish this once for any state
            if (!this.#finished) {
                this.#finished = true;
                this.#limiter.#inFlight--;
            }
            else {
                throw new Error("This operation has already been finished!");
            }
        }
    };
}
/**
 * Simple {@link Limiter} that uses a {@link Semaphore} to gate access
 */
class SimpleLimiter extends AbstractLimiter {
    #semaphore;
    /**
     * SimpleLimiter requires at least a {@link LimitAlgorithm} and optional limit (default is 1)
     *
     * @param limitAlgorithm The {@link LimitAlgorithm} to use
     * @param initialLimit The optional initial limit (default is 1)
     */
    constructor(limitAlgorithm, initialLimit = 1) {
        super(limitAlgorithm, initialLimit);
        this.#semaphore = new __1.Semaphore(initialLimit);
    }
    tryAcquire() {
        // Use the non-blocking version
        if (this.#semaphore.tryAcquire()) {
            return new this.SimpleLimitedOperation(this.#semaphore, this.createOperation());
        }
    }
    onChange(newLimit) {
        // Resize the semaphore
        this.#semaphore.resize(newLimit);
        // Propogate the change
        super.onChange(newLimit);
    }
    /**
     * Wrapped {@link LimitedOperation} for releasing the internal {@link Semaphore}
     */
    SimpleLimitedOperation = class {
        #delegate;
        #semaphore;
        /**
         * Requires the objects to manage as internal state
         *
         * @param semaphore The {@link Semaphore} to release
         * @param delegate The {@link LimitedOperation} to delegate to
         */
        constructor(semaphore, delegate) {
            this.#delegate = delegate;
            this.#semaphore = semaphore;
        }
        success() {
            this.#semaphore.release();
            this.#delegate.success();
        }
        ignore() {
            this.#semaphore.release();
            this.#delegate.ignore();
        }
        dropped() {
            this.#semaphore.release();
            this.#delegate.dropped();
        }
    };
}
/**
 * Create a simple {@link Limiter} using a {@link Semaphore} as the backing limit
 *
 * @param limitAlgorithm The {@link LimitAlgorithm} to use
 * @param initialLimit The initial limit value to use (default is 1)
 * @returns A newly initialized {@link Limiter}
 */
function simpleLimiter(limitAlgorithm, initialLimit = 1) {
    return new SimpleLimiter(limitAlgorithm, initialLimit);
}
exports.simpleLimiter = simpleLimiter;
