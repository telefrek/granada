import { DeferredPromise, type MaybeAwaitable } from "@telefrek/core"
import { ConsoleLogWriter, LogLevel } from "@telefrek/core/logging"
import { Duration } from "@telefrek/core/time"
import type { Optional } from "@telefrek/core/type/utils"
import { Readable } from "stream"
import {
  HttpClient,
  HttpClientBase,
  setHttpClientLogLevel,
  setHttpClientLogWriter,
} from "./client.js"
import { HttpStatusCode, type HttpRequest, type HttpResponse } from "./index.js"
import { CommonMediaTypes, mediaTypeToString } from "./media.js"
import { PassthroughPipeline, type HttpPipeline } from "./pipeline.js"
import { createHttpRequest, emptyHeaders } from "./utils.js"

const writer = new ConsoleLogWriter()

setHttpClientLogLevel(LogLevel.INFO)
setHttpClientLogWriter(writer)

class TestHttpClient extends HttpClientBase {
  private _marshal: (
    request: HttpRequest,
    onHeadersWritten: () => void,
    _abortSignal?: AbortSignal | undefined,
  ) => MaybeAwaitable<HttpResponse>
  constructor(
    marshal: (
      request: HttpRequest,
      onHeadersWritten: () => void,
      _abortSignal?: AbortSignal | undefined,
    ) => MaybeAwaitable<HttpResponse>,
  ) {
    super({ name: "testClient", host: "localhost" })
    this._marshal = marshal
  }

  protected override marshal(
    request: HttpRequest,
    onHeadersWritten: () => void,
    abortSignal?: AbortSignal | undefined,
  ): MaybeAwaitable<HttpResponse> {
    return this._marshal(request, onHeadersWritten, abortSignal)
  }
}

const REQUEST_TIMEOUT = Duration.ofMilli(100)

describe("The HTTP Client should handle various state changes regardless of underlying provider", () => {
  let pipeline: Optional<HttpPipeline>

  afterEach(() => {
    if (pipeline) {
      pipeline.stop()
      pipeline = undefined
    }
  })

  it("Should handle a simple success case", async () => {
    const client: HttpClient = new TestHttpClient((_req, written, _abort) => {
      written()
      return {
        status: {
          code: HttpStatusCode.NO_CONTENT,
        },
        headers: emptyHeaders(),
      }
    })

    pipeline = new PassthroughPipeline(client)

    const response = await client.submit(createHttpRequest(), REQUEST_TIMEOUT)

    expect(response).not.toBeUndefined()
    expect(response.status.code).toBe(HttpStatusCode.NO_CONTENT)
    expect(response.body).toBeUndefined()
    expect(response.headers).not.toBeUndefined()
  })

  it("Should handle a simplebody", async () => {
    const client: HttpClient = new TestHttpClient((_req, written, _abort) => {
      written()

      const headers = emptyHeaders()
      headers.set("Content-Type", mediaTypeToString(CommonMediaTypes.JSON))

      return {
        status: {
          code: HttpStatusCode.OK,
        },
        headers,
        body: {
          contents: Readable.from(JSON.stringify({ hello: "world" })),
        },
      }
    })
    pipeline = new PassthroughPipeline(client)

    const response = await client.submit(createHttpRequest(), REQUEST_TIMEOUT)
    expect(response).not.toBeUndefined()
    expect(response.status.code).toBe(HttpStatusCode.OK)
    expect(response.body).not.toBeUndefined()
    expect(response.headers).not.toBeUndefined()
    expect(response.body?.contents.readableObjectMode).toBe(true)

    const deferred = new DeferredPromise<object>()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let bodyObj: Optional<any>
    if (response.body?.contents.readableLength ?? 0 > 0) {
      bodyObj = response.body?.contents.read(1)
    } else {
      response.body?.contents.on("data", (chunk: object) => {
        deferred.resolve(chunk)
      })

      bodyObj = await deferred
    }

    expect(bodyObj).not.toBeUndefined()
    expect(bodyObj!.hello).toBe("world")
  })
})
