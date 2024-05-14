import { info } from "console"
import { Readable, Writable } from "stream"
import { finished } from "stream/promises"
import {
  StreamConcurrencyMode,
  createNamedTransform,
  type NamedTransformOptions,
} from "./streams.js"
import { delay } from "./time.js"

describe("Named Transform streams should work normally", () => {
  const generator = function* (lim: number = 10) {
    for (let n = 0; n < lim; ++n) {
      yield n
    }

    return
  }

  it("Should be able to transform between two types", async () => {
    const results = await Readable.from(generator())
      .pipe(createNamedTransform((d: number) => d.toString()))
      .toArray()
    expect(results.length).toEqual(10)
    expect(typeof results[0]).toEqual("string")
  })

  it("Should be able to generate the same results with all concurrency modes", async () => {
    const check = (r: number[]): void => {
      expect(r.length).toEqual(10)
      for (let n = 0; n < r.length; ++n) {
        expect(r[n]).toBe(n)
      }
      return
    }

    let cancelled = 0

    const opts = <NamedTransformOptions>{
      maxConcurrency: 2,
      priority: {
        prioritize: (_) => 3,
        cancellation: (_) => {
          ++cancelled
        },
        tasktimeoutMs: 25,
      },
    }

    for (const mode of [
      StreamConcurrencyMode.Serial,
      StreamConcurrencyMode.Parallel,
      StreamConcurrencyMode.FixedConcurrency,
      StreamConcurrencyMode.PriorityFixed,
    ]) {
      const results = await Readable.from(generator())
        .pipe(
          createNamedTransform((d: number) => d, {
            ...opts,
            mode,
          }),
        )
        .toArray()

      check(results)
    }

    expect(cancelled).toBe(0)
  })

  it("Should be able to filter values in all concurrency modes", async () => {
    const check = (res: number[]): void => {
      expect(res.length).toEqual(5)
      expect(res.reduce((l, r) => l + r, 0)).toEqual(20)
      return
    }

    let cancelled = 0

    const opts = <NamedTransformOptions>{
      maxConcurrency: 2,
      priority: {
        prioritize: (_) => 3,
        cancellation: (_) => {
          ++cancelled
        },
        tasktimeoutMs: 25,
      },
    }

    for (const mode of [
      StreamConcurrencyMode.Serial,
      StreamConcurrencyMode.Parallel,
      StreamConcurrencyMode.FixedConcurrency,
      StreamConcurrencyMode.PriorityFixed,
    ]) {
      info(`Checking mode: ${mode}`)
      const results = await Readable.from(generator())
        .pipe(
          createNamedTransform((d: number) => (d % 2 === 0 ? d : undefined), {
            ...opts,
            mode,
          }),
        )
        .toArray()

      check(results)
    }

    expect(cancelled).toBe(0)
  })

  it("Should be able to handle backpressure", async () => {
    const readable = Readable.from(generator(25), { highWaterMark: 2 })
    const writer = new Writable({
      objectMode: true,
      highWaterMark: 1, // Create a high watermark,
      write(_chunk, _encoding, callback) {
        delay(10).then(() => callback())
      },
    })

    await finished(
      readable
        .pipe(
          createNamedTransform(
            (l: number) => {
              return l + 10
            },
            {
              name: "Backpressure Transform",
              highWaterMark: 2,
            },
          ),
        )
        .pipe(writer),
    )
  })
})
