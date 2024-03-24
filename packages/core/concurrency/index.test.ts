import { Mutex, Semaphore, getMonitor } from "./"

describe("Testing Concurrency", () => {
  test("A mutex should provide a primitive lock", async () => {
    const mutex = new Mutex()

    // Should only allow a single entry
    expect(mutex.tryAcquire()).toBeTruthy()
    expect(mutex.tryAcquire()).toBeFalsy()

    // Release and confirm re-acquire
    mutex.release()
    expect(mutex.tryAcquire()).toBeTruthy()
    mutex.release()

    // Ensure async functionality works
    await mutex.acquire()
    expect(mutex.tryAcquire()).toBeFalsy()
    mutex.release()
  })

  test("A monitor should block concurrent execution", async () => {
    const obj = {}

    let value: number = -1

    // Monitors should not be allowed on invalid items
    expect(() => getMonitor(1)).toThrow()
    expect(() => getMonitor(undefined)).toThrow()
    expect(() => getMonitor(null)).toThrow()

    // Check the monitor is the same regardless of the number of calls
    const monitor = getMonitor(obj)
    expect(monitor).toBe(getMonitor(obj))

    // Different objects should have different monitors
    expect(monitor).not.toBe(getMonitor({}))

    // Start a bunch of async race conditions
    await Promise.all(
      [...Array(10).keys()].map(async (k) => {
        await getMonitor(obj).wait()
        value = k
        getMonitor(obj).pulse()
      }),
    )

    // The monitor should enforce in order execution
    expect(value).toBe(9)
  })

  test("A semaphore should limit concurrent execution", async () => {
    let running: number = 0
    let highWaterMark: number = 0

    // Verify the semaphore basics
    const semaphore = new Semaphore(4)
    expect(semaphore.limit()).toBe(4)
    expect(semaphore.available()).toBe(4)

    // Should not be able to set invalid sizes
    expect(() => semaphore.resize(-1)).toThrow()

    // We should be able to get a lease right now
    expect(semaphore.tryAcquire()).toBeTruthy()
    expect(semaphore.available()).toBe(3)
    expect(semaphore.tryAcquire()).toBeTruthy()
    expect(semaphore.available()).toBe(2)
    expect(semaphore.tryAcquire()).toBeTruthy()
    expect(semaphore.available()).toBe(1)
    expect(semaphore.tryAcquire()).toBeTruthy()
    expect(semaphore.available()).toBe(0)
    expect(semaphore.tryAcquire()).toBeFalsy()

    // Release the semaphores
    semaphore.release()
    expect(semaphore.available()).toBe(1)
    semaphore.release()
    semaphore.release()
    semaphore.release()

    // Verify the available has been restored
    expect(semaphore.available()).toBe(4)

    await Promise.all(
      [...Array(10).keys()].map(async (_) => {
        await semaphore.acquire()
        highWaterMark = Math.max(highWaterMark, ++running)

        try {
          // Wait 50 milliseconds to simulate some work
          await new Promise((resolve) => setTimeout(resolve, 50))
        } finally {
          // Decrement and release the semaphore
          --running
          semaphore.release()
        }
      }),
    )

    expect(highWaterMark).toBe(4)
    expect(running).toBe(0)

    // Reset and execute via the run method
    highWaterMark = 0

    // Execute via the semaphore.run
    await Promise.all(
      [...Array(1000).keys()].map((k) =>
        semaphore.run(async () => {
          highWaterMark = Math.max(highWaterMark, ++running)
          await new Promise((resolve) => setTimeout(resolve, 10))

          // Resize at 500 and 550
          if (k === 500) {
            // Throttle
            semaphore.resize(2)
          } else if (k === 550) {
            semaphore.resize(20)
          }

          --running
        }),
      ),
    )

    // Check the expectations with the resizing
    expect(highWaterMark).toBe(20)
    expect(running).toBe(0)
  })
})
