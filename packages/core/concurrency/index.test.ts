import { getMonitor } from "./"

describe('Testing Concurrency', () => {
    test('A monitor should block concurrent execution', async () => {
        const obj = {}

        let value: number = -1

        // Check the monitor is the same regardless of the number of calls
        const monitor = getMonitor(obj)
        expect(monitor).toBe(getMonitor(obj))

        // Different objects should have different monitors
        expect(monitor).not.toBe(getMonitor({}))

        // Start a bunch of async race conditions
        await Promise.all([...Array(10).keys()].map(async k => {
            await getMonitor(obj).wait()
            value = k
            getMonitor(obj).pulse()
        }))

        // The monitor should enforce in order execution
        expect(value).toBe(9)
    })
});