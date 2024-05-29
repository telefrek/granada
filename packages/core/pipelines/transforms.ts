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
import { info } from "../logging.js"
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
  Stats: getGranadaMeter().createObservableGauge("dynamic_stats", {
    description: "The current dynamic stats value",
    valueType: ValueType.INT,
  }),
  TransformTime: getGranadaMeter().createHistogram("dynamic_transform", {
    description: "The time to transform",
    valueType: ValueType.DOUBLE,
    unit: "seconds",
    advice: {
      explicitBucketBoundaries: [
        0.0005, 0.001, 0.0015, 0.002, 0.0025, 0.005, 0.0075, 0.01, 0.0125,
        0.015, 0.02, 0.025, 0.05, 0.075, 0.1, 0.25,
      ],
    },
  }),
  ReadTime: getGranadaMeter().createHistogram("dynamic_read", {
    description: "The time to read after write",
    valueType: ValueType.DOUBLE,
    unit: "seconds",
    advice: {
      explicitBucketBoundaries: [
        0.0005, 0.001, 0.0015, 0.002, 0.0025, 0.005, 0.0075, 0.01, 0.0125,
        0.015, 0.02, 0.025, 0.05, 0.075, 0.1, 0.25,
      ],
    },
  }),
} as const

interface Range {
  min: number
  max: number
}

enum ControllerState {
  Exploring,
  Stable,
  Initializing,
}

enum Direction {
  Up = 1,
  Down = -1,
}

class DynamicController {
  private readonly _semaphore: Semaphore
  private readonly _range: Range
  private readonly _interval: NodeJS.Timeout
  private readonly _startup: NodeJS.Timeout
  private readonly _variance: number = 0.05

  private _state: ControllerState = ControllerState.Initializing
  private _cnt: number = 0
  private _last: number = 0
  private _hits: number = 0
  private _direction: Direction = Direction.Up

  get state(): ControllerState {
    return this._state
  }

  get semaphore(): Semaphore {
    return this._semaphore
  }

  constructor(range: Range, refreshTime: Duration = Duration.ofSeconds(15)) {
    this._range = range
    this._semaphore = new Semaphore(range.min)

    let check = (last: number): number => {
      this._last = last
      return 0
    }

    // Wait a bit to kick in with logic
    this._startup = setTimeout(() => {
      this._state = ControllerState.Exploring

      check = (throughput: number) => {
        // Don't bother zero throughput
        if (throughput === 0) {
          return 0
        }

        let adjustment = 0
        const diff = throughput - this._last
        const trigger = this._variance * this._last
        this._hits++

        // TODO: Direction shifts when exploring need to be biased towards
        // staying/shrinking below some threshold....
        if (
          this._state === ControllerState.Exploring ||
          Math.abs(diff) > trigger
        ) {
          info(
            `Exploring ${diff} [${this._variance * this._last}] (${this._semaphore.limit})`,
          )
          if (this._state === ControllerState.Stable) {
            // Bias towards down unless we hit a wall...
            this._state = ControllerState.Exploring
            this._direction = Direction.Down
            this._hits = 0
          } else if (diff < 0 && Math.abs(diff) > this._last * 0.025) {
            // went down more than a little, switch directions
            this._direction = this._direction ^ 0xfffffffe
          }

          adjustment =
            this._direction + this._semaphore.limit < this._range.min ||
            this._direction + this._semaphore.limit > this._range.max
              ? 0
              : this._direction

          if (adjustment === 0) {
            // Switch directions...
            this._direction = this._direction ^ 0xfffffffe
            adjustment = this._direction
          }
        } else if (this._state !== ControllerState.Stable && this._hits >= 5) {
          this._state = ControllerState.Stable
        } else if (this._hits > 16) {
          this._state = ControllerState.Exploring
          this._hits = 0
        }

        this._last = throughput
        return adjustment
      }
    }, 60_000)

    this._interval = setInterval(() => {
      const current = this._cnt
      this._cnt = 0

      this._semaphore.resize(this._semaphore.limit + check(current))
    }, ~~refreshTime.milliseconds())
  }

  inc(val: number = 1): void {
    this._cnt += val
  }

  close(): void {
    clearInterval(this._interval)
    clearTimeout(this._startup)
  }
}

export class DynamicConcurrencyTransform<
  T extends Emitter<TaskCompletionEvents>,
> extends Transform {
  private _finalCallback?: StreamCallback
  private transform: BasicTransform<T>
  private _controller: DynamicController
  private _semaphore: Semaphore
  private _observer: ObservableCallback<Attributes>
  private _tracking: Timestamp[] = []

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
      autoDestroy: true,
      emitClose: true,
      final: (callback: StreamCallback) => {
        this._finalCallback = callback
        this._checkFinal()
      },
      destroy: (_, callback) => {
        this._controller.close()
        DynamicMetrics.Stats.removeCallback(this._observer.bind(this))
        return callback()
      },
    })

    const maxConcurrency = options?.maxConcurrency ?? this.readableHighWaterMark
    this._controller = new DynamicController({
      min: 2,
      max: maxConcurrency,
    })
    this._semaphore = this._controller.semaphore

    this._observer = (observer) => {
      observer.observe(this._semaphore.limit, { stat: "concurrency" })
      observer.observe(this.readableLength, { stat: "rLen" })
      observer.observe(this.writableLength, { stat: "wLen" })
    }

    DynamicMetrics.Stats.addCallback(this._observer.bind(this))

    // this._running = 0
    this.transform = transform

    this.on("data", (_) => {
      this._semaphore.release()
      this._checkFinal()
      this._controller.inc()

      const tracking = this._tracking.shift()
      if (tracking) {
        DynamicMetrics.ReadTime.record(tracking.duration.seconds())
      }
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

    callback()

    try {
      const started = Timestamp.now()
      const result = await this.transform(chunk)
      DynamicMetrics.TransformTime.record(started.duration.seconds())

      if (result !== undefined) {
        this._tracking.push(Timestamp.now())
        if (!this.push(result)) {
          DynamicMetrics.Backpressure.add(1)
        }
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
      this._controller.close()
      DynamicMetrics.Stats.removeCallback(this._observer.bind(this))
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
