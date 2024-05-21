/**
 * Testing the service infra
 */

import { getDebugInfo, type MaybeAwaitable } from "@telefrek/core/index.js"
import { consumeJsonStream } from "@telefrek/core/json.js"
import type { HttpClient } from "@telefrek/http/client.js"
import { HttpMethod, HttpStatusCode } from "@telefrek/http/index.js"
import type { HttpServer } from "@telefrek/http/server.js"
import {
  TEST_LOGGER,
  createHttp2Client,
  createHttp2Server,
} from "@telefrek/http/testUtils.js"
import { createRequest, jsonBody } from "@telefrek/http/utils.js"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { TestService, type TestItem } from "./testUtils.js"
import { ServicePipelineBuilder } from "./util.js"

describe("Services should work for basic use cases", () => {
  let server: HttpServer
  let client: HttpClient
  let promise: MaybeAwaitable<void>

  beforeAll(async () => {
    const port = 20000 + ~~(Math.random() * 10000)
    const certDir = join(
      import.meta.dirname ?? dirname(fileURLToPath(import.meta.url)),
      "../../resources/test",
    )

    server = createHttp2Server(certDir)
    client = createHttp2Client(certDir, port)

    promise = new ServicePipelineBuilder(server)
      .withApi(new TestService())
      .run(port)
  })

  afterAll(async () => {
    if (client) {
      await client.close()
    }

    if (server) {
      await server.close(false)
    }

    if (promise) {
      await promise
    }
  })

  it("Should be able to contact the service", async () => {
    let response = await client.submit(
      createRequest({
        path: "/test/items",
        method: HttpMethod.POST,
        body: jsonBody({ name: "foo" }),
      }),
    )

    // Expect a response with no content
    expect(response.status.code).toBe(HttpStatusCode.CREATED)
    expect(response.body).not.toBeUndefined()
    const body = await consumeJsonStream<TestItem>(response.body!.contents)
    expect(body).not.toBeUndefined()

    TEST_LOGGER.info(`Got item: ${getDebugInfo(body)}`)

    response = await client.submit(
      createRequest({
        path: `/test/items/${(body as TestItem).id}`,
      }),
    )

    expect(response.status.code).toBe(HttpStatusCode.OK)
    expect(response.body).not.toBeUndefined()
    const item = await consumeJsonStream<TestItem>(response.body!.contents)
    expect(item).toStrictEqual(body)
  })
})
