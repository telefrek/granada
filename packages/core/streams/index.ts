import { Stream, TransformCallback } from "stream"
import { MaybeAwaitable } from ".."

/**
 * Custom type allowing mapping a type through a {@link MaybeAwaitable} to a new value
 */
export type TransformFunc<T, U> = (data: T) => MaybeAwaitable<U | undefined>

/**
 * Create a generic {@link Stream.Transform} using a {@link TransformFunc}
 */
export class GenericTransform<T, U> extends Stream.Transform {
  #transform: TransformFunc<T, U>

  constructor(transform: TransformFunc<T, U>) {
    super({ objectMode: true })
    this.#transform = transform
  }

  /**
   * Implements the {@link Stream.Transform} with typed values
   *
   * @param chunk The chunk of data to transform
   * @param _encoding Ignored since we are always in object mode
   * @param callback The callback to fire on completion
   */
  async _transform(
    chunk: T,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): Promise<void> {
    try {
      const val = await this.#transform(chunk)
      if (val) this.push(val)
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
