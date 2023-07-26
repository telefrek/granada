import { createSimpleLimiter } from "."
import { delay } from "../../time"
import { vegasBuilder } from "./algorithms"

describe('Limits should function correctly per their design', () => {

    test('A simple limit should behave like a semaphore', async () => {

        // Create a default limiter with defaults of 1 and no concurrency updates
        const limiter = createSimpleLimiter()

        // Verify current limit is default
        expect(limiter.getLimit()).toBe(1)

        // Get an operation and verify it was provided
        let operation = limiter.tryAcquire()
        expect(operation).not.toBeUndefined()

        // Verify the second operation doesn't work
        let operation2 = limiter.tryAcquire()
        expect(operation2).toBeUndefined()

        // Test success
        operation?.success()

        operation2 = limiter.tryAcquire()
        expect(operation2).not.toBeUndefined()

        // Verify we can't get another
        operation = limiter.tryAcquire()
        expect(operation).toBeUndefined()

        // Verify ignore works
        operation2?.ignore()

        operation2 = limiter.tryAcquire()
        expect(operation2).not.toBeUndefined()
        operation2?.dropped()

        operation2 = limiter.tryAcquire()
        expect(operation2).not.toBeUndefined()

        // Verify multiple releases don't mess with the acquisition
        operation2?.success()

        expect(operation2?.success).toThrow()
        expect(operation2?.ignore).toThrow()
        expect(operation2?.dropped).toThrow()

        // Should only be able to get the first one
        operation = limiter.tryAcquire()
        expect(operation2).not.toBeUndefined()

        // Shouldn't be able to acquire a second
        operation2 = limiter.tryAcquire()
        expect(operation2).toBeUndefined()

        operation?.success()
    })

    test('A simple limit with a Vegas limiter should change based on the runtime conditions', async () => {
        const limiter = createSimpleLimiter(vegasBuilder(2).withMax(12).build())

        // Verify limits before starting
        expect(limiter.getLimit()).toBeGreaterThanOrEqual(1)
        expect(limiter.getLimit()).toBeLessThanOrEqual(12)

        // Get an operation and verify it was provided, then mark it as successful
        let operation = limiter.tryAcquire()
        expect(operation).not.toBeUndefined()
        operation?.success()

        // Test that the limit increases as we send more requests through the system at a fast rate
        let previousLimit = limiter.getLimit()

        // Simulate 500 iterations
        for (let n = 0; n < 100; ++n) {
            const operation = limiter.tryAcquire()
            await delay(5)
            operation?.success()
        }

        // The limit should have changed
        expect(limiter.getLimit()).toBeGreaterThan(previousLimit)
    })
})