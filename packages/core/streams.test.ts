import { Readable, Writable } from "stream"
import { finished } from "stream/promises"
import {
  StreamConcurrencyMode,
  createNamedTransform,
  type NamedTransformOptions,
} from "./streams.js"
import { delay } from "./time.js"

describe("Named Transform streams should generate the same datasets with all concurrency modes", () => {
  const generator = function* (lim: number = 10) {
    for (let n = 0; n < lim; ++n) {
      yield n
    }

    return
  }

  it("Should passthrough the same set of data", async () => {
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

  it("Should be able to filter data that doesn't propogate through", async () => {
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

  it("Should be able to handle backpressure upstream", async () => {
    let cancelled = 0

    const opts = <NamedTransformOptions>{
      maxConcurrency: 2,
      highWaterMark: 2,
      priority: {
        prioritize: (_) => 3,
        cancellation: (_) => {
          ++cancelled
        },
        tasktimeoutMs: 25, // This setting will generate some cancellations due to backpressure, ensure it works
      },
    }

    for (const mode of [
      StreamConcurrencyMode.Serial,
      StreamConcurrencyMode.Parallel,
      StreamConcurrencyMode.FixedConcurrency,
      StreamConcurrencyMode.PriorityFixed,
    ]) {
      // Reset the counter
      cancelled = 0
      const readable = Readable.from(generator(25), { highWaterMark: 2 })
      const writer = new Writable({
        objectMode: true,
        highWaterMark: 1, // Create a high watermark,
        write(_chunk, _encoding, callback) {
          delay(5).then(() => callback())
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
                ...opts,
                mode,
              },
            ),
          )
          .pipe(writer),
      )

      if (mode === StreamConcurrencyMode.PriorityFixed) {
        expect(cancelled).toBeGreaterThan(0)
      } else {
        expect(cancelled).toBe(0)
      }
    }
  })
})
