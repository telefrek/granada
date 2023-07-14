import { Semaphore, getMonitor } from "./";

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

    test('A semaphore should limit concurrent execution', async () => {
        let running: number = 0
        let highWaterMark: number = 0

        // Verify the semaphore basics
        const semaphore = new Semaphore(4)
        expect(semaphore.limit()).toBe(4)
        expect(semaphore.available()).toBe(4)

        // We should be able to get a lease right now
        expect(semaphore.tryAcquire()).toBeTruthy()
        expect(semaphore.available()).toBe(3)
        semaphore.release()
        expect(semaphore.available()).toBe(4)

        await Promise.all([...Array(10).keys()].map(async k => {
            await semaphore.acquire()
            highWaterMark = Math.max(highWaterMark, ++running)

            try {
                // Wait 50 milliseconds to simulate some work
                await new Promise(resolve => setTimeout(resolve, 50))
            } finally {
                // Decrement and release the semaphore
                --running
                semaphore.release()
            }
        }))

        expect(highWaterMark).toBe(4)
        expect(running).toBe(0)
    })
});