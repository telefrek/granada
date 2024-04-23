import { DeferredPromise, getDebugInfo } from "@telefrek/core/index.js"
import {
  ConsoleLogWriter,
  DefaultLogger,
  LogLevel,
  error,
  setGlobalLogLevel,
  setGlobalWriter,
} from "@telefrek/core/logging.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import { HttpMethod, HttpStatus } from "@telefrek/http/index.js"
import {
  httpPipelineBuilder,
  setPipelineLogLevel,
  setPipelineWriter,
  type HttpPipeline,
} from "@telefrek/http/pipeline.js"
import {
  httpServerBuilder,
  setHttpServerLogWriter,
  type HttpServer,
} from "@telefrek/http/server.js"
import * as fs from "fs"
import { connect, type OutgoingHttpHeaders } from "http2"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { TestService, type TestItem } from "./testUtils.js"

const dir = dirname(fileURLToPath(import.meta.url))

// Enable console logging for the pipeline
const writer = new ConsoleLogWriter()
setPipelineLogLevel(LogLevel.INFO)
setGlobalLogLevel(LogLevel.INFO)
setPipelineWriter(writer)
setGlobalWriter(writer)
setHttpServerLogWriter(writer)

const logger = new DefaultLogger({
  name: "testLog",
  writer: new ConsoleLogWriter(),
  level: LogLevel.DEBUG,
  includeTimestamps: true,
})

describe("Basic HTTP server functionality should work", () => {
  let server: Optional<HttpServer>
  let pipeline: Optional<HttpPipeline>

  afterEach(async () => {
    // Stop the server
    if (server) {
      await server.close(false)
    }

    // Stop the pipeline
    if (pipeline) {
      await pipeline.stop()
    }
  })

  it("Should be able to create a new server and respond to basic health checks", async () => {
    server = httpServerBuilder()
      .withTls({
        cert: fs.readFileSync(join(dir, "./test/cert.pem")),
        key: fs.readFileSync(join(dir, "./test/key.pem")),
      })
      .build()

    logger.info("Building pipeline")
    pipeline = httpPipelineBuilder(server)
      .withDefaults()
      .withApi(new TestService())
      .build()

    pipeline.on("error", (err) => {
      error(`pipeline error: ${getDebugInfo(err)}`)
    })

    logger.info("starting server")
    const port = ~~(10000 + 1000 * Math.random())
    void server.listen(port)

    logger.info("sending request")
    let response = await getResponse<TestItem>(
      port,
      "/test/items",
      HttpMethod.POST,
      JSON.stringify({ name: "foo" }),
    )

    logger.info("checking response")
    expect(response.status).toBe(HttpStatus.CREATED)
    expect(response.contents).not.toBeUndefined()
    expect(response.contents?.name).toEqual("foo")

    response = await getResponse<TestItem>(
      port,
      `/test/items/${response.contents?.id ?? 0}`,
      HttpMethod.GET,
    )
    expect(response.contents).not.toBeUndefined()
    expect(response.contents?.name).toEqual("foo")

    // await server?.close()
    // await listen
  })

  async function getResponse<T>(
    port: number,
    path: string,
    method: HttpMethod,
    body?: string,
  ): Promise<{
    status: HttpStatus
    contents?: T
  }> {
    const deferred = new DeferredPromise()

    const headers: OutgoingHttpHeaders = {
      ":path": path,
      ":method": method,
    }

    if (body) {
      headers["Content-Type"] = "application/json"
    }

    const client = connect(`https://localhost:${port}`, {
      ca: fs.readFileSync(join(dir, "./test/cert.pem")),
    })
    client.on("error", (err) => {
      error(err)
    })

    try {
      const req = client.request(headers)
      let data = ""
      let status = HttpStatus.BAD_GATEWAY

      req.on("response", (headers, _) => {
        status = (headers[":status"] as HttpStatus) ?? status
      })

      req.setEncoding("utf8")
      req.on("data", (chunk) => {
        data += chunk
      })

      if (body) {
        req.write(body)
      }

      req.on("end", () => {
        client.close()
        deferred.resolve()
      })
      req.end()

      await deferred

      return {
        status,
        contents: data.length > 0 ? (JSON.parse(data) as T) : undefined,
      }
    } finally {
      client.close()
    }
  }
})
