import { Duration } from "../time/"
import { CircularArrayBuffer } from "./circularBuffer"

describe("Circular buffers should behave as infinite lists with fixed memory", () => {
  it("Should map state correctly for sync operations", () => {
    const buffer = new CircularArrayBuffer<number>({ highWaterMark: 61 })

    expect(buffer.size).toBe(0)
    expect(buffer.available).toBe(61)
    expect(buffer.closed).toBeFalsy()
    expect(buffer.finished).toBeFalsy()

    expect(buffer.tryRemove()).toBeUndefined()
    expect(buffer.tryRemoveRange(1).length).toBe(0)

    for (let n = 0; n < 61; ++n) {
      buffer.tryAdd(n)
      expect(buffer.size).toBe(n + 1)
      expect(buffer.available).toBe(61 - (n + 1))
    }

    expect(buffer.closed).toBeFalsy()
    expect(buffer.finished).toBeFalsy()

    // Can't add more
    expect(buffer.tryAdd(0)).toBeFalsy()

    // Should remove the first values added
    for (let n = 0; n < 10; ++n) {
      expect(buffer.tryRemove()).toBe(n)
    }

    // size and available should be updated
    expect(buffer.size).toBe(51)
    expect(buffer.available).toBe(10)

    // Should be able to add chunks up til the end
    expect(buffer.tryAddRange([0, 1, 2, 3])).toBe(4)
    expect(buffer.tryAddRange([0, 1, 2, 3])).toBe(4)
    expect(buffer.tryAddRange([0, 1, 2, 3])).toBe(2)
    expect(buffer.tryAddRange([0, 1, 2, 3])).toBe(0)

    // size and available should be updated
    expect(buffer.size).toBe(61)
    expect(buffer.available).toBe(0)

    buffer.close()
    expect(buffer.closed).toBeTruthy()
    expect(buffer.finished).toBeFalsy()

    expect(buffer.tryRemoveRange(50).length).toBe(50)
    expect(buffer.tryRemoveRange(100).length).toBe(11)
    expect(buffer.finished).toBeTruthy()
    expect(buffer.tryRemove()).toBeUndefined()
    expect(buffer.tryRemoveRange(1).length).toBe(0)
  })

  it("should map state correctly for async operations", async () => {
    const buffer = new CircularArrayBuffer<Number>({ highWaterMark: 32 })

    expect(buffer.size).toBe(0)
    expect(buffer.available).toBe(32)
    expect(buffer.closed).toBeFalsy()
    expect(buffer.finished).toBeFalsy()

    // Shouldn't be able to remove
    expect(await buffer.remove(Duration.fromMilli(5))).toBeFalsy()

    // Should be able to add
    for (let n = 0; n < 32; ++n) {
      expect(await buffer.add(n, Duration.fromMilli(2))).toBeTruthy()
    }

    // Shouldn't be able to add
    expect(await buffer.add(0, Duration.fromMilli(5))).toBeFalsy()

    // Should be able to add after we do a write on the event loop
    setTimeout(() => expect(buffer.tryRemove()).not.toBeUndefined(), 10)
    expect(await buffer.add(32, Duration.fromMilli(20))).toBeTruthy()

    // Should be able to remove 10
    expect(
      (await buffer.removeRange(5, 10, Duration.fromMilli(2))).length,
    ).toEqual(10)

    // Can't get min in time
    expect(
      (await buffer.removeRange(25, 32, Duration.fromMilli(2))).length,
    ).toEqual(0)

    // Should get more than min but less than max
    expect(
      (await buffer.removeRange(15, 32, Duration.fromMilli(2))).length,
    ).toEqual(22)

    expect(buffer.size).toBe(0)
    expect(buffer.available).toBe(32)
    expect(buffer.closed).toBeFalsy()
  }, 2_000)

  it("Should allow iteration", async () => {
    const buffer = new CircularArrayBuffer<Number>({ highWaterMark: 4 })

    // Setup a chain to write values
    const writer = async (): Promise<void> => {
      for (let n = 0; n < 10; ++n) {
        await buffer.add(n)
      }

      buffer.close()
    }

    // Read the values from the iterator
    const reader = async (): Promise<Number> => {
      let n = 0
      for await (const value of buffer) {
        n += Number(value)
      }

      return n
    }

    // Run the writer then the reader to ensure they correctly pipe data
    void writer()
    expect(await reader()).toEqual(45)
  })

  it("Should be able to run substantially more items than the size", async () => {
    // Create an array
    const buffer = new CircularArrayBuffer<Number>({ highWaterMark: 4 })

    // Create a writer function
    const writer = async (): Promise<void> => {
      for (let n = 0; n < 1000; ++n) {
        await buffer.add(Number(n))
      }

      // Stop further writes
      buffer.close()
    }

    let count = 0
    const reader = async (): Promise<void> => {
      while (!buffer.finished) {
        const value = await buffer.remove()
        expect(value).toBeGreaterThanOrEqual(0n)
        count++
      }
    }

    // Kick off the writer and reader
    await Promise.all([writer(), reader()])
    expect(count).toBe(1000)
  })

  it("Should allow waiting for batches", async () => {
    //  Use a non-power of 2 size for kicks
    const buffer = new CircularArrayBuffer<Number>({ highWaterMark: 37 })

    const writer = async (): Promise<void> => {
      for (let n = 0; n < 20; ++n) {
        // Add chunks of 20 at a time
        expect(
          await buffer.addRange(Array.from(new Array(20).keys()), 15),
        ).toBeGreaterThanOrEqual(15)
      }

      buffer.close()
    }

    let count = 0
    const reader = async (): Promise<void> => {
      // Keep reading the next value off
      while (!buffer.finished) {
        await buffer.remove()
        count++
      }
    }

    await Promise.all([writer(), reader()])

    // Should have read at leats 15 * 20 = 300
    expect(count).toBeGreaterThanOrEqual(300)
  })
})
