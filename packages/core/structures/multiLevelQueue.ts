/**
 * Multi-Level Priority Queue
 */

import { DeferredPromise, MaybeAwaitable } from ".."
import { Signal } from "../concurrency"
import { Duration } from "../time"
import type { Func } from "../type/utils"

/**
 * The priority for a given task
 */
export enum TaskPriority {
  CRITICAL = 0,
  HIGH,
  MEDIUM,
  LOW,
}

/**
 * Options for task execution
 */
export type MultiLevelTaskOptions = {
  /** The {@link TaskPriority} for this task */
  priority?: TaskPriority
  /** The amount of time to wait before timing out the task */
  timeoutMilliseconds?: number
  /** The acceptable delay before increasing priority */
  delayMilliseconds?: number
}

export interface MultiLevelPriorityQueue {
  queue<T, Args extends unknown[]>(
    work: Func<Args, MaybeAwaitable<T>>,
    ...args: Args
  ): PromiseLike<T>
  queue<T, Args extends unknown[]>(
    options: MultiLevelTaskOptions,
    work: Func<Args, MaybeAwaitable<T>>,
    ...args: Args
  ): PromiseLike<T>

  workers: number
  size: number

  shutdown(): Promise<void>
}

export class TimeoutError extends Error {
  static readonly TIMEOUT_ERR_SYMBOL: unique symbol = Symbol();

  [Symbol.hasInstance](error: unknown): error is TimeoutError {
    return (
      typeof error === "object" &&
      error !== null &&
      TimeoutError.TIMEOUT_ERR_SYMBOL in error
    )
  }
}

/**
 * Default implementation of the {@link MultiLevelPriorityQueue}
 */
export class DefaultMultiLevelPriorityQueue implements MultiLevelPriorityQueue {
  #queue: MultiLevelQueue = {
    [TaskPriority.CRITICAL]: [],
    [TaskPriority.HIGH]: [],
    [TaskPriority.MEDIUM]: [],
    [TaskPriority.LOW]: [],
  }
  #signal: Signal = new Signal()
  #workers: QueueWorker[]
  #curator: QueueWorker

  constructor(size: number) {
    this.#workers = []
    for (let n = 0; n < size; ++n) {
      const controller = new AbortController()
      const worker = new MultiLevelWorkerThread(
        this.#queue,
        this.#signal,
        controller.signal,
      )

      this.#workers.push({
        worker,
        controller,
        promise: worker.run(),
      })
    }

    const curatorController = new AbortController()
    const curator = new QueueCurator(this.#queue, curatorController.signal)
    this.#curator = {
      worker: curator,
      controller: curatorController,
      promise: curator.run(),
    }
  }

  get workers(): number {
    return this.#workers.length
  }

  get size(): number {
    return (
      this.#queue[TaskPriority.CRITICAL].length +
      this.#queue[TaskPriority.HIGH].length +
      this.#queue[TaskPriority.MEDIUM].length +
      this.#queue[TaskPriority.LOW].length
    )
  }

  async shutdown(): Promise<void> {
    this.#workers.forEach((w) => w.controller.abort())
    await Promise.allSettled(this.#workers.map((w) => w.promise))

    this.#curator.controller.abort()
    await this.#curator.promise

    return
  }

  queue<T, Args extends unknown[]>(
    work: Func<Args, MaybeAwaitable<T>>,
    ...args: Args
  ): PromiseLike<T>
  queue<T, Args extends unknown[]>(
    options: MultiLevelTaskOptions,
    work: Func<Args, MaybeAwaitable<T>>,
    ...args: Args
  ): PromiseLike<T>
  queue<T, Args extends unknown[]>(
    options: Func<Args, MaybeAwaitable<T>> | MultiLevelTaskOptions,
    work?: Func<Args, MaybeAwaitable<T>> | unknown,
    ...args: Args
  ): PromiseLike<T> {
    const taskOptions: TaskRuntimeOptions = {
      priority: TaskPriority.MEDIUM,
      timeout: Date.now() + 15_000, // TODO: make this configurable
    }

    let f: Func<Args, MaybeAwaitable<T>> = options as Func<
      Args,
      MaybeAwaitable<T>
    >
    let a: Args | undefined

    if (typeof options === "object") {
      f = work! as Func<Args, MaybeAwaitable<T>>
      a = args.length > 0 ? args : undefined
      const o = options as MultiLevelTaskOptions
      taskOptions.priority = o.priority ?? taskOptions.priority
      taskOptions.timeout = o.timeoutMilliseconds
        ? Date.now() + o.timeoutMilliseconds
        : taskOptions.timeout
      taskOptions.escalate = o.delayMilliseconds
        ? Date.now() + o.delayMilliseconds
        : taskOptions.escalate
    } else {
      if (args.length > 0) {
        a = [work].concat(args) as Args
      } else if (work) {
        a = [work] as Args
      }
    }

    // Create and setup the task
    const task: MutiLevelQueueTask<T, Args> = {
      work: f,
      args: a,
      promise: new DeferredPromise(),
      options: taskOptions,
    }

    this.#queue[taskOptions.priority].push(task)

    // If anything is waiting signal it
    this.#signal.notify()

    return task.promise
  }
}

type TaskRuntimeOptions = {
  priority: TaskPriority
  timeout: number
  escalate?: number
}

type MutiLevelQueueTask<T, Args extends unknown[]> = {
  work: Func<Args, MaybeAwaitable<T>>
  args?: Args
  options: TaskRuntimeOptions
  promise: DeferredPromise<T>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MultiLevelQueueTask_T = MutiLevelQueueTask<any, any[]>

type MultiLevelQueue = Record<TaskPriority, MultiLevelQueueTask_T[]>

interface MultiLevelWorker {
  run(): Promise<void>
}

class MultiLevelWorkerThread implements MultiLevelWorker {
  readonly #queue: MultiLevelQueue
  readonly #signal: Signal
  readonly #abort: AbortSignal

  constructor(queue: MultiLevelQueue, signal: Signal, abort: AbortSignal) {
    this.#queue = queue
    this.#signal = signal
    this.#abort = abort
  }

  async run(): Promise<void> {
    while (!this.#abort.aborted) {
      const task = this.#next()
      if (task) {
        try {
          if (task.args) {
            task.promise.resolve(await task.work(...task.args))
          } else {
            task.promise.resolve(await task.work())
          }
        } catch (err) {
          task.promise.reject(err)
        }
      } else {
        await this.#signal.wait(Duration.fromMilli(500))
      }
    }
  }

  #next(): MultiLevelQueueTask_T | undefined {
    for (let p = 0; p < 4; ++p) {
      const task = this.#queue[p as TaskPriority].shift()
      if (task) {
        return task
      }
    }

    return
  }
}

class QueueCurator implements MultiLevelWorker {
  readonly #queue: MultiLevelQueue
  readonly #abort: AbortSignal
  readonly #timeout: NodeJS.Timeout
  readonly #signal: Signal = new Signal()

  constructor(queue: MultiLevelQueue, abort: AbortSignal) {
    this.#queue = queue
    this.#abort = abort

    const curate = this.#curate.bind(this)
    this.#timeout = setInterval(curate, 250)
  }

  #curate(): void {
    // Check for an abort
    if (this.#abort.aborted) {
      this.#signal.notify()

      // Cancel the interval
      clearInterval(this.#timeout)
      return
    }

    // Process each queue looking for things that are expired
    for (let n = 3; n >= 0; --n) {
      const queue = this.#queue[n as TaskPriority]

      while (queue.length > 0 && queue[0].options.timeout < Date.now()) {
        queue
          .shift()!
          .promise.reject(
            new TimeoutError("Failed to start task before timeout expired"),
          )
      }

      while (
        queue.length > 0 &&
        queue[0].options.escalate !== undefined &&
        queue[0].options.escalate === n &&
        n > 0
      ) {
        this.#queue[(n - 1) as TaskPriority].push(queue.shift()!)
      }
    }
  }

  run(): Promise<void> {
    return this.#signal.wait().then((_) => {
      return
    })
  }
}

type QueueWorker = {
  worker: MultiLevelWorker
  controller: AbortController
  promise: Promise<void>
}
