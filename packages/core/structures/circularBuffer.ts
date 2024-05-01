/**
 * Package contains a definition for a circular buffer
 */

import { Signal } from "../concurrency.js"
import { Duration } from "../time.js"
import type { Optional } from "../type/utils.js"

/**
 * Represents a circular buffer that uses fixed memory space to provide an "infinite" set of values.
 *
 * NOTE: This is different than a stream mainly due to the fact that it expects multiple producers and
 * consumers.  While this is technically possible to represent with a stream, the semantics and runtime
 * behavior aren't necessarily desirable and I believe this makes for a better mental model.
 */
export interface CircularBuffer<T> extends AsyncIterable<T> {
  /** The amount of space currently remaining */
  available: number
  /** The total size of the allocated buffer */
  size: number
  /** Tracks if the buffer has been closed and will not accept new values */
  closed: boolean
  /** Tracks if the buffer is closed and has no more data */
  finished: boolean

  /**
   * Tries to immediately add to the buffer without waiting for space to free up
   *
   * @param value The value to try to add
   * @returns True if the value was added
   */
  tryAdd(value: T): boolean

  /**
   * Tries to add as many values to the buffer without waiting for space to free up as possible
   *
   * @param values The values to try to add
   * @returns The number of elements that were added
   */
  tryAddRange(values: T[]): number

  /**
   * Adds the value to the buffer, waiting until the timeout expires or the element is added
   *
   * @param value The value to add
   * @param timeout The maximum amount of time to wait
   *
   * @returns A promise that will fire when the operation has completed or timed out
   */
  add(value: T, timeout?: Duration): Promise<boolean>

  /**
   * Adds the values provided (at least minValues if provided), waiting until the timeout expires or the elements were added
   * @param values The values to add
   * @param minValues The minimum number of values to add to qualify for success
   * @param timeout The maximum amount of time to wait
   *
   * @returns A promise that will fire when the operation has completed or timed out
   */
  addRange(values: T[], minValues?: number, timeout?: Duration): Promise<number>

  /**
   * Tries to read the next value from the buffer
   *
   * @returns An {@link Optional} value of T
   */
  tryRemove(): Optional<T>

  /**
   * Tries to read the next `maxValues` off the buffer
   *
   * @param maxValues The maximum number of values to read
   *
   * @returns An array of values that were read
   */
  tryRemoveRange(maxValues: number): T[]

  /**
   * Tries to read the next value from the buffer, waiting until the timeout expires or the element is available
   *
   * @param timeout The maximum amount of time to wait
   *
   * @returns A promise that will fire when the operation has completed or timed out
   */
  remove(timeout?: Duration): Promise<Optional<T>>

  /**
   * Tries to read the next `maxValues` from the buffer, waiting until the timeout expires or `minValues` were available
   *
   * @param minValues The minimum number of values to qualify for a full read
   * @param maxValues The maximum number of values to read
   * @param timeout The maximum amount of time to wait
   *
   * @returns A promise tha twill fire when at least `minValues` has been read or the operation timed out
   */
  removeRange(
    minValues: number,
    maxValues?: number,
    timeout?: Duration,
  ): Promise<T[]>

  /**
   * Closes the buffer, rejecting any further writes
   */
  close(): void
}

/**
 * Create an {@link AsyncIterator} from the given {@link CircularBuffer}
 *
 * @param buffer The {@link CircularBuffer} to create an {@link AsyncIterator} from
 */
export async function* createIterator<T>(
  buffer: CircularBuffer<T>,
): AsyncIterator<T, void, never> {
  // Keep reading values from the buffer until it has completed
  while (!buffer.finished) {
    const val = await buffer.remove()
    if (val !== undefined) {
      yield val
    }
  }

  return
}

/**
 * Options for initializing a {@link CircularArrayBuffer}
 */
export interface CircularArrayBufferOptions {
  /** Sets the maximum number of pending elements */
  highWaterMark?: number
}

/**
 * Class that implements the {@link CircularBuffer} interface, using fixed memory space allocated in powers of 2.
 *
 * NOTE: Providing a highWaterMark of 1025 will result in a buffer of 2048 items since that is a power of 2 that fits 1025...
 */
export class CircularArrayBuffer<T> implements CircularBuffer<T> {
  // Pointers and state
  _head = 0
  _tail = 0
  _size = 0
  _closed = false

  _capacity: number

  // Read/Write signals
  _readSignal = new Signal()
  writeSignal = new Signal()

  // Buffer management
  readonly _MASK: number
  readonly _buffer: T[]

  constructor(options: CircularArrayBufferOptions) {
    // Clamp the highWaterMark to a value >= 2
    this._capacity = Math.max(options.highWaterMark ?? 1024, 2)

    // Find the size of the buffer that will hold this amount of data
    const bufferSize = 1 << (32 - Math.clz32(this._capacity))

    // Get the bitmask for doing fast wrap around without division
    this._MASK = bufferSize - 1

    // Fill the buffer with a lot of nothing
    this._buffer = Array(bufferSize) as T[]
  }

  [Symbol.asyncIterator](): AsyncIterator<T, void, undefined> {
    return createIterator(this)
  }

  get available(): number {
    return this._capacity - this._size
  }

  get size(): number {
    return this._size
  }

  get closed(): boolean {
    return this._closed
  }

  get finished(): boolean {
    return this._closed && this._size === 0
  }

  tryAdd(value: T): boolean {
    // Verify we have enough space
    if (this.available > 0) {
      this._buffer[this._head++] = value
      this._head &= this._MASK
      this._size++

      // Notify pending writers there is more data
      this.writeSignal.notify()

      return true
    }

    return false
  }

  tryAddRange(values: T[]): number {
    // If there is room, add what we can
    if (this.available > 0 && values.length > 0) {
      let rem = Math.min(this.available, values.length)
      let idx = 0
      // Keep adding until the remainder is 0
      // TODO: Probably a faster way to do this, but fine for now to walk the arrays
      while (rem-- > 0) {
        this._buffer[this._head++] = values[idx++]
        this._head &= this._MASK
        this._size++
      }

      // Notify pending writers there is more data
      this.writeSignal.notify()

      return idx
    }

    return 0
  }

  async add(value: T, timeout?: Duration): Promise<boolean> {
    // Check if there is something available
    while (this.available === 0) {
      // Try to see if we can became unblocked before the timeout
      if (this._closed || !(await this._readSignal.wait(timeout))) {
        return false
      }
    }

    // Add it to the buffer and return success
    this._buffer[this._head++] = value
    this._head &= this._MASK
    this._size++

    // Notify pending writers there is more data
    this.writeSignal.notify()
    return true
  }

  async addRange(
    values: T[],
    minValues?: number,
    timeout?: Duration,
  ): Promise<number> {
    // We can't add more values that the size of our array...
    if (minValues !== undefined && minValues > this._capacity) {
      return 0
    }

    // Try to establish an expiration if one was passed
    // Hopefully people don't wait forever but that's not a framework problem to enforce "reasonable" waits
    const expiration =
      timeout !== undefined
        ? Date.now() + timeout.milliseconds()
        : Number.MAX_VALUE

    // Try to wait for the amount of space we need to show up
    while (this.available < (minValues ?? 1)) {
      if (
        this._closed ||
        !(await this._readSignal.wait(
          expiration !== Number.MAX_VALUE
            ? Duration.ofMilli(Math.max(1, Date.now() - expiration))
            : undefined,
        ))
      ) {
        // Nope
        return 0
      }
    }

    // Load all the values into the buffer
    let rem = Math.max(this.available, minValues ?? 1)
    let idx = 0
    while (rem-- > 0) {
      this._buffer[this._head++] = values[idx++]
      this._head &= this._MASK
      this._size++
    }

    // Notify pending writers there is more data
    this.writeSignal.notify()

    return idx
  }

  tryRemove(): Optional<T> {
    // Check size
    if (this._size === 0) {
      return undefined
    }

    // Get the next item
    const ret = this._buffer[this._tail++]
    this._tail &= this._MASK
    this._size--

    // Notify pending readers there is more room
    this._readSignal.notify()

    return ret
  }

  tryRemoveRange(maxValues: number): T[] {
    // Check size
    if (this._size === 0) {
      return []
    }

    // Clamp at maxValues or current size
    let rem = Math.min(maxValues, this._size)

    // Add the values to the return array
    const ret: T[] = []
    while (rem-- > 0) {
      ret.push(this._buffer[this._tail++])
      this._tail &= this._MASK
      this._size--
    }

    // Notify pending readers there is more room
    this._readSignal.notify()

    return ret
  }

  async remove(timeout?: Duration): Promise<Optional<T>> {
    while (this._size == 0) {
      // If we are closed or can't read, abandon
      if (this._closed || !(await this.writeSignal.wait(timeout))) {
        return undefined
      }
    }

    // Get the next item
    const ret = this._buffer[this._tail++]
    this._tail &= this._MASK
    this._size--

    // Notify pending readers there is more room
    this._readSignal.notify()

    return ret
  }

  async removeRange(
    minValues: number,
    maxValues?: number,
    timeout?: Duration,
  ): Promise<T[]> {
    // Try to establish an expiration if one was passed
    // Hopefully people don't wait forever but that's not a framework problem to enforce "reasonable" waits
    const expiration =
      timeout !== undefined
        ? Date.now() + timeout.milliseconds()
        : Number.MAX_VALUE

    // Try to wait for the amount of space we need to show up
    while (!this._closed && this._size < (minValues ?? 1)) {
      if (
        !(await this._readSignal.wait(
          expiration !== Number.MAX_VALUE
            ? Duration.ofMilli(Math.max(1, Date.now() - expiration))
            : undefined,
        ))
      ) {
        // Nope
        return []
      }
    }

    // Clamp at maxValues or current size
    let rem = Math.min(maxValues ?? minValues ?? this._size, this._size)

    // Add the values to the return array
    // TODO: Better to pre-allocate?
    const ret: T[] = []
    while (rem-- > 0) {
      ret.push(this._buffer[this._tail++])
      this._tail &= this._MASK
      this._size--
    }

    // Notify pending readers there is more room
    this._readSignal.notify()

    return ret
  }

  close(): void {
    this._closed = true

    this.writeSignal.notifyAll()
    this._readSignal.notifyAll()
  }
}
