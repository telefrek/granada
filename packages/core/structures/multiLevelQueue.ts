/**
 * Multi-Level Priority Queue
 */

import { Signal } from "../concurrency.js"
import { track } from "../context.js"
import { TimeoutError } from "../errors.js"
import { type FrameworkPriority } from "../index.js"
import { error } from "../logging.js"
import { Duration } from "../time.js"
import {
  type AnyArgs,
  type EmptyCallback,
  type Func,
  type MaybeAwaitableAny,
  type Optional,
} from "../type/utils.js"

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
  /** The amount of time to wait before timing out the task */
  timeout: Duration
  cancel: EmptyCallback
  /** The {@link TaskPriority} for this task */
  priority?: TaskPriority
  /** The acceptable delay before increasing priority */
  delayMilliseconds?: number
}

export interface MultiLevelPriorityQueue {
  queue(
    options: MultiLevelTaskOptions,
    work: Func<AnyArgs, MaybeAwaitableAny>,
    ...args: AnyArgs
  ): boolean

  size: number

  /**
   * Get the next piece of work to execute
   */
  next(): Optional<MaybeAwaitableAny>

  /**
   * Shuts the queue down for further processing
   */
  shutdown(): Promise<void>

  /**
   * Wait on the queue to have another value
   */
  wait(): Promise<void>
}

const TASK_TIMEOUT = new TimeoutError("TaskTimeout")
TASK_TIMEOUT.stack

export function createQueueWorker(
  queue: MultiLevelPriorityQueue,
  signal: AbortSignal,
): Promise<void> {
  return new QueueWorkerThread(queue, signal).run()
}

/**
 * Default implementation of the {@link MultiLevelPriorityQueue}
 */
export class DefaultMultiLevelPriorityQueue implements MultiLevelPriorityQueue {
  private _queue: MultiLevelQueue = {
    [TaskPriority.CRITICAL]: [],
    [TaskPriority.HIGH]: [],
    [TaskPriority.MEDIUM]: [],
    [TaskPriority.LOW]: [],
  }
  private _curator: QueueWorker
  private _signal: Signal = new Signal()
  private _shutdown: boolean = false

  constructor() {
    const curatorController = new AbortController()
    const curator = new QueueCurator(this._queue, curatorController.signal)
    this._curator = {
      worker: curator,
      controller: curatorController,
      promise: curator.run(),
    }
  }

  get size(): number {
    return (
      this._queue[TaskPriority.CRITICAL].length +
      this._queue[TaskPriority.HIGH].length +
      this._queue[TaskPriority.MEDIUM].length +
      this._queue[TaskPriority.LOW].length
    )
  }

  async wait(): Promise<void> {
    await this._signal.wait(Duration.ofMilli(500))
  }

  async shutdown(): Promise<void> {
    this._shutdown = true
    this._curator.controller.abort()
    await this._curator.promise

    this._signal.notifyAll()

    return
  }

  next() {
    // Get the next most critical
    for (let n = 0; n < 4; ++n) {
      // Get the reference
      const queue = this._queue[n as TaskPriority]
      while (queue.length > 0) {
        // Check the next task
        const task = queue.shift()!

        // Cancel anything we can't run that curator hasn't removed
        if (task.options.timeout < Date.now()) {
          task.cancel()
        } else {
          // Run the work
          return task.work(...task.args)
        }
      }
    }

    return undefined
  }

  queue(
    options: MultiLevelTaskOptions,
    work: Func<AnyArgs, MaybeAwaitableAny>,
    ...args: AnyArgs
  ): boolean {
    const taskOptions: TaskRuntimeOptions = {
      priority: options.priority ?? TaskPriority.MEDIUM,
      timeout: ~~options.timeout.milliseconds() + Date.now(),
      escalate: options.delayMilliseconds
        ? Date.now() + options.delayMilliseconds
        : options.delayMilliseconds,
    }

    // Create and setup the task
    const task: MultiLevelQueueTask = {
      work: track(work), // Ensure we add any known tracking
      args: args,
      options: taskOptions,
      cancel: options.cancel,
    }

    this._queue[taskOptions.priority].push(task)

    this._signal.notify()

    return true
  }
}

type TaskRuntimeOptions = {
  priority: TaskPriority
  timeout: number
  escalate?: number
}

type MultiLevelQueueTask = {
  work: Func<AnyArgs, MaybeAwaitableAny>
  args: AnyArgs
  options: TaskRuntimeOptions
  cancel: EmptyCallback
}

type MultiLevelQueue = Record<TaskPriority, MultiLevelQueueTask[]>

interface MultiLevelWorker {
  run(): Promise<void>
}

class QueueWorkerThread implements MultiLevelWorker {
  readonly _queue: MultiLevelPriorityQueue
  readonly _signal: AbortSignal

  constructor(queue: MultiLevelPriorityQueue, signal: AbortSignal) {
    this._queue = queue
    this._signal = signal
  }

  async run(): Promise<void> {
    while (!this._signal.aborted) {
      try {
        const work = this._queue.next()
        if (work !== undefined) {
          await work
        } else {
          await this._queue.wait()
        }
      } catch (err) {
        error(`Unhandled error in parallel queue worker: ${err}`)
      }
    }
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

  private _curate(): void {
    // Check for an abort
    if (this._abort.aborted) {
      // Clean any pending work
      this._cleanup(true)

      // Cancel the interval
      clearInterval(this._timeout)

      // Signal that we are done
      this._signal.notify()
      return
    }

    // Clean outstanding work only
    this._cleanup()
  }

  private _cleanup(finish: boolean = false) {
    // Process each queue looking for things that are expired
    for (let n = 3; n >= 0; --n) {
      const queue = this._queue[n as TaskPriority]

      // Clean everything
      if (finish) {
        while (queue.length > 0) {
          queue.shift()!.cancel()
        }
      }

      while (queue.length > 0 && queue[0].options.timeout < Date.now()) {
        queue.shift()!.cancel()
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

  async run(): Promise<void> {
    const _ = await this._signal.wait()
    return
  }
}

type QueueWorker = {
  worker: MultiLevelWorker
  controller: AbortController
  promise: Promise<void>
}
