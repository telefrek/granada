/**
 * Testing Multi Level Queue behaviors
 */

import { Duration, delay } from "../time.js"
import { NO_OP_CALLBACK } from "../type/utils.js"
import {
  DefaultMultiLevelPriorityQueue,
  TaskPriority,
  createQueueWorker,
  type MultiLevelPriorityQueue,
  type MultiLevelTaskOptions,
} from "./multiLevelQueue.js"

describe("Multi level queue should be able to handle generic workloads", () => {
  let queue: MultiLevelPriorityQueue

  beforeEach(() => {
    queue = new DefaultMultiLevelPriorityQueue()
  })

  afterEach(async () => {
    await queue.shutdown()
  })

  it("Should handle simple task behavior", async () => {
    const opts: MultiLevelTaskOptions = {
      timeout: Duration.ofMilli(10),
      cancel: NO_OP_CALLBACK,
    }

    expect(queue.queue(opts, () => 1)).toBeTruthy()

    expect(await queue.next()).toBe(1)

    expect(queue.queue(opts, () => Promise.resolve(1))).toBeTruthy()
    expect(await queue.next()).toBe(1)

    queue.queue({ ...opts, priority: TaskPriority.LOW }, () =>
      Promise.resolve(2),
    )
    expect(await queue.next()).toBe(2)
    queue.queue(opts, (...args: number[]) => Promise.resolve(args[0]), 4)

    expect(await queue.next()).toBe(4)
  })

  it("Should process things in the correct order", async () => {
    const f = (idx: number): number => {
      return idx
    }

    const opts: MultiLevelTaskOptions = {
      timeout: Duration.ofMilli(10),
      cancel: NO_OP_CALLBACK,
    }

    // Queue the order
    queue.queue(opts, f, 1)
    queue.queue({ ...opts, priority: TaskPriority.HIGH }, f, 2)
    queue.queue({ ...opts, priority: TaskPriority.CRITICAL }, f, 3)
    queue.queue(opts, f, 4)
    queue.queue({ ...opts, priority: TaskPriority.HIGH }, f, 5)

    // Should be critical, high, high, low, low (3, 2, 5, 1, 4)
    expect(await queue.next()).toBe(3)
    expect(await queue.next()).toBe(2)
    expect(await queue.next()).toBe(5)
    expect(await queue.next()).toBe(1)
    expect(await queue.next()).toBe(4)
  })

  it("Should timeout work that cannot be accomplished in time", async () => {
    const f = async (idx: number): Promise<number> => {
      await delay(10)
      return idx
    }

    let cancelled = 0
    const cancel = () => {
      cancelled++
    }

    const opts: MultiLevelTaskOptions = {
      timeout: Duration.ofMilli(35),
      cancel,
    }

    // Ensure the curator kills the task
    queue.queue({ ...opts, cancel: NO_OP_CALLBACK }, f, 1)
    await delay(300)
    expect(await queue.next()).toBeUndefined()

    queue.queue(opts, f, 1)
    queue.queue({ ...opts, priority: TaskPriority.HIGH }, f, 2)
    queue.queue({ ...opts, priority: TaskPriority.CRITICAL }, f, 3)
    queue.queue(opts, f, 4)
    queue.queue({ ...opts, priority: TaskPriority.HIGH }, f, 5)

    // We expect that only the first 3 will be finished in time
    expect(await queue.next()).toBe(3)
    expect(await queue.next()).toBe(2)
    expect(await queue.next()).toBe(5)

    // Everything should have timed out beyond this point
    await delay(10)
    expect(await queue.next()).toBeUndefined()

    // both tasks should be cancelled
    expect(cancelled).toBe(2)

    // Add one more to wait for the curator to verify it times things out
    queue.queue(opts, f, 1)
    await delay(300)

    expect(await queue.next()).toBeUndefined()
    expect(cancelled).toBe(3)
  })

  it("should function with workers", async () => {
    const f = async (idx: number): Promise<number> => {
      await delay(2)
      return idx
    }

    let cancelled = 0
    const cancel = () => {
      cancelled++
    }

    const opts: MultiLevelTaskOptions = {
      timeout: Duration.ofMilli(35),
      cancel,
    }

    // Ensure the queue is working
    queue.queue(opts, f, 1)
    expect(await queue.next()).toBe(1)

    const controller = new AbortController()

    // Start a worker
    const worker = createQueueWorker(queue, controller.signal)

    // Queue some work
    for (let n = 0; n < 10; ++n) {
      queue.queue(opts, f, 1)
    }

    await delay(50)
    controller.abort("shutdown")

    // Worker should have handled the work
    expect(cancelled).toBe(0)

    // Should stop the worker
    await worker
  })
})
