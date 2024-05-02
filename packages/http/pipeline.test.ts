/**
 * Exercise the pipelines!
 */

import { trace } from "@opentelemetry/api"
import { node } from "@opentelemetry/sdk-node"
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base"
import { type MaybeAwaitable } from "@telefrek/core/index.js"
import { consumeJsonStream } from "@telefrek/core/json.js"
import { ConsoleLogWriter, LogLevel } from "@telefrek/core/logging"
import { consumeString, drain } from "@telefrek/core/streams.js"
import { Duration, delay } from "@telefrek/core/time.js"
import { randomUUID as v4 } from "crypto"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { type HttpClient } from "./client.js"
import { HttpMethod, HttpStatusCode } from "./index.js"
import {
  createPipeline,
  setPipelineLogLevel,
  setPipelineWriter,
} from "./pipeline.js"
import { hostFolder } from "./pipeline/hosting.js"
import { USE_ROUTER } from "./pipeline/routing.js"
import type { HttpServer } from "./server.js"
import {
  DEFAULT_SERVER_PIPELINE_CONFIGURATION,
  NOT_FOUND_HANDLER,
} from "./server/pipeline.js"
import {
  createHttp2Client,
  createHttp2Server,
  createTestRouter,
} from "./testUtils.js"
import { createRequest, emptyHeaders, jsonBody } from "./utils.js"

const INDEX_HTML = `<!doctype html><html><head><title>Test</title></head><body>Test Page</body></html>`

describe("Pipelines should support clients and servers end to end", () => {
  let server: HttpServer
  let client: HttpClient
  let directory: string
  let promise: MaybeAwaitable<void>

  beforeAll(async () => {
    const provider = new node.NodeTracerProvider()
    provider.addSpanProcessor(
      new SimpleSpanProcessor(new ConsoleSpanExporter()),
    )
    trace.setGlobalTracerProvider(provider)
    directory = mkdtempSync("granada-hosting-test", "utf8")

    // Create the index html file
    writeFileSync(join(directory, "index.html"), INDEX_HTML, {
      encoding: "utf-8",
    })

    const port = 20000 + ~~(Math.random() * 10000)
    const config = { ...DEFAULT_SERVER_PIPELINE_CONFIGURATION }

    // Host before api to ensure no routing issues since we are storing at '/'
    config.requestTransforms?.push(hostFolder({ baseDir: directory }))

    // Add routing
    config.requestTransforms?.push(USE_ROUTER(createTestRouter()))

    server = createHttp2Server(NOT_FOUND_HANDLER, createPipeline(config))
    promise = server.listen(port)

    await delay(20)

    client = createHttp2Client(port)
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
    setPipelineLogLevel(LogLevel.INFO)
    setPipelineWriter(new ConsoleLogWriter())
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
