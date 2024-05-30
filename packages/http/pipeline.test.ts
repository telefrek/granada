/**
 * Exercise the pipelines!
 */

import { EmitterFor } from "@telefrek/core/events.js"
import { type MaybeAwaitable } from "@telefrek/core/index.js"
import { consumeJsonStream } from "@telefrek/core/json.js"
import { getTracer } from "@telefrek/core/observability/tracing.js"
import { consumeString, drain } from "@telefrek/core/streams.js"
import { Duration, delay } from "@telefrek/core/time.js"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { type HttpClient } from "./client.js"
import { HttpMethod, HttpStatusCode } from "./index.js"
import {
  HttpOperationSourceEvents,
  HttpOperationState,
  createHttpOperation,
  type HttpOperation,
  type HttpOperationSource,
} from "./operations.js"
import { createPipeline, type HttpPipeline } from "./pipeline.js"
import { hostFolder } from "./pipeline/hosting.js"
import { createLoadSheddingTransform } from "./pipeline/loadShedding.js"
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

import { randomUUID as v4 } from "crypto"
import { createRouter, getRoutingParameters } from "./routing.js"
import {
  createRequest,
  jsonBody,
  jsonContents,
  noContents,
  notFound,
} from "./utils.js"

const INDEX_HTML = `<!doctype html><html><head><title>Test</title></head><body>Test Page</body></html>`

describe("Pipeline components should behave as designed", () => {
  class TestSource
    extends EmitterFor<HttpOperationSourceEvents>
    implements HttpOperationSource
  {
    id: string

    constructor() {
      super()
      this.id = v4()
    }
  }
  let pipeline: HttpPipeline
  let source: HttpOperationSource

  beforeEach(() => {
    source = new TestSource()
  })

  afterEach(async () => {
    // Kill the source
    source.emit("finished")

    if (pipeline) {
      // Remove the source explicitly
      pipeline.remove(source)

      // Shutdown the pipeline
      await pipeline.stop()
    }
  })

  describe("Routing should send data to the correct places", () => {
    it("Should find the correct routes with parameters", async () => {
      const router = createRouter()

      // Single path
      router.addHandler("/path1", (_) => noContents(), HttpMethod.GET)

      // Only PUT
      router.addHandler("/path2/**", (_) => noContents(), HttpMethod.PUT)

      // Mixed routes
      router.addHandler("/path3/*/:foo", (_) => noContents(), HttpMethod.DELETE)

      // All methods
      router.addHandler("/path/:id/:resource", (_) =>
        jsonContents({
          id: getRoutingParameters()?.get("id"),
          resource: getRoutingParameters()?.get("resource"),
        }),
      )

      // Use the routing
      pipeline = createPipeline({
        transforms: [USE_ROUTER(router, "/")],
      })

      // Add the pipeline
      expect(pipeline.add(source, (_) => notFound())).toBeTruthy()

      const noRoute = createHttpOperation({
        request: createRequest({
          path: "/no/path/exists",
          method: HttpMethod.GET,
        }),
        span: getTracer().startSpan("test"),
        timeout: Duration.ofSeconds(1),
      })

      const path1 = createHttpOperation({
        request: createRequest({ path: "/path1", method: HttpMethod.GET }),
        span: getTracer().startSpan("test"),
        timeout: Duration.ofSeconds(1),
      })

      const path1Bad = createHttpOperation({
        request: createRequest({ path: "/path1", method: HttpMethod.DELETE }),
        span: getTracer().startSpan("test"),
        timeout: Duration.ofSeconds(1),
      })

      const path2 = createHttpOperation({
        request: createRequest({
          path: "/path2/this/path/should/exist",
          method: HttpMethod.PUT,
        }),
        span: getTracer().startSpan("test"),
        timeout: Duration.ofSeconds(1),
      })

      const path2Bad = createHttpOperation({
        request: createRequest({
          path: "/path2/this/path/should/exist",
          method: HttpMethod.GET,
        }),
        span: getTracer().startSpan("test"),
        timeout: Duration.ofSeconds(1),
      })

      const path3 = createHttpOperation({
        request: createRequest({
          path: "/path3/junk/value",
          method: HttpMethod.DELETE,
        }),
        span: getTracer().startSpan("test"),
        timeout: Duration.ofSeconds(1),
      })

      const path3Bad = createHttpOperation({
        request: createRequest({
          path: "/path3/junk/value",
          method: HttpMethod.GET,
        }),
        span: getTracer().startSpan("test"),
        timeout: Duration.ofSeconds(1),
      })

      const multiParam = createHttpOperation({
        request: createRequest({
          path: "/path/1/two",
          method: HttpMethod.DELETE,
        }),
        span: getTracer().startSpan("test"),
        timeout: Duration.ofSeconds(1),
      })

      for (const op of [
        noRoute,
        path1,
        path1Bad,
        path2,
        path2Bad,
        path3,
        path3Bad,
        multiParam,
      ]) {
        source.emit("received", op)
      }

      // Let the requests clear
      await delay(50)

      // Stop the pipeline
      await pipeline.stop()

      // Unmapped paths
      expect(noRoute.response?.status.code).toBe(HttpStatusCode.NOT_FOUND)
      expect(path1Bad.response?.status.code).toBe(HttpStatusCode.NOT_FOUND)
      expect(path2Bad.response?.status.code).toBe(HttpStatusCode.NOT_FOUND)
      expect(path3Bad.response?.status.code).toBe(HttpStatusCode.NOT_FOUND)

      expect(path1.response?.status.code).toBe(HttpStatusCode.NO_CONTENT)
      expect(path2.response?.status.code).toBe(HttpStatusCode.NO_CONTENT)
      expect(path3.response?.status.code).toBe(HttpStatusCode.NO_CONTENT)

      expect(multiParam.response?.status.code).toBe(HttpStatusCode.OK)
      expect(multiParam.response?.body).not.toBeUndefined()

      const contents = (await consumeJsonStream(
        multiParam.response!.body!.contents,
      )) as { id: number; resource: string }
      expect(contents).not.toBeUndefined()

      // Ensure the parameter types were correct
      expect(contents.id).toBe(1)
      expect(contents.resource).toBe("two")
    })
  })

  describe("Load Shedding should limit max wait times", () => {
    it("Should work with no backpressure", async () => {
      // Create the pipeline
      pipeline = createPipeline({
        transforms: [
          createLoadSheddingTransform({
            thresholdMs: 25,
            maxOutstandingRequests: 2,
          }),
        ],
      })

      // Add the pipeline
      expect(
        pipeline.add(source, (_req, _abort) => noContents(), {
          maxConcurrency: 4,
          highWaterMark: 4,
        }),
      ).toBe(true)

      // Track the operations
      const operations: HttpOperation[] = []

      // Run 25 through the system as fast as possible
      for (let n = 0; n < 25; ++n) {
        const op = createHttpOperation({
          request: createRequest(),
          timeout: Duration.ofSeconds(1),
          span: getTracer().startSpan("test"),
        })
        operations.push(op)
        source.emit("received", op)
      }

      // Give the pipeline some time to process the results
      await delay(250)

      // Verify all the operations were completed
      for (const op of operations) {
        expect(op.state).toBe(HttpOperationState.COMPLETED)
        expect(op.error).toBeUndefined()
        expect(op.response).not.toBeUndefined()
        expect(op.response?.status.code).toBe(HttpStatusCode.NO_CONTENT)
      }
    })

    it("Should work with backpressure, keeping task execution below the delay threshold", async () => {
      // Create the pipeline
      pipeline = createPipeline({
        transforms: [
          createLoadSheddingTransform({
            thresholdMs: 25,
            maxOutstandingRequests: 2,
          }),
        ],
      })

      // Add the pipeline
      expect(
        pipeline.add(
          source,
          async (_req, _abort) => {
            await delay(50)
            return noContents()
          },
          {
            maxConcurrency: 1,
            highWaterMark: 1,
          },
        ),
      ).toBe(true)

      // Track the operations
      const operations: HttpOperation[] = []

      // Run 25 through the system as fast as possible
      for (let n = 0; n < 25; ++n) {
        const op = createHttpOperation({
          request: createRequest(),
          timeout: Duration.ofSeconds(1),
          span: getTracer().startSpan("test"),
        })
        operations.push(op)
        source.emit("received", op)
      }

      // Give the pipeline some time to process the results
      await delay(250)

      let completed = 0
      let timeout = 0

      // Verify all the operations were completed
      for (const op of operations) {
        if (op.state === HttpOperationState.COMPLETED) {
          expect(op.error).toBeUndefined()
          expect(op.response).not.toBeUndefined()
          expect(op.response?.status.code).toBe(HttpStatusCode.NO_CONTENT)
          expect(op.duration.milliseconds()).toBeGreaterThan(50) // Should be greater than execution time
          completed++
        } else {
          expect(op.state).toBe(HttpOperationState.TIMEOUT)
          expect(op.duration.milliseconds()).toBeLessThan(75) // Should be less than the delay in the queue  task
          timeout++
        }
      }

      // There should be a mix of completed and timeouts
      expect(completed).toBeGreaterThan(0)
      expect(timeout).toBeGreaterThan(0)
    })
  })
})

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
    config.transforms?.push(hostFolder({ baseDir: directory, urlPath: "/" }))

    // Add routing
    config.transforms?.push(USE_ROUTER(createTestRouter(), "/api"))

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
    expect(response.body!.mediaType?.type).toBe("text")
    expect(response.body!.mediaType?.subType).toBe("html")

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
    let response = await client.submit(createRequest({ path: "/api/route1" }))
    expect(response.status.code).toBe(HttpStatusCode.NO_CONTENT)
    expect(response.body).toBeUndefined()

    response = await client.submit(
      createRequest({ path: "/api/route2/123", method: HttpMethod.GET }),
    )
    expect(response.status.code).toBe(HttpStatusCode.OK)
    expect(response.body).not.toBeUndefined()
    let body = await consumeJsonStream(response.body!.contents)
    expect(body).not.toBeUndefined()
    expect(body).toStrictEqual({ itemId: 123 })

    response = await client.submit(
      createRequest({ path: "/api/route2/foo", method: HttpMethod.GET }),
    )
    expect(response.status.code).toBe(HttpStatusCode.OK)
    expect(response.body).not.toBeUndefined()
    body = await consumeJsonStream(response.body!.contents)
    expect(body).not.toBeUndefined()
    expect(body).toStrictEqual({ itemId: "foo" })

    response = await client.submit(
      createRequest({
        path: "/api/route2/1",
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
        path: "/api/route3",
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
    response = await client.submit(createRequest({ path: "/ready" }))

    // Expect a failed response with no body
    expect(response.status.code).toBe(HttpStatusCode.BAD_GATEWAY)
    expect(response.body).toBeUndefined()

    expect(server.setReady(true)).toBeTruthy()
    response = await client.submit(createRequest({ path: "/ready" }))

    // Expect a response with no content
    expect(response.status.code).toBe(HttpStatusCode.NO_CONTENT)
    expect(response.body).toBeUndefined()
  })
})
