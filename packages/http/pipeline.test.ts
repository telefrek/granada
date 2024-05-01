/**
 * Exercise the pipelines!
 */

import { type MaybeAwaitable } from "@telefrek/core"
import { fromJsonStream, streamJson } from "@telefrek/core/json.js"
import { Duration, delay } from "@telefrek/core/time"
import { randomUUID as v4 } from "crypto"
import type { HttpClient } from "./client.js"
import { HttpMethod, HttpRequestHeaders, HttpStatusCode } from "./index.js"
import { CommonMediaTypes } from "./media.js"
import type { HttpServer } from "./server.js"
import {
  TEST_LOGGER,
  createHttp2Client,
  createHttp2Server,
} from "./testUtils.js"
import { emptyHeaders } from "./utils.js"

describe("Pipelines should support clients and servers end to end", () => {
  let server: HttpServer
  let client: HttpClient
  let promise: MaybeAwaitable<void>

  beforeAll(async () => {
    const port = 20000 + ~~(Math.random() * 10000)
    server = createHttp2Server(async (request, _abort) => {
      if (
        request.path.original === "/json" &&
        request.method === HttpMethod.GET
      ) {
        return {
          status: {
            code: HttpStatusCode.OK,
          },
          headers: emptyHeaders(),
          body: {
            mediaType: CommonMediaTypes.JSON,
            contents: streamJson({ hello: "world" }),
          },
        }
      } else if (
        request.path.original === "/upload" &&
        request.method === HttpMethod.POST
      ) {
        const uploadContents: unknown[] = []
        if (request.body && request.body.mediaType?.subType === "json") {
          TEST_LOGGER.info("Reading body contents on request")
          for await (const obj of fromJsonStream(request.body.contents)) {
            uploadContents.push(obj)
          }

          return {
            status: {
              code: HttpStatusCode.ACCEPTED,
            },
            headers: emptyHeaders(),
            body: {
              mediaType: CommonMediaTypes.JSON,
              contents: streamJson(uploadContents),
            },
          }
        } else {
          return {
            status: {
              code: HttpStatusCode.BAD_REQUEST,
            },
            headers: emptyHeaders(),
          }
        }
      }

      return {
        status: {
          code: HttpStatusCode.NOT_FOUND,
        },
        headers: emptyHeaders(),
      }
    })
    promise = server.listen(port)

    await delay(20)

    client = createHttp2Client(port)
  })

  afterAll(async () => {
    if (client) {
      await client.close()
    }

    if (server) {
      await server.close(false)
      await promise
    }

    // Let any logs clear
    await delay(50)
  })

  it("Server should respond to health requests", async () => {
    const response = await client.submit({
      id: v4(),
      headers: emptyHeaders(),
      path: {
        original: "/health",
      },
      method: HttpMethod.GET,
    })

    // Expect a response with no content
    expect(response.status.code).toBe(HttpStatusCode.NO_CONTENT)
    expect(response.body).toBeUndefined()
  })

  it("Should respond with the default handler if not mapped", async () => {
    for (const original of ["/health", "/ready", "/not/mapped"]) {
      const response = await client.submit(
        {
          id: v4(),
          headers: emptyHeaders(),
          path: {
            original,
          },
          method: HttpMethod.POST,
        },
        Duration.ofSeconds(1),
      )

      expect(response.status.code).toBe(HttpStatusCode.NOT_FOUND)
      expect(response.body).toBeUndefined()
    }
  })

  it("Server should response with contents compressed when accept-passed", async () => {
    const acceptBRHeaders = emptyHeaders()
    acceptBRHeaders.set(HttpRequestHeaders.AcceptEncoding, "br")

    const acceptGzipHeaders = emptyHeaders()
    acceptGzipHeaders.set(HttpRequestHeaders.AcceptEncoding, "gzip")

    let response = await client.submit({
      id: v4(),
      headers: acceptBRHeaders,
      path: {
        original: "/json",
      },
      method: HttpMethod.GET,
    })

    expect(response.status.code).toBe(HttpStatusCode.OK)
    expect(response.body).not.toBeUndefined()
    expect(response.body?.mediaType).not.toBeUndefined()
    expect(response.body?.mediaType?.type).toBe("application")
    expect(response.body?.mediaType?.subType).toBe("json")

    let count = 0
    for await (const obj of fromJsonStream(response.body!.contents)) {
      count++
      expect(obj).toStrictEqual({ hello: "world" })
    }

    expect(count).toBe(1)

    response = await client.submit({
      id: v4(),
      headers: acceptGzipHeaders,
      path: {
        original: "/json",
      },
      method: HttpMethod.GET,
    })

    expect(response.status.code).toBe(HttpStatusCode.OK)
    expect(response.body).not.toBeUndefined()
    expect(response.body?.mediaType).not.toBeUndefined()
    expect(response.body?.mediaType?.type).toBe("application")
    expect(response.body?.mediaType?.subType).toBe("json")

    count = 0
    for await (const obj of fromJsonStream(response.body!.contents)) {
      count++
      expect(obj).toStrictEqual({ hello: "world" })
    }

    expect(count).toBe(1)

    // Default compression accepted should still work
    response = await client.submit({
      id: v4(),
      headers: emptyHeaders(),
      path: {
        original: "/json",
      },
      method: HttpMethod.GET,
    })

    expect(response.status.code).toBe(HttpStatusCode.OK)
    expect(response.body).not.toBeUndefined()
    expect(response.body?.mediaType).not.toBeUndefined()
    expect(response.body?.mediaType?.type).toBe("application")
    expect(response.body?.mediaType?.subType).toBe("json")

    count = 0
    for await (const obj of fromJsonStream(response.body!.contents)) {
      count++
      expect(obj).toStrictEqual({ hello: "world" })
    }

    expect(count).toBe(1)
  })

  it("Server should be able to accept a body from the client", async () => {
    const response = await client.submit({
      id: v4(),
      headers: emptyHeaders(),
      path: {
        original: "/upload",
      },
      method: HttpMethod.POST,
      body: {
        mediaType: CommonMediaTypes.JSON,
        contents: streamJson([{ hello: "world" }]),
      },
    })

    expect(response.status.code).toBe(HttpStatusCode.ACCEPTED)
    expect(response.body).not.toBeUndefined()
    expect(response.body?.mediaType).not.toBeUndefined()
    expect(response.body?.mediaType?.type).toBe("application")
    expect(response.body?.mediaType?.subType).toBe("json")

    let count = 0
    for await (const obj of fromJsonStream(response.body!.contents)) {
      count++
      expect(obj).toStrictEqual({ hello: "world" })
    }

    expect(count).toBe(1)
  })

  it("Server should respond to ready requests", async () => {
    let response = await client.submit({
      id: v4(),
      headers: emptyHeaders(),
      path: {
        original: "/ready",
      },
      method: HttpMethod.GET,
    })

    // Expect a response with no content
    expect(response.status.code).toBe(HttpStatusCode.NO_CONTENT)
    expect(response.body).toBeUndefined()

    expect(server.setReady(false)).toBeTruthy()
    response = await client.submit({
      id: v4(),
      headers: emptyHeaders(),
      path: {
        original: "/ready",
      },
      method: HttpMethod.GET,
    })

    // Expect a failed response with no body
    expect(response.status.code).toBe(HttpStatusCode.BAD_GATEWAY)
    expect(response.body).toBeUndefined()

    expect(server.setReady(true)).toBeTruthy()
    response = await client.submit({
      id: v4(),
      headers: emptyHeaders(),
      path: {
        original: "/ready",
      },
      method: HttpMethod.GET,
    })

    // Expect a response with no content
    expect(response.status.code).toBe(HttpStatusCode.NO_CONTENT)
    expect(response.body).toBeUndefined()
  })
})
