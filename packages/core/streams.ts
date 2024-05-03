import {
  Stream,
  TransformCallback,
  type Duplex,
  type Readable,
  type TransformOptions,
  type Writable,
} from "stream"
import { DeferredPromise, MaybeAwaitable } from "./index.js"
import type { Optional } from "./type/utils.js"

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
          destination.emit("error", err)
        })
        .pipe(destination) as T
    case "suppress":
      return source.on("error", (_) => {}).pipe(destination) as T
  }
}

/**
 * Creates a {@link GenericTransform} from a given {@link TransformFunc}
 *
 * @param transform The {@link TransformFunc} to use
 * @param spanExtractor The optional function to extract the {@link Span} for tracing
 * @returns A {@link GenericTransform}
 */
export const createTransform = <T, U>(
  transform: TransformFunc<T, U>,
): GenericTransform<T, U> =>
  new GenericTransform(transform, { objectMode: true, autoDestroy: true })

/**
 * Create a generic {@link Stream.Transform} using a {@link TransformFunc}
 */
export class GenericTransform<T, U> extends Stream.Transform {
  private transform: TransformFunc<T, U>

  constructor(transform: TransformFunc<T, U>, options: TransformOptions) {
    super(options)
    this.transform = transform
  }

  /**
   * Implements the {@link Stream.Transform} with typed values
   *
   * @param chunk The chunk of data to transform
   * @param _encoding Ignored since we are always in object mode
   * @param callback The callback to fire on completion
   */
  override async _transform(
    chunk: T,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): Promise<void> {
    try {
      // Invoke the transform
      const val = await this.transform(chunk)
      if (val !== undefined) {
        // Ensure we push or wait for backpressure to clear
        while (!this.push(val)) {
          await this._waitForBackpressure()
        }
      }
      callback()
    } catch (err) {
      callback(err as Error, chunk)
    }
  }

  /**
   * Wait for backpressure to clear
   *
   * @returns A {@link Promise} that will resolve when backpressure has cleared
   */
  private async _waitForBackpressure(): Promise<void> {
    const deferred = new DeferredPromise()
    this.once("drain", () => {
      this.removeListener("error", deferred.reject)
      deferred.resolve()
    }).once("error", deferred.reject)
    return deferred
  }
}
