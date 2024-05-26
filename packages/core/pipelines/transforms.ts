/**
 * Types of transforms that can be managed in a pipeline
 */

import {
  ValueType,
  type Attributes,
  type ObservableCallback,
} from "@opentelemetry/api"
import { Transform, type TransformCallback } from "stream"
import { Semaphore } from "../concurrency.js"
import type { Emitter } from "../events.js"
import { type MaybeAwaitable } from "../index.js"
import { getGranadaMeter } from "../observability/metrics.js"
import type { StreamCallback } from "../streams.js"
import type { TaskCompletionEvents } from "../tasks.js"
import { Duration, Timestamp } from "../time.js"

export interface ConcurrentTransformConfig {
  highWaterMark?: number
  maxConcurrency?: number
  algorithm: "vegas" | "adapative"
}

export interface ConcurrentTransformEvents {
  backpressure: () => void
}

export type BasicTransform<T> = (value: T) => MaybeAwaitable<unknown>

const DynamicMetrics = {
  Backpressure: getGranadaMeter().createCounter("dynamic_backpressure", {
    description: "number of backpressure events",
    valueType: ValueType.INT,
  }),
  Concurrency: getGranadaMeter().createObservableGauge("dynamic_concurrency", {
    description: "The current concurrency value",
    valueType: ValueType.INT,
  }),
  TransformTime: getGranadaMeter().createHistogram("dynamic_transform", {
    description: "The time to transform",
    valueType: ValueType.DOUBLE,
    unit: "seconds",
    advice: {
      explicitBucketBoundaries: [
        0.0005, 0.001, 0.002, 0.005, 0.01, 0.015, 0.025, 0.05, 0.075, 0.1,
      ],
    },
  }),
  ReadTime: getGranadaMeter().createHistogram("dynamic_read", {
    description: "The time to read after write",
    valueType: ValueType.DOUBLE,
    unit: "seconds",
    advice: {
      explicitBucketBoundaries: [
        0.0005, 0.001, 0.002, 0.005, 0.01, 0.015, 0.025, 0.05, 0.075, 0.1,
      ],
    },
  }),
} as const

interface Tracking {
  created: Timestamp
  backpressure: boolean
}

export class DynamicConcurrencyTransform<
  T extends Emitter<TaskCompletionEvents>,
> extends Transform {
  private _finalCallback?: StreamCallback
  private transform: BasicTransform<T>
  // private _limiter: Limiter
  private _semaphore: Semaphore
  private _val: number
  // private _running: number
  private _timeout: NodeJS.Timeout
  private _observer: ObservableCallback<Attributes>
  private _tracking: Tracking[] = []

  get limit(): number {
    return this._semaphore.limit
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
    this._semaphore = new Semaphore(1)
    this._val = 1

    // Continue going up and down every 15 seconds
    this._timeout = setInterval(() => {
      if (this._semaphore.limit === maxConcurrency) {
        this._val = -1
      } else if (this._semaphore.limit === 1) {
        this._val = 1
      }

      this._semaphore.resize(this._semaphore.limit + this._val)
    }, 15_000)

    this._observer = (observer) => {
      observer.observe(this._semaphore.limit)
    }

    DynamicMetrics.Concurrency.addCallback(this._observer.bind(this))

    // this._running = 0
    this.transform = transform

    this.on("data", (_) => {
      const tracking = this._tracking.shift()
      if (tracking) {
        DynamicMetrics.ReadTime.record(tracking.created.duration.seconds())
        DynamicMetrics.Backpressure.add(tracking.backpressure ? 1 : 0)
      }
      this._checkFinal()
    })
  }

  override async _transform(
    chunk: T,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): Promise<void> {
    while (!(await this._semaphore.acquire(Duration.ofMilli(250)))) {
      if (this.errored) {
        return callback()
      }
    }

    try {
      const started = Timestamp.now()
      const result = await this.transform(chunk)
      DynamicMetrics.TransformTime.record(started.duration.seconds())

      if (result !== undefined) {
        this._tracking.push({
          created: Timestamp.now(),
          backpressure: this.push(result),
        })
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
      clearInterval(this._timeout)
      DynamicMetrics.Concurrency.removeCallback(this._observer.bind(this))
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
