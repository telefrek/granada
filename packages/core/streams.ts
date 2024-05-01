import {
  Stream,
  TransformCallback,
  type Duplex,
  type Readable,
  type TransformOptions,
  type Writable,
} from "stream"
import { MaybeAwaitable } from "./index.js"
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
 * Create a generic {@link Stream.Transform} using a {@link TransformFunc}
 */
export class GenericTransform<T, U> extends Stream.Transform {
  private transform: TransformFunc<T, U>

  constructor(
    transform: TransformFunc<T, U>,
    options: TransformOptions = { objectMode: true, autoDestroy: true },
  ) {
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
      const val = await this.transform(chunk)
      if (val !== undefined) this.push(val)
      callback()
    } catch (err) {
      callback(err as Error, chunk)
    }
  }
}

/**
 * Creates a {@link GenericTransform} from a given {@link TransformFunc}
 *
 * @param transform The {@link TransformFunc} to use
 * @returns A {@link GenericTransform}
 */
export const createTransform = <T, U>(
  transform: TransformFunc<T, U>,
): GenericTransform<T, U> => new GenericTransform(transform)

/**
 * Combines two {@link TransformFunc} into a single {@link TransformFunc}
 *
 * @param left The left {@link TransformFunc} to use
 * @param right The right {@link TransformFunc} to use
 * @returns a new {@link TransformFunc} that combines the left and right sides
 */
export const combineTransforms = <T, U, V>(
  left: TransformFunc<T, U>,
  right: TransformFunc<U, V>,
): TransformFunc<T, V> => {
  return async (data: T) => {
    const intermediate = await left(data)
    return intermediate ? await right(intermediate) : undefined
  }
}
