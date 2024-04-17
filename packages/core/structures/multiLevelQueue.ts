/**
 * Multi-Level Priority Queue
 */

import { Signal } from "../concurrency.js"
import { TimeoutError } from "../errors.js"
import {
  DeferredPromise,
  MaybeAwaitable,
  type FrameworkPriority,
} from "../index.js"
import { Duration } from "../time.js"
import type { Func } from "../type/utils.js"

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
 * Map between the general {@link FrameworkPriority} and {@link TaskPriority} to bucketize
 *
 * @param priority The {@link FrameworkPriority} to map
 * @returns The corrisponding {@link TaskPriority}
 */
export function asTaskPriority(priority: FrameworkPriority) {
  return priority <= 1
    ? TaskPriority.CRITICAL
    : priority <= 3
      ? TaskPriority.HIGH
      : priority <= 5
        ? TaskPriority.MEDIUM
        : TaskPriority.LOW
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
  ): Promise<T>
  queue<T, Args extends unknown[]>(
    options: MultiLevelTaskOptions,
    work: Func<Args, MaybeAwaitable<T>>,
    ...args: Args
  ): Promise<T>

  workers: number
  size: number

  shutdown(): Promise<void>
}

/**
 * Default implementation of the {@link MultiLevelPriorityQueue}
 */
export class DefaultMultiLevelPriorityQueue implements MultiLevelPriorityQueue {
  _queue: MultiLevelQueue = {
    [TaskPriority.CRITICAL]: [],
    [TaskPriority.HIGH]: [],
    [TaskPriority.MEDIUM]: [],
    [TaskPriority.LOW]: [],
  }
  _signal: Signal = new Signal()
  _workers: QueueWorker[]
  _curator: QueueWorker

  constructor(size: number) {
    this._workers = []
    for (let n = 0; n < size; ++n) {
      const controller = new AbortController()
      const worker = new MultiLevelWorkerThread(
        this._queue,
        this._signal,
        controller.signal,
      )

      this._workers.push({
        worker,
        controller,
        promise: worker.run(),
      })
    }

    const curatorController = new AbortController()
    const curator = new QueueCurator(this._queue, curatorController.signal)
    this._curator = {
      worker: curator,
      controller: curatorController,
      promise: curator.run(),
    }
  }

  get workers(): number {
    return this._workers.length
  }

  get size(): number {
    return (
      this._queue[TaskPriority.CRITICAL].length +
      this._queue[TaskPriority.HIGH].length +
      this._queue[TaskPriority.MEDIUM].length +
      this._queue[TaskPriority.LOW].length
    )
  }

  async shutdown(): Promise<void> {
    this._workers.forEach((w) => w.controller.abort())
    await Promise.allSettled(this._workers.map((w) => w.promise))

    this._curator.controller.abort()
    await this._curator.promise

    return
  }

  queue<T, Args extends unknown[]>(
    work: Func<Args, MaybeAwaitable<T>>,
    ...args: Args
  ): Promise<T>
  queue<T, Args extends unknown[]>(
    options: MultiLevelTaskOptions,
    work: Func<Args, MaybeAwaitable<T>>,
    ...args: Args
  ): Promise<T>
  queue<T, Args extends unknown[]>(
    options: Func<Args, MaybeAwaitable<T>> | MultiLevelTaskOptions,
    work?: Func<Args, MaybeAwaitable<T>> | unknown,
    ...args: Args
  ): Promise<T> {
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

    this._queue[taskOptions.priority].push(task)

    // If anything is waiting signal it
    this._signal.notify()

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
  readonly _queue: MultiLevelQueue
  readonly _signal: Signal
  readonly _abort: AbortSignal

  constructor(queue: MultiLevelQueue, signal: Signal, abort: AbortSignal) {
    this._queue = queue
    this._signal = signal
    this._abort = abort
  }

  async run(): Promise<void> {
    while (!this._abort.aborted) {
      const task = this._next()
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
        await this._signal.wait(Duration.fromMilli(500))
      }
    }
  }

  _next(): MultiLevelQueueTask_T | undefined {
    for (let p = 0; p < 4; ++p) {
      const task = this._queue[p as TaskPriority].shift()
      if (task) {
        return task
      }
    }

    return
  }
}

class QueueCurator implements MultiLevelWorker {
  readonly _queue: MultiLevelQueue
  readonly _abort: AbortSignal
  readonly _timeout: NodeJS.Timeout
  readonly _signal: Signal = new Signal()

  constructor(queue: MultiLevelQueue, abort: AbortSignal) {
    this._queue = queue
    this._abort = abort

    const curate = this._curate.bind(this)
    this._timeout = setInterval(curate, 250)
  }

  _curate(): void {
    // Check for an abort
    if (this._abort.aborted) {
      this._signal.notify()

      // Cancel the interval
      clearInterval(this._timeout)
      return
    }

    // Process each queue looking for things that are expired
    for (let n = 3; n >= 0; --n) {
      const queue = this._queue[n as TaskPriority]

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
        this._queue[(n - 1) as TaskPriority].push(queue.shift()!)
      }
    }
  }

  run(): Promise<void> {
    return this._signal.wait().then((_) => {
      return
    })
  }
}

type QueueWorker = {
  worker: MultiLevelWorker
  controller: AbortController
  promise: Promise<void>
}
