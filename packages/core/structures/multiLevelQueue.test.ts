/**
 * Testing Multi Level Queue behaviors
 */

import { delay } from "../time"
import {
  DefaultMultiLevelPriorityQueue,
  TaskPriority,
  TimeoutError,
  type MultiLevelPriorityQueue,
} from "./multiLevelQueue"

describe("Multi level queue should be able to handle generic workloads", () => {
  let queue: MultiLevelPriorityQueue = new DefaultMultiLevelPriorityQueue(1)

  beforeEach(() => {
    queue = new DefaultMultiLevelPriorityQueue(1)
  })

  afterEach(async () => {
    await queue.shutdown()
  })

  it("Should handle simple task behavior", async () => {
    let ret = await queue.queue(() => 1)
    expect(ret).toBe(1)

    ret = await queue.queue(() => Promise.resolve(1))
    expect(ret).toBe(1)

    ret = await queue.queue({ priority: TaskPriority.LOW }, () =>
      Promise.resolve(2),
    )
    expect(ret).toBe(2)

    ret = await queue.queue((...args: number[]) => Promise.resolve(args[0]), 4)
    expect(ret).toBe(4)
  })

  it("Should process things in the correct order", async () => {
    const f = async (): Promise<number> => {
      await delay(10)
      return Date.now()
    }

    const promises: PromiseLike<number>[] = []
    promises.push(queue.queue(f)) // index 0
    await delay(1) // Ensure we start task 1
    promises.push(queue.queue({ priority: TaskPriority.HIGH }, f)) // index 1
    promises.push(queue.queue({ priority: TaskPriority.CRITICAL }, f)) // index 2
    promises.push(queue.queue(f)) // index 3
    promises.push(queue.queue({ priority: TaskPriority.HIGH }, f)) // index 4

    const res = await Promise.allSettled(promises)
    const values = res.map((r) => (r.status === "fulfilled" ? r.value : -1))
    expect(values.every((v) => v > 0)).toBeTruthy()
    expect(values[0]).toBeLessThan(values[1])
    expect(values[2]).toBeLessThan(values[1]) // Critical over High even though queued out o forder
    expect(values[2]).toBeGreaterThan(values[0]) // Critical after started
    expect(values[4]).toBeLessThan(values[3])
    expect(values[4]).toBeGreaterThan(values[1])
  })

  it("Should allow multiple workers", async () => {
    await queue.shutdown() // Stop the original

    queue = new DefaultMultiLevelPriorityQueue(4)

    const results: number[] = []
    const promises: PromiseLike<unknown>[] = []

    for (let n = 0; n < 4; ++n) {
      queue.queue(async () => {
        await delay(20)

        return -1
      })
    }

    for (let n = 0; n < 8; ++n) {
      promises.push(
        queue
          .queue({ priority: TaskPriority.MEDIUM }, () => 2)
          .then((r) => results.push(r)),
      )
    }

    for (let n = 0; n < 8; ++n) {
      promises.push(
        queue
          .queue({ priority: TaskPriority.HIGH }, () => 1)
          .then((r) => results.push(r)),
      )
    }

    for (let n = 0; n < 8; ++n) {
      promises.push(
        queue
          .queue({ priority: TaskPriority.LOW }, () => 3)
          .then((r) => results.push(r)),
      )
    }

    for (let n = 0; n < 8; ++n) {
      promises.push(
        queue
          .queue({ priority: TaskPriority.CRITICAL }, () => 0)
          .then((r) => results.push(r)),
      )
    }

    await Promise.allSettled(promises)

    for (let n = 1; n < results.length; ++n) {
      expect(results[n - 1]).toBeLessThanOrEqual(results[n])
    }
  })

  it("Should timeout work that cannot be accomplished in time", async () => {
    const promise = queue.queue(async () => await delay(1000))

    await delay(10)

    const work = queue.queue(
      { priority: TaskPriority.CRITICAL, timeoutMilliseconds: 300 },
      () => 1,
    )

    const results = await Promise.allSettled([promise, work])

    expect(results[0].status === "fulfilled")
    expect(results[1].status === "rejected")
    expect(
      results[1].status === "rejected" &&
        results[1].reason instanceof TimeoutError,
    )
  }, 2_000)
})
