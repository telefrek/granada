/**
 * Exercise the pipelines!
 */

import { type MaybeAwaitable } from "@telefrek/core/index.js"
import { consumeJsonStream } from "@telefrek/core/json.js"
import { consumeString, drain } from "@telefrek/core/streams.js"
import { Duration, delay } from "@telefrek/core/time.js"
import { randomUUID as v4 } from "crypto"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { type HttpClient } from "./client.js"
import { HttpMethod, HttpStatusCode } from "./index.js"
import type { HttpOperationSource } from "./operations.js"
import { createPipeline, type HttpPipeline } from "./pipeline.js"
import { hostFolder } from "./pipeline/hosting.js"
import { USE_ROUTER } from "./pipeline/routing.js"
import { type HttpServer } from "./server.js"
import {
  DEFAULT_SERVER_PIPELINE_CONFIGURATION,
  NOT_FOUND_HANDLER,
} from "./server/pipeline.js"
import {
  TEST_LOGGER,
  createHttp2Client,
  createHttp2Server,
  createTestRouter,
} from "./testUtils.js"
import { createRequest, emptyHeaders, jsonBody } from "./utils.js"

const INDEX_HTML = `<!doctype html><html><head><title>Test</title></head><body>Test Page</body></html>`

describe("Pipelines should support clients and servers end to end", () => {
  let server: HttpServer
  let pipeline: HttpPipeline
  let client: HttpClient
  let directory: string
  let promise: MaybeAwaitable<void>

  beforeAll(async () => {
    directory = mkdtempSync("granada-hosting-test", "utf8")

    // Create the index html file
    writeFileSync(join(directory, "index.html"), INDEX_HTML, {
      encoding: "utf-8",
    })

    const port = 20000 + ~~(Math.random() * 10000)
    const config = { transforms: [], ...DEFAULT_SERVER_PIPELINE_CONFIGURATION }

    // Host before api to ensure no routing issues since we are storing at '/'
    config.transforms?.push(hostFolder({ baseDir: directory }))

    // Add routing
    config.transforms?.push(USE_ROUTER(createTestRouter()))

    const certDir = join(
      import.meta.dirname ?? dirname(fileURLToPath(import.meta.url)),
      "../../resources/test",
    )
    server = createHttp2Server(certDir)

    pipeline = createPipeline(config)
    if (!pipeline.add(server as HttpOperationSource, NOT_FOUND_HANDLER, {})) {
      TEST_LOGGER.error(`Failed to start pipeline`)
    } else {
      TEST_LOGGER.info(`Started pipeline`)
    }
    promise = server.listen(port)
    client = createHttp2Client(certDir, port)
  })

  afterAll(async () => {
    if (directory && existsSync(directory)) {
      rmSync(directory, {
        recursive: true,
        force: true,
      })
    }

    if (client) {
      await client.close()
    }

    if (server) {
      await server.close(false)
      await promise
    }

    if (pipeline) {
      await pipeline.stop()
    }

    // Let any logs clear
    await delay(50)
  })

  it("Server should respond to health requests", async () => {
    const response = await client.submit(createRequest({ path: "/health" }))

    // Expect a response with no content
    expect(response.status.code).toBe(HttpStatusCode.NO_CONTENT)
    expect(response.body).toBeUndefined()
  })

  it("Should respond with the default handler if not mapped", async () => {
    for (const original of ["/health", "/ready", "/not/mapped"]) {
      const response = await client.submit(
        createRequest({
          path: original,
          method: HttpMethod.POST,
        }),
        Duration.ofSeconds(1),
      )

      expect(response.status.code).toBe(HttpStatusCode.NOT_FOUND)
      expect(response.body).toBeUndefined()
    }
  })

  it("Should support hosting requests", async () => {
    let response = await client.submit(createRequest({ path: "/" }))
    expect(response.status.code).toBe(HttpStatusCode.OK)
    expect(response.body).not.toBeUndefined()
    expect(response.body!.mediaType?.toString()).toBe("text/html;charset=utf-8")

    const results = await consumeString(response.body!.contents)
    expect(results).toBeTruthy()
    expect(results).toBe(INDEX_HTML)

    response = await client.submit(
      createRequest({ path: "/file/does/not/exist" }),
    )
    expect(response.status.code).toBe(HttpStatusCode.NOT_FOUND)
    expect(response.body).toBeUndefined()
  })

  it("Should support routing requests", async () => {
    let response = await client.submit(createRequest({ path: "/route1" }))
    expect(response.status.code).toBe(HttpStatusCode.NO_CONTENT)
    expect(response.body).toBeUndefined()

    response = await client.submit(
      createRequest({ path: "/route2/123", method: HttpMethod.GET }),
    )
    expect(response.status.code).toBe(HttpStatusCode.OK)
    expect(response.body).not.toBeUndefined()
    let body = await consumeJsonStream(response.body!.contents)
    expect(body).not.toBeUndefined()
    expect(body).toStrictEqual({ itemId: 123 })

    response = await client.submit(
      createRequest({ path: "/route2/foo", method: HttpMethod.GET }),
    )
    expect(response.status.code).toBe(HttpStatusCode.OK)
    expect(response.body).not.toBeUndefined()
    body = await consumeJsonStream(response.body!.contents)
    expect(body).not.toBeUndefined()
    expect(body).toStrictEqual({ itemId: "foo" })

    response = await client.submit(
      createRequest({
        path: "/route2/1",
        method: HttpMethod.PUT,
        body: jsonBody({ itemId: 1, updated: true }),
      }),
    )
    expect(response.status.code).toBe(HttpStatusCode.ACCEPTED)
    expect(response.body).not.toBeUndefined()
    body = await consumeJsonStream(response.body!.contents)
    expect(body).not.toBeUndefined()
    expect(body).toStrictEqual({ itemId: 1, updated: true })

    response = await client.submit(
      createRequest({
        path: "/route3",
        body: jsonBody({ some: "body" }),
      }),
    )

    expect(response.status.code).toBe(HttpStatusCode.OK)
    expect(response.body).not.toBeUndefined()
    expect(response.body!.mediaType).not.toBeUndefined()
    expect(response.body!.mediaType!.toString()).toBe("application/json")

    await drain(response.body!.contents)
  })

  it("Server should respond to ready requests", async () => {
    let response = await client.submit(
      createRequest({
        path: "/ready",
      }),
    )

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
