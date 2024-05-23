/**
 * Types of transforms that can be managed in a pipeline
 */

import { Transform, type TransformCallback } from "stream"
import { vegasBuilder } from "../backpressure/algorithms.js"
import {
  createSimpleLimiter,
  type LimitedOperation,
  type Limiter,
} from "../backpressure/limits.js"
import { Semaphore } from "../concurrency.js"
import type { Emitter } from "../events.js"
import type { MaybeAwaitable } from "../index.js"
import type { StreamCallback } from "../streams.js"
import type { TaskCompletionEvents } from "../tasks.js"
import { Duration } from "../time.js"
import type { Optional } from "../type/utils.js"

export interface ConcurrentTransformConfig {
  highWaterMark?: number
  maxConcurrency?: number
}

export interface ConcurrentTransformEvents {
  backpressure: () => void
}

export type BasicTransform<T> = (value: T) => MaybeAwaitable<unknown>

export class DynamicConcurrencyTransform<
  T extends Emitter<TaskCompletionEvents>,
> extends Transform {
  private _finalCallback?: StreamCallback
  private transform: BasicTransform<T>
  private _limiter: Limiter
  private _running: number

  get limit(): number {
    return this._limiter.limit
  }

  constructor(
    transform: BasicTransform<T>,
    options?: ConcurrentTransformConfig,
  ) {
    super({
      ...options,
      objectMode: true,
      final: (callback: StreamCallback) => {
        this._finalCallback = callback
        this._checkFinal()
      },
    })

    const maxConcurrency = options?.maxConcurrency ?? this.readableHighWaterMark

    this._limiter = createSimpleLimiter(
      vegasBuilder(maxConcurrency).withMax(maxConcurrency).build(),
      maxConcurrency,
    )

    this._running = 0
    this.transform = transform
  }

  override async _transform(
    chunk: T,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): Promise<void> {
    let operation: Optional<LimitedOperation>
    while (
      (operation = await this._limiter.acquire(Duration.ofMilli(250))) ===
      undefined
    ) {
      if (this.errored) {
        return callback()
      }
    }

    // Let in more work
    callback()
    this._running++

    // If this doesn't fire then we will never release...
    chunk.on("completed", (_, success) => {
      this._running--
      if (success) {
        operation.success()
      } else {
        operation.dropped()
      }
      this._checkFinal()
    })

    try {
      const result = await this.transform(chunk)
      if (result !== undefined) {
        this.push(result)
      }
    } catch (err) {
      // All we can do is emit the error
      this.emit(
        "error",
        err instanceof Error
          ? err
          : new Error(`Unhandled error in transform ${err}`, { cause: err }),
      )
    } finally {
      this._checkFinal()
    }
  }

  override push(
    chunk: unknown,
    encoding?: BufferEncoding | undefined,
  ): boolean {
    // We hook this value so we can properly track backpressure
    const value = super.push(chunk, encoding)
    if (value) {
      this.emit("backpressure")
    }
    return value
  }

  /**
   * Private cleanup to delay final invocation until outstanding work is complete
   */
  private _checkFinal(): void {
    if (this._finalCallback && this._running === 0) {
      this._finalCallback()
      this._finalCallback = undefined
    }
  }
}

/**
 * A simple transform that uses a fixed concurrency value when processing data
 */
export class FixedConcurrencyTransform<T> extends Transform {
  private _finalCallback?: StreamCallback
  private _semaphore: Semaphore
  private transform: BasicTransform<T>

  constructor(
    transform: BasicTransform<T>,
    options?: ConcurrentTransformConfig,
  ) {
    super({
      ...options,
      objectMode: true,
      final: (callback: StreamCallback) => {
        this._finalCallback = callback
        this._checkFinal()
      },
    })

    this._semaphore = new Semaphore(
      options?.maxConcurrency ?? this.readableHighWaterMark,
    )
    this.transform = transform
  }

  override push(
    chunk: unknown,
    encoding?: BufferEncoding | undefined,
  ): boolean {
    // We hook this value so we can properly track backpressure
    const value = super.push(chunk, encoding)
    if (value) {
      this.emit("backpressure")
    }
    return value
  }

  override _construct(callback: StreamCallback): void {
    /**
     * We hook this event since it is fired in all modes and we need to block
     * until reads happen for concurrency otherwise we can flood the readable
     * buffer with data and cause extremely unfortunate memory pressure.  This
     * is mostly safe to do since breaking this hook would undermine a lot of
     * other stream features which Node is reluctant to do.
     */
    this.on("data", (_) => {
      this._semaphore.release()
      this._checkFinal()
    })

    return callback()
  }

  override async _transform(
    value: T,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): Promise<void> {
    // Wait until we get a signal or there is an error
    while (!(await this._semaphore.acquire(Duration.ofMilli(250)))) {
      if (this.errored) {
        return callback()
      }
    }

    // Let in more work immediately
    callback()

    try {
      // This may or may not be async
      const result = await this.transform(value)

      // Push and non-undefined values
      if (result !== undefined) {
        this.push(result)
      }
    } catch (err) {
      // All we can do is emit the error
      this.emit(
        "error",
        err instanceof Error
          ? err
          : new Error(`Unhandled error in transform ${err}`, { cause: err }),
      )
    } finally {
      this._checkFinal()
    }
  }

  /**
   * Private cleanup to delay final invocation until outstanding work is complete
   */
  private _checkFinal(): void {
    if (this._finalCallback && this._semaphore.running === 0) {
      this._finalCallback()
      this._finalCallback = undefined
    }
  }
}
