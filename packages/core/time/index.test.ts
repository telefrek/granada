import { Duration, Timer } from "."

describe('Testing Time Utilities', () => {
    test('A timer should accurately track durations', async () => {
        const timer = new Timer()

        expect(timer.elapsed()).toBe(Duration.ZERO)

        // Get a bounding for the total time
        const beforeMs = Date.now()
        const before = process.hrtime.bigint()

        // Time how long it takes to do the setTimeout
        timer.start()

        // Get the first checkpoint (should be nearly zero)
        const check1 = timer.elapsed()

        // Wait for some time
        await new Promise(resolve => setTimeout(resolve, 50))

        // Get the second checkpoint
        const check2 = timer.elapsed()

        // Stop the timer
        const elapsed = timer.stop()

        // Stop right after
        const after = process.hrtime.bigint()
        const afterMs = Date.now()

        // Verify the checkpoints are different
        expect(check2.microseconds()).toBeGreaterThan(check1.microseconds())

        // Setup the bounds from the process.hrtimer timings
        const expectedSeconds = Number((after - before) * 1_000_000n / 1_000_000_000n) / 1_000_000
        const expectedMilli = Number((after - before) * 1_000n / 1_000_000n) / 1_000
        const expectedMicro = Number((after - before) / 1_000n)

        // Verify the timing values are under the expected bounds
        expect(elapsed.seconds()).toBeLessThanOrEqual(expectedSeconds)
        expect(elapsed.milliseconds()).toBeLessThanOrEqual(expectedMilli)
        expect(elapsed.microseconds()).toBeLessThanOrEqual(expectedMicro)
        expect(elapsed.microseconds()).toBeGreaterThan(0)

        expect(timer.stop()).toBe(Duration.ZERO)

        // Verify the durations for nanoseconds
        const nanoDuration = Duration.fromNano(after - before)
        expect(nanoDuration.seconds()).toBeLessThanOrEqual(expectedSeconds)
        expect(nanoDuration.milliseconds()).toBeLessThanOrEqual(expectedMilli)
        expect(nanoDuration.microseconds()).toBeLessThanOrEqual(expectedMicro)

        // Verify the durations for milliseconds
        const milliDuration = Duration.fromMill(afterMs - beforeMs)
        expect(milliDuration.seconds()).toBeLessThanOrEqual(expectedSeconds)
        expect(milliDuration.milliseconds()).toBeLessThanOrEqual(expectedMilli)
        expect(milliDuration.microseconds()).toBeLessThanOrEqual(expectedMicro)
    })
})