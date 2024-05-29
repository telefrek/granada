import { randomUUID as v4 } from "crypto"
import {
  Duplex,
  Readable,
  Stream,
  Writable,
  type Transform,
  type TransformCallback,
  type TransformOptions,
} from "stream"
import { Semaphore, Signal } from "./concurrency.js"
import { MaybeAwaitable, type FrameworkPriority } from "./index.js"
import { DefaultLogger } from "./logging.js"
import {
  DefaultMultiLevelPriorityQueue,
  asTaskPriority,
  type MultiLevelPriorityQueue,
} from "./structures/multiLevelQueue.js"
import { Duration } from "./time.js"
import {
  type Consumer,
  type EmptyCallback,
  type Func,
  type Optional,
} from "./type/utils.js"

/**
 * Custom type allowing mapping a type through a {@link MaybeAwaitable} to a new value
 */
export type TransformFunc<T, U> = (data: T) => MaybeAwaitable<Optional<U>>

/**
 * Type for stream callbacks
 */
export type StreamCallback = (error?: Error | null | undefined) => void

/**
 * Consume the {@link Readable} and return the contents as a string
 *
 * @param readable The {@link Readable} to consume
 * @returns The contents of the {@link Readable} as a string
 */
export async function consumeString(readable: Readable): Promise<string> {
  // TODO: This can probably be optimized but it's a utility for now so...
  let s = ""
  for await (const chunk of readable) {
    s += Buffer.isBuffer(chunk) ? chunk.toString() : (chunk as string)
  }

  return s
}

/**
 * Reads the contents from the stream
 *
 * @param readable The readable to consume
 * @returns The contents in the stream as either an individual element or array
 */
export async function consumeStream(
  readable: Readable,
): Promise<unknown[] | unknown> {
  if (readable.readableObjectMode) {
    const obj: unknown[] = []
    for await (const o of readable) {
      obj.push(o)
    }

    return obj.length === 1 ? obj[0] : obj
  }

  return consumeString(readable)
}

/**
 * Drains the readable
 *
 * @param readable The {@link Readable} to ensure we drain
 */
export async function drain(readable: Readable): Promise<void> {
  for await (const _ of readable) {
    /* Just drain, don't consume anything */
  }
}

const STREAM_LOGGER = new DefaultLogger({
  name: "stream",
})

export interface ParallelWritableOptions {
  maxConcurrency?: number
}

const DEFAULT_WAIT = Duration.ofMilli(250)

export class ParallelWritable<T> extends Writable {
  private _semaphore: Semaphore
  private _onFinal: Optional<StreamCallback>
  private _consume: Consumer<T>

  constructor(consumer: Consumer<T>, options?: ParallelWritableOptions) {
    super({
      objectMode: true,
      autoDestroy: true,
      emitClose: true,
      highWaterMark: options?.maxConcurrency,
      final: (cb) => {
        this._onFinal = cb
        this._checkFinal()
      },
    })

    this._consume = consumer
    this._semaphore = new Semaphore(
      options?.maxConcurrency ?? this.writableHighWaterMark,
    )
  }

  private _checkFinal(): void {
    if (this._onFinal && this._semaphore.running === 0) {
      this._onFinal()
      this._onFinal = undefined
    }
  }

  override async _write(
    chunk: T,
    _encoding: BufferEncoding,
    callback: StreamCallback,
  ): Promise<void> {
    while (!(await this._semaphore.acquire(DEFAULT_WAIT))) {
      if (this.errored) {
        return callback()
      }
    }

    callback()
    try {
      await this._consume(chunk)
    } catch (err) {
      this.emit(
        "error",
        err instanceof Error
          ? err
          : new Error("uncaught exception in writer", { cause: err }),
      )
    } finally {
      this._checkFinal()
      this._semaphore.release()
    }
  }
}

/**
 * Pipes the source to the destination while handling errors
 *
 * @param source The {@link Readable} to pipe from
 * @param destination The destination to pipe to
 * @param onError The error behavior
 *
 * @returns The destination end of the pipe
 */
export function pipe<T extends Writable | Duplex>(
  source: Readable,
  destination: T,
  onError: "propogate" | "suppress" = "propogate",
): T {
  switch (onError) {
    case "propogate":
      return source
        .on("error", (err) => {
          STREAM_LOGGER.error(`Stream error: ${err}, propogating...`)
          destination.emit("error", err)
        })
        .pipe(destination) as T
    case "suppress":
      return source
        .on("error", (err) => {
          STREAM_LOGGER.error(`Stream error: ${err}, suppressing`)
        })
        .pipe(destination) as T
  }
}

type PriorityTransform<T> = (workload: T) => FrameworkPriority

/** Limit exposed transform options */
type RESTRICTED_TRANSFORM_OPTIONS =
  | "flush"
  | "final"
  | "transform"
  | "construct"
  | "read"
  | "write"
  | "objectMode" // This is always true

export interface PrioritizationOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tasktimeoutMs: Func<any, number>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prioritize: PriorityTransform<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cancellation: Consumer<any>
}

interface NamedTransformStreamOptions {
  /** the name of the transform */
  name?: string
  /** The concurrency mode (default is Serial) */
  mode?: StreamConcurrencyMode
  /** The maximum concurrency (default is highWaterMark / 2) */
  maxConcurrency?: number
  /** A callback for when backpressure is detected */
  onBackpressure?: EmptyCallback
  /** The timeout for tasks that aren't picked up (default is 50) */
  priority?: PrioritizationOptions
}

export interface NamedTransformOptions
  extends Omit<TransformOptions, RESTRICTED_TRANSFORM_OPTIONS>,
    NamedTransformStreamOptions {}

/**
 * Controls {@link NamedTransform} runtime concurrency behavior
 */
export enum StreamConcurrencyMode {
  /** Only run one operation at a time */
  Serial,
  /** Run multiple operations simultaneously */
  Parallel,
  /** Limit outstanding operations to a capped concurrency value */
  FixedConcurrency,
  /** Limit outstanding and use a priority assignment to choose the next work */
  PriorityFixed,
}

/**
 * Interface with useful values for tracking
 */
export interface NamedTransform {
  name: string
  readonly readableLength: number
  readonly writableLength: number
}

export function isNamedTransform(
  transform: unknown,
): transform is NamedTransform {
  return (
    typeof transform === "object" &&
    transform !== null &&
    "name" in transform &&
    typeof transform.name === "string" &&
    "readableLength" in transform &&
    "writableLength" in transform
  )
}

/**
 * Creates a {@link NamedTransform} from a given {@link TransformFunc}
 *
 * @param transform The {@link TransformFunc} to use
 * @param options The optional {@link NamedTransformOptions} for controlling behavior
 *
 * @returns A {@link NamedTransform}
 */
export const createNamedTransform = <T, U>(
  transform: TransformFunc<T, U>,
  options?: NamedTransformOptions,
): Transform => {
  // Check the options
  if (options) {
    switch (options.mode ?? StreamConcurrencyMode.Serial) {
      case StreamConcurrencyMode.Parallel:
        return new ParallelNamedTransform(transform, options)
      case StreamConcurrencyMode.FixedConcurrency:
        return new FixedConcurrencyNamedTransform(transform, options)
      case StreamConcurrencyMode.PriorityFixed:
        return options.priority
          ? new FixedPriorityNamedTransform(
              transform,
              options.priority,
              options,
            )
          : new FixedConcurrencyNamedTransform(transform, options)
    }
  }

  return new SerialNamedTransform(transform)
}

// Unlocked transform options
interface FullNamedTransformOptions
  extends TransformOptions,
    NamedTransformStreamOptions {}

/**
 * Simple base class to ensure we extract naming and implement the interface
 */
abstract class AbstractNamedTransform<T, U>
  extends Stream.Transform
  implements NamedTransform
{
  protected _applyTransform: TransformFunc<T, U>
  readonly name: string

  constructor(
    transform: TransformFunc<T, U>,
    options?: FullNamedTransformOptions,
  ) {
    super({
      ...options,
      objectMode: true,
      emitClose: true,
      autoDestroy: true,
    })
    this._applyTransform = transform
    this.name = options?.name ?? v4()

    // Check for need to bind backpressure monitoring
    if (options?.onBackpressure) {
      // Hijack the hook and add the backpressure
      const push = this.push.bind(this)
      const backpressure = options.onBackpressure

      // Monkey patch
      this.push = (chunk, encoding) => {
        if (!push(chunk, encoding)) {
          backpressure()
          return false
        }
        return true
      }
    }
  }
}

/**
 * Simple class that applies the function in serial
 */
class SerialNamedTransform<T, U> extends AbstractNamedTransform<T, U> {
  constructor(transform: TransformFunc<T, U>, options?: NamedTransformOptions) {
    super(transform, options)
  }

  // Just process these one at a time
  override async _transform(
    chunk: T,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): Promise<void> {
    try {
      callback(undefined, await this._applyTransform(chunk))
    } catch (err) {
      callback(err as Error)
    }
  }
}

/**
 *
 */
class ParallelNamedTransform<T, U> extends AbstractNamedTransform<T, U> {
  private _semaphore: Semaphore
  private finishCallback?: StreamCallback

  constructor(
    transform: TransformFunc<T, U>,
    options?: NamedTransformStreamOptions,
  ) {
    super(transform, {
      ...options,
      final: (cb: StreamCallback) => {
        this.finishCallback = cb
        return this._checkFinal()
      },
    })

    const maxConcurrency =
      options?.maxConcurrency ?? Math.max(1, this.writableHighWaterMark >> 1)
    this._semaphore = new Semaphore(maxConcurrency)
  }

  private _checkFinal(): void {
    if (this.finishCallback && this._semaphore.running === 0) {
      // End the stream
      this.push(null)

      // Invoke the callback
      this.finishCallback()
      this.finishCallback = undefined
    }
  }

  override async _transform(
    chunk: T,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): Promise<void> {
    // Try to get the semaphore but don't wait forever...
    while (!(await this._semaphore.acquire(Duration.ofMilli(500)))) {
      // Stream needs to stop, get out
      if (this.errored) {
        return callback()
      }
    }

    // Unlock further execution and don't wait for this result
    callback()

    try {
      // Get the result and push it
      const result = await this._applyTransform(chunk)
      if (result !== undefined) {
        this.push(result)
      }
    } catch (err) {
      this.emit("error", err)
    } finally {
      // MUST release this or everything will lock up
      this._semaphore.release()

      // Check if this was a final since the execution is potentially after the
      // last callback
      this._checkFinal()
    }
  }
}

class FixedConcurrencyNamedTransform<T, U> extends AbstractNamedTransform<
  T,
  U
> {
  private _semaphore: Semaphore
  private finishCallback?: StreamCallback

  constructor(transform: TransformFunc<T, U>, options?: NamedTransformOptions) {
    super(transform, {
      ...options,
      final: (cb: StreamCallback) => {
        this.finishCallback = cb
        this._checkFinal()
      },
    })

    const maxConcurrency =
      options?.maxConcurrency ?? Math.max(1, this.writableHighWaterMark >> 1)
    this._semaphore = new Semaphore(maxConcurrency)

    /**
     * This is really kind of an ugly hack but for now is working....
     *
     * Basically, letting something run a bunch of work in parallel can allow a
     * critical amount of readHighWatermark to build up because there is no gate
     * to stop this.  To ensure that we don't let too much work get propogated
     * to the other side, we don't unlock the semaphore until it is consumed.
     * This can happen in two ways:
     *
     * 1. The pipeline pulls it via a read() call
     * 2. The pipeline publishes it from the 'data' event
     *
     * We can't hook the first side of this because it is only called to
     * initiate reading on the `readable` event firing and misses A LOT of
     * events, draining the semaphore and griding the pipeline to a halt.
     *
     * Instead, we hook the data event because it is ALWAYS published (at least
     * through the stream implementations to date) and while it might not be the
     * value used (you can't manipulate it either way honestly) then we can
     * listen to this event since the read or the iterator paths in flow, etc.
     * internally still fire this for every item to allow secondary introspection.
     */
    this.on("data", (_) => {
      // Release a semaphore lease on data publish
      this._semaphore.release()

      // We need to check final here as well because all writes may be done
      // and we are gating on the read path at a later consumption point
      this._checkFinal()
    })
  }

  private _checkFinal(): void {
    // Check if the final callback was passed along and our semaphore is drained
    if (this.finishCallback && this._semaphore.running === 0) {
      // End the stream
      this.push(null)

      // Invoke the callback
      this.finishCallback()
      this.finishCallback = undefined
    }
  }

  override async _transform(
    chunk: T,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): Promise<void> {
    // Try to get the semaphore but don't wait forever...
    while (!(await this._semaphore.acquire(Duration.ofMilli(500)))) {
      // Stream needs to stop, get out
      if (this.errored) {
        return callback()
      }
    }

    // Unlock further execution and don't wait for this result
    callback()

    try {
      // Get the result and push it
      const result = await this._applyTransform(chunk)
      if (result !== undefined) {
        this.push(result)
      } else {
        // We have to release when there is no data published to prevent exhaustion
        this._semaphore.release()
      }
    } catch (err) {
      this.emit("error", err)
    } finally {
      // Check if this was a final since the execution is potentially after the
      // last callback if there is no data forwarded to the `data` event
      this._checkFinal()
    }
  }
}

/**
 * Allows a fixed number of tasks to be executing at any time while enforcing
 * priority on the workload based on a {@link PriorityTransform} passed to the constructor
 */
class FixedPriorityNamedTransform<T, U> extends AbstractNamedTransform<T, U> {
  private _prioritize: PriorityTransform<T>
  private _queue: MultiLevelPriorityQueue
  private _semaphore: Semaphore
  private finishCallback?: StreamCallback
  private _timeout: (obj: T) => number
  private _cancel: Consumer<T>
  private _signal: Signal = new Signal() // Need to fire this on read/cancel to keep down hwm

  constructor(
    transform: TransformFunc<T, U>,
    priority: PrioritizationOptions,
    options?: NamedTransformOptions,
  ) {
    super(transform, {
      ...options,
      autoDestroy: true, // We must automatically destroy to release MLPQ resources
      final: (cb: StreamCallback) => {
        this.finishCallback = cb
        this._checkFinal()
      },
    })

    this._prioritize = priority.prioritize
    this._cancel = priority.cancellation
    this._queue = new DefaultMultiLevelPriorityQueue()

    const maxConcurrency =
      options?.maxConcurrency ?? Math.max(1, this.writableHighWaterMark >> 1)
    this._semaphore = new Semaphore(maxConcurrency)

    this._timeout = priority.tasktimeoutMs

    this.on("data", () => {
      // Release the current
      this._semaphore.release()

      // Queue any next work
      this._queueNext()
    })
  }

  override async _destroy(
    error: Error | null,
    callback: StreamCallback,
  ): Promise<void> {
    // Stop the queue
    await this._queue.shutdown()

    return callback(error)
  }

  private async _queueNext(): Promise<void> {
    if (this._queue.size > 0) {
      await this._semaphore.acquire()

      const work = this._queue.next()
      if (work !== undefined) {
        try {
          const res = await work
          if (res !== undefined) {
            // Work was removed, notify
            this._signal.notify()

            // Push the results
            this.push(res)
          } else {
            this._semaphore.release()
          }
        } catch (err) {
          this.emit("error", err)
        }
      } else {
        this._semaphore.release()
      }
    }

    // Check if we are done
    this._checkFinal()
  }

  override async _transform(
    chunk: T,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): Promise<void> {
    const priority = this._prioritize(chunk)

    this._queue.queue(
      {
        priority: asTaskPriority(priority),
        timeout: Duration.ofMilli(this._timeout(chunk)),
        cancel: () => {
          // Notify anyone waiting there is new space
          this._signal.notify()

          // Check if we are done
          this._checkFinal()

          // Cancel the chunk of work
          this._cancel(chunk)
        },
      },
      async () => {
        try {
          return await this._applyTransform(chunk)
        } catch (err) {
          this.emit("error", err)
        }

        return
      },
    )

    // Try to queue more work
    this._queueNext()

    return callback()
  }

  private _checkFinal(): void {
    // Check if the final callback was passed along and our semaphore is drained
    if (
      this.finishCallback &&
      this._semaphore.running === 0 &&
      this._queue.size === 0
    ) {
      // End the stream
      this.push(null)

      // Stop our queue
      this._queue.shutdown()

      // Invoke the callback
      this.finishCallback()
      this.finishCallback = undefined
    }
  }
}
