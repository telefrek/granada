import { DeferredPromise, getDebugInfo } from "@telefrek/core/index.js"
import {
  ConsoleLogWriter,
  DefaultLogger,
  LogLevel,
  error,
} from "@telefrek/core/logging.js"
import { HttpMethod, HttpStatus } from "@telefrek/http/index.js"
import { CONTENT_PARSING_TRANSFORM } from "@telefrek/http/parsers.js"
import { getDefaultBuilder, type HttpServer } from "@telefrek/http/server.js"
import {
  createPipeline,
  type HttpPipeline,
} from "@telefrek/http/server/pipeline.js"
import * as fs from "fs"
import { connect, type OutgoingHttpHeaders } from "http2"
import { join } from "path"
import { TestService, type TestItem } from "./testUtils.js"

const dir = __dirname

describe("Basic HTTP server functionality should work", () => {
  let server: HttpServer | undefined
  let pipeline: HttpPipeline | undefined

  afterEach(async () => {
    // Stop the pipeline
    if (pipeline) {
      await pipeline.stop()
    }

    // Stop the server
    if (server) {
      await server.close()
    }
  })

  it("Should be able to create a new server and respond to basic health checks", async () => {
    server = getDefaultBuilder()
      .withTls({
        cert: fs.readFileSync(join(dir, "./test/cert.pem")),
        key: fs.readFileSync(join(dir, "./test/key.pem")),
      })
      .withLogger(
        new DefaultLogger({
          level: LogLevel.INFO,
          writer: new ConsoleLogWriter(),
          source: "http",
          includeTimestamps: true,
        }),
      )
      .build()

    pipeline = createPipeline(server)
      .withApi(new TestService())
      .withContentParsing(CONTENT_PARSING_TRANSFORM)
      .build()

    pipeline.on("error", (err) => {
      error(`pipeline error: ${getDebugInfo(err)}`)
    })

    const port = ~~(10000 + 1000 * Math.random())
    void server.listen(port)

    let response = await getResponse<TestItem>(
      port,
      "/test/items",
      HttpMethod.POST,
      JSON.stringify({ name: "foo" }),
    )

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
        deferred.resolve(undefined)
      })
      req.end()

      await deferred

      return {
        status,
        contents: JSON.parse(data) as T,
      }
    } finally {
      client.close()
    }
  }
})
