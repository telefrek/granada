import { Readable } from "stream"
import { createTransform } from "./"

describe("Generic streams should work normally", () => {
  const generator = function* () {
    for (let n = 0; n < 10; ++n) {
      yield n
    }

    return
  }

  it("Should be able to transform between two types", async () => {
    const results = await Readable.from(generator())
      .pipe(createTransform<Number, String>((d) => d.toString()))
      .toArray()
    expect(results.length).toEqual(10)
    expect(typeof results[0]).toEqual("string")
  })

  it("Should be able to filter values", async () => {
    const results = await Readable.from(generator())
      .pipe(
        createTransform<number, number>((d) => (d % 2 == 0 ? d : undefined)),
      )
      .toArray()

    expect(results.length).toEqual(5) // 0, 2, 4, 6, 8
    expect(results.reduce((l, r) => l + r, 0)).toEqual(20)
  })
})
