/**
 * Testing for some of the JSON utilities
 */

import { Readable } from "stream"
import { fromJsonStream, streamJson } from "./json.js"

describe("The JSON stream utilities should work with valid objects", () => {
  it("Should be able to translate an object to a stream", async () => {
    const obj = { foo: "bar" }
    const readable = streamJson(obj)

    let data = ""
    let count = 0
    for await (const chunk of readable) {
      data += Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk)
      count++
    }

    // Verify the count and contents
    expect(data).toBe(`{"foo":"bar"}`)
    expect(count).toBe(1)
  })

  it("Should be able to translate an array in chunks", async () => {
    const obj = { foo: "bar" }
    const readable = streamJson([obj, obj])

    let data = ""
    let count = 0
    for await (const chunk of readable) {
      data += Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk)
      count++
    }

    // Verify the count and contents
    expect(data).toBe(`[{"foo":"bar"},{"foo":"bar"}]`)
    expect(count).toBe(5)
  })

  it("Should be able to read json from a readable stream", async () => {
    const obj = { foo: "bar" }
    const readable = Readable.from(JSON.stringify(obj))

    let count = 0
    for await (const _obj of fromJsonStream(readable)) {
      count++
      expect(_obj).toStrictEqual(obj)
    }

    expect(count).toBe(1)
  })

  it("Should be able to read json arrays from a readable stream", async () => {
    const obj = { foo: "bar" }
    const readable = Readable.from(JSON.stringify([obj, obj, obj]))

    let count = 0
    for await (const _obj of fromJsonStream(readable)) {
      count++
      expect(_obj).toStrictEqual(obj)
    }

    expect(count).toBe(3)
  })
})
