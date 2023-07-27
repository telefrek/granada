import { randomInt } from "crypto"
import { createSimpleLimiter } from "."
import { delay } from "../../time"
import { vegasBuilder } from "./algorithms"

describe('Limits should function correctly per their design', () => {

    test('A simple limit should behave like a semaphore', async () => {

        // Create a default limiter with defaults of 1 and no concurrency updates
        const limiter = createSimpleLimiter()

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
        const algorithm = vegasBuilder(2).withMax(12).build()
        const limiter = createSimpleLimiter(algorithm)

        // Get an operation and verify it was provided, then mark it as successful
        let operation = limiter.tryAcquire()
        expect(operation).not.toBeUndefined()
        operation?.success()

        // Total changes as well as increase/decreases
        let previousLimit = 2
        let changes = 0
        let increase = 0
        let decrease = 0
        let maxLimit = previousLimit

        // Track changes
        algorithm.on('changed', (limit) => {
            maxLimit = Math.max(limit, maxLimit)
            changes++
            if (limit < previousLimit) {
                decrease++
            } else {
                increase++
            }
            previousLimit = limit
        })

        // Simulate enough iterations to see movement in the limits
        for (let n = 0; n < 250; ++n) {

            let concurrency = 0

            // Randomly spin up some amount of work
            await Promise.all(Array.from(new Array(randomInt(2, 25)).keys()).map(async _ => {

                // Try to get access via the limiter
                const operation = limiter.tryAcquire()

                // Delay to simulate some work if we got a lease
                if (operation) {
                    // Start dropping concurrency at values above 10
                    const bad = ++concurrency >= 10
                    await delay(bad ? 10 : 2)

                    // Check for drop
                    if (bad) {
                        operation.dropped()
                    } else {
                        operation.success()
                    }

                    // Reduce the concurrency
                    concurrency--
                }
            }))
        }

        // The limit should have changed
        expect(changes).toBeGreaterThanOrEqual(2)
        expect(increase).toBeGreaterThanOrEqual(1)

        // This should get fired at least once during the setup
        expect(decrease).toBeGreaterThan(0)

        // This should match the last change
        expect(maxLimit).toEqual(12) // Based on defaults it shouldn't make it past here
    })
})