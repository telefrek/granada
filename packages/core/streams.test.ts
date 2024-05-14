import { Readable, Writable } from "stream"
import { finished } from "stream/promises"
import { StreamConcurrencyMode, createNamedTransform } from "./streams.js"
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

  it("Should be able to filter values in parallel", async () => {
    const results = await Readable.from(generator())
      .pipe(
        createNamedTransform((d: number) => (d % 2 == 0 ? d : undefined), {
          name: "ParallelTest",
          mode: StreamConcurrencyMode.Parallel,
        }),
      )
      .toArray()

    expect(results.length).toEqual(5) // 0, 2, 4, 6, 8
    expect(results.reduce((l, r) => l + r, 0)).toEqual(20)
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
