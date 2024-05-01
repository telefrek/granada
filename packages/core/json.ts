/**
 * Handles some JSON operations to make life a little easier, still relies on
 * the built-in tooling around JSON parsing which may be revisited later
 */

import { Readable, Transform, type TransformCallback } from "stream"

/**
 * Translates the contents into a {@link Readable} using an iterator if from an array
 *
 * @param contents The contents to translate into a JSON stream
 * @returns A {@link Readable} with the contents
 */
export function streamJson(contents: unknown): Readable {
  return Readable.from(iterateObject(contents), {
    objectMode: false,
    autoDestroy: true,
    emitClose: true,
  })
}

/**
 * Iterate the {@link Readable} objects parsed as JSON
 *
 * @param contents The {@link Readable} to process
 * @returns An {@link AsyncGenerator} that raeds the stream as a collection of objects
 */
export async function* fromJsonStream<T = unknown>(
  contents: Readable,
): AsyncGenerator<T, void, undefined> {
  for await (const obj of contents.pipe(new JsonReadableStream())) {
    yield obj as T
  }

  return
}

/**
 * Helper class to parse objects from an array
 */
class PartialJsonReader {
  private _chunks: string[] = []
  private _remainder: string = ""
  private _counter: number = 0

  parse(chunk: string): boolean {
    let last = 0
    for (let n = 0; n < chunk.length; ++n) {
      if (chunk[n] === "{") {
        this._counter++
      } else if (chunk[n] === "}") {
        if (--this._counter === 0) {
          const objChunk = this._remainder + chunk.substring(last, n + 1)
          this._chunks.push(
            objChunk.startsWith(",")
              ? objChunk.substring(1).trimStart()
              : objChunk,
          )
          this._remainder = ""
          last = n + 1
        }
      }
    }

    if (last < chunk.length) {
      this._remainder += chunk.substring(last)
    }

    return this._chunks.length > 0
  }

  collect(final: boolean = false) {
    const ret = this._chunks
    this._chunks = []

    if (final && this._remainder) {
      // don't add the trailing array end
      if (this._remainder.length > 1) {
        ret.push(this._remainder.slice(0, -1))
      }

      this._remainder = ""
    }

    return ret
  }
}

class JsonReadableStream extends Transform {
  private _mode: "object" | "array" | "unknown" = "unknown"
  private _reader?: PartialJsonReader
  private _contents?: string

  constructor() {
    super({
      objectMode: true,
      emitClose: true,
      autoDestroy: true,
    })
  }

  override _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    try {
      const contents = Buffer.isBuffer(chunk)
        ? chunk.toString(encoding)
        : (chunk as string)

      if (contents) {
        switch (this._mode) {
          case "object":
            this._contents += contents
            break
          case "array":
            if (this._reader?.parse(contents)) {
              for (const obj of this._reader.collect()) {
                this.push(JSON.parse(obj))
              }
            }
            break
          case "unknown":
            this._mode = contents[0] === "[" ? "array" : "object"
            if (this._mode === "array") {
              this._reader = new PartialJsonReader()
              if (this._reader.parse(contents.substring(1))) {
                for (const obj of this._reader.collect()) {
                  this.push(JSON.parse(obj))
                }
              }
            } else {
              this._contents = contents
            }
            break
        }
      }

      callback()
    } catch (err) {
      callback(err as Error)
    }
  }

  override _final(callback: (error?: Error | null | undefined) => void): void {
    try {
      switch (this._mode) {
        case "array":
          for (const obj of this._reader?.collect(true) ?? []) {
            this.push(JSON.parse(obj))
          }
          break
        case "object":
          this.push(JSON.parse(this._contents ?? "null"))
          break
      }
      callback()
    } catch (err) {
      callback(err as Error)
    }
  }
}

function* iterateObject(contents: unknown): Generator<string, void, never> {
  if (Array.isArray(contents)) {
    yield "["
    const length = contents.length - 1
    if (length >= 0) {
      for (let n = 0; n < length; ++n) {
        yield JSON.stringify(contents[n])
        yield ","
      }

      yield JSON.stringify(contents[length])
    }

    yield "]"
  } else if (typeof contents === "object") {
    if (contents === null) {
      yield "null"
    } else {
      yield JSON.stringify(contents)
    }
  } else {
    yield JSON.stringify(contents)
  }

  return
}
