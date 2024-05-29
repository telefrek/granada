/**
 * Testing the service infra
 */

import { type MaybeAwaitable } from "@telefrek/core/index.js"
import type { HttpClient } from "@telefrek/http/client.js"
import type { HttpServer } from "@telefrek/http/server.js"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { isServiceError } from "./index.js"
import {
  TestClient2,
  TestServiceServer,
  createHttp2Client,
  createHttp2Server,
  getTestClient,
  type TestService,
} from "./testUtils.js"
import { ServicePipelineBuilder } from "./util.js"

describe("Services should work for basic use cases", () => {
  let server: HttpServer
  let client: HttpClient
  let promise: MaybeAwaitable<void>
  let api: TestService
  let api2: TestService

  beforeAll(async () => {
    const port = 20000 + ~~(Math.random() * 10000)
    const certDir = join(
      import.meta.dirname ?? dirname(fileURLToPath(import.meta.url)),
      "../../resources/test",
    )

    server = createHttp2Server(certDir)
    client = createHttp2Client(certDir, port)

    api = getTestClient(() => client)
    api2 = new TestClient2()

    promise = new ServicePipelineBuilder(server)
      .withApi(new TestServiceServer())
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
    let response = await api.getItem(1)
    expect(response).not.toBeUndefined()
    expect(isServiceError(response)).toBeFalsy()
    if (response) {
      expect(response.id).toBe(1)
      expect(response.name).toBe("foo")
    }

    response = await api.getItem(2)
    expect(response).toBeUndefined()

    response = await api.createItem({ name: "bar" })
    expect(response).not.toBeUndefined()
    if (response) {
      expect(response.id).toBe(2)
      expect(response.name).toBe("bar")
    }

    response = await api2.getItem(2)
    expect(response).not.toBeUndefined()
  }, 600_000)
})
