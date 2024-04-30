import { type MaybeAwaitable } from "@telefrek/core"
import { ConsoleLogWriter, LogLevel } from "@telefrek/core/logging"
import { Duration, delay } from "@telefrek/core/time"
import { Readable } from "stream"
import {
  HttpClient,
  HttpClientBuilder,
  setHttpClientLogLevel,
  setHttpClientLogWriter,
  type HttpClientTransport,
  type HttpTransportOptions,
} from "./client.js"
import { HttpStatusCode, type HttpRequest, type HttpResponse } from "./index.js"
import { CommonMediaTypes, mediaTypeToString } from "./media.js"
import { setPipelineLogLevel, setPipelineWriter } from "./pipeline.js"
import { createHttpRequest, emptyHeaders } from "./utils.js"

const writer = new ConsoleLogWriter()

setHttpClientLogLevel(LogLevel.DEBUG)
setHttpClientLogWriter(writer)

setPipelineLogLevel(LogLevel.DEBUG)
setPipelineWriter(writer)

interface TestTransportOptions extends HttpTransportOptions {
  marshal: MarshalRequest
}

type MarshalRequest = (
  _req: HttpRequest,
  _abort?: AbortSignal,
) => MaybeAwaitable<HttpResponse>

class TestHttpClient implements HttpClientTransport {
  private _marshal: MarshalRequest
  constructor(options: TestTransportOptions) {
    this._marshal = options.marshal
  }

  marshal(
    request: HttpRequest,
    abortSignal: AbortSignal | undefined,
  ): MaybeAwaitable<HttpResponse> {
    return this._marshal(request, abortSignal)
  }
}

const REQUEST_TIMEOUT = Duration.ofMilli(100)

const NO_BODY: MarshalRequest = (_req: HttpRequest, _abort?: AbortSignal) => {
  return {
    status: {
      code: HttpStatusCode.NO_CONTENT,
    },
    headers: emptyHeaders(),
  }
}

const WITH_BODY: MarshalRequest = (_req: HttpRequest, _abort?: AbortSignal) => {
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
}

const DELAYED_BODY: MarshalRequest = async (
  _req: HttpRequest,
  _abort?: AbortSignal,
): Promise<HttpResponse> => {
  await delay(1)

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
}

describe("The HTTP Client should handle various state changes regardless of underlying provider", () => {
  it("Should handle a simple success case", async () => {
    const client: HttpClient = new HttpClientBuilder<TestTransportOptions>({
      name: "test.client",
      host: "localhost",
      marshal: NO_BODY,
    })
      .withTransport(TestHttpClient)
      .build()

    try {
      const response = await client.submit(createHttpRequest(), REQUEST_TIMEOUT)

      expect(response).not.toBeUndefined()
      expect(response.status.code).toBe(HttpStatusCode.NO_CONTENT)
      expect(response.body).toBeUndefined()
      expect(response.headers).not.toBeUndefined()
    } finally {
      client.close()
    }
  })

  it("Should handle a simplebody", async () => {
    const client: HttpClient = new HttpClientBuilder<TestTransportOptions>({
      name: "test.client",
      host: "localhost",
      marshal: WITH_BODY,
    })
      .withTransport(TestHttpClient)
      .build()

    try {
      const response = await client.submit(createHttpRequest(), REQUEST_TIMEOUT)
      expect(response).not.toBeUndefined()
      expect(response.status.code).toBe(HttpStatusCode.OK)
      expect(response.body).not.toBeUndefined()
      expect(response.headers).not.toBeUndefined()
      expect(response.body?.contents.readableObjectMode).toBe(true)

      for await (const obj of response.body!.contents) {
        expect(obj).not.toBeUndefined()
        expect(obj!.hello).toBe("world")
      }
    } finally {
      client.close()
    }
  })

  it("Should handle multiple async requests", async () => {
    const client: HttpClient = new HttpClientBuilder<TestTransportOptions>({
      name: "test.client",
      host: "localhost",
      marshal: DELAYED_BODY,
    })
      .withTransport(TestHttpClient)
      .build()

    const runner = async (): Promise<void> => {
      const response = await client.submit(
        createHttpRequest(),
        Duration.ofSeconds(1),
      )
      expect(response).not.toBeUndefined()
      expect(response.status.code).toBe(HttpStatusCode.OK)
      expect(response.body).not.toBeUndefined()
      expect(response.headers).not.toBeUndefined()
      expect(response.body?.contents.readableObjectMode).toBe(true)

      for await (const obj of response.body!.contents) {
        expect(obj).not.toBeUndefined()
        expect(obj!.hello).toBe("world")
      }
    }

    const promises: Promise<void>[] = []
    for (let n = 0; n < 40; ++n) {
      promises.push(runner())
    }

    try {
      const results = await Promise.allSettled(promises)
      for (const result of results) {
        expect(result.status).toBe("fulfilled")
      }
    } finally {
      client.close()
    }
  })
})
