import { delay } from "@telefrek/core/time"
import { Readable } from "stream"
import { parseMediaType } from "."
import { HttpMethod, parsePath } from "../"
import { TestRequest } from "../testUtils"
import { CONTENT_PARSING_TRANSFORM } from "./parsers"

describe("Verify parsing is appropriately delayed", () => {
  it("Should correctly wait to parse json until requested", async () => {
    let contentsRead = false
    const readable = Readable.from('{"foo": "bar"}').on("end", () => {
      contentsRead = true
    })

    // Ensure we didn't read anything yet
    expect(contentsRead).toBeFalsy()

    // Create a simple request with a JSON payload
    const request = new TestRequest({
      ...parsePath("/v1/test/contents"),
      method: HttpMethod.GET,
      headers: new Map([["Content-Type", "application/json"]]),
      body: {
        contents: readable,
      },
    })

    // Pump it through the transform
    const outputRequest = await CONTENT_PARSING_TRANSFORM(request)

    // Add some delay since we have to wait for event loop to schedule streaming, etc.
    await delay(50)

    // Make sure we got something...
    expect(outputRequest).not.toBeUndefined()

    // We shouldn't have consumed the stream yet..
    expect(contentsRead).toBeFalsy()

    const foo: unknown = await new Promise((resolve, reject) => {
      ;(outputRequest!.body?.contents as Readable)
        .on("data", (chunk: unknown) => {
          resolve(chunk)
        })
        .on("error", reject)
    })

    // Contents should have been read at this point
    expect(contentsRead).toBeTruthy()

    // We should have gotten an object
    expect(foo).not.toBeUndefined()

    // Verify it has "foo" as a property
    expect(foo).toHaveProperty("foo")
    expect(
      typeof foo === "object" && foo !== null && "foo" in foo && foo["foo"],
    ).toEqual("bar")
  })
})

describe("Content handling should be correctly identified and processed", () => {
  it("Should be able to handle simple media types", () => {
    // Common, should be parsed correctly including parameter
    let mediaType = parseMediaType("application/json;charset=utf-8")
    expect(mediaType?.type).toEqual("application")
    expect(mediaType?.subType).toEqual("json")
    expect(mediaType?.suffix).toBeUndefined()
    expect(mediaType?.parameters.size).toBe(1)
    expect(mediaType?.parameters.get("charset")).not.toBeUndefined()

    // Has the suffix, still valid
    mediaType = parseMediaType("application/vcard+json")
    expect(mediaType?.type).toEqual("application")
    expect(mediaType?.subType).toEqual("vcard")
    expect(mediaType?.suffix).toEqual("json")
    expect(mediaType?.parameters.size).toBe(0)

    // Custom vendor media type
    mediaType = parseMediaType("application/vnd.apple.mpegurl")
    expect(mediaType).not.toBeUndefined()
    expect(mediaType?.tree).toEqual("vnd")
    expect(mediaType?.type).toEqual("application")
    expect(mediaType?.subType).toEqual("apple.mpegurl")
    expect(mediaType?.parameters.size).toBe(0)

    // Not a valid media type
    mediaType = parseMediaType("app/json")
    expect(mediaType).toBeUndefined()
  })

  it("Should be able to handle more complex media types", () => {
    const mediaType = parseMediaType(
      'message/external-body; access-type=URL;URL = "ftp://cs.utk.edu/pub/moore/bulk-mailer/bulk-mailer.tar"',
    )
    expect(mediaType).not.toBeUndefined()
    expect(mediaType?.tree).toBeUndefined()
    expect(mediaType?.type).toEqual("message")
    expect(mediaType?.subType).toEqual("external-body")
    expect(mediaType?.parameters.size).toBe(2)
  })
})
