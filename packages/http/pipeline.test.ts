/**
 * Exercise the pipelines!
 */

import type { MaybeAwaitable } from "@telefrek/core"
import { Duration, delay } from "@telefrek/core/time"
import { randomUUID as v4 } from "crypto"
import type { HttpClient } from "./client.js"
import { HttpMethod, HttpStatusCode } from "./index.js"
import type { HttpServer } from "./server.js"
import { createHttp2Client, createHttp2Server } from "./testUtils.js"
import { emptyHeaders } from "./utils.js"

describe("Pipelines should support clients and servers end to end", () => {
  let server: HttpServer
  let client: HttpClient
  let promise: MaybeAwaitable<void>

  beforeAll(() => {
    const port = 20000 + ~~(Math.random() * 10000)
    server = createHttp2Server()
    promise = server.listen(port)
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
