/**
 * Service definition and tooling for tests
 */

import { getDebugInfo, type MaybeAwaitable } from "@telefrek/core/index.js"
import { DefaultLogger, LogLevel, type Logger } from "@telefrek/core/logging.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import { HttpClientBuilder, type HttpClient } from "@telefrek/http/client.js"
import {
  HttpStatusCode,
  type HttpHandler,
  type HttpResponse,
} from "@telefrek/http/index.js"
import type { HttpOperationSource } from "@telefrek/http/operations.js"
import {
  createPipeline,
  type HttpPipeline,
  type HttpPipelineOptions,
} from "@telefrek/http/pipeline.js"
import type { HttpServer, HttpServerConfig } from "@telefrek/http/server.js"
import { NodeHttp2Server } from "@telefrek/http/server/http2.js"
import {
  DEFAULT_SERVER_PIPELINE_CONFIGURATION,
  NOT_FOUND_HANDLER,
} from "@telefrek/http/server/pipeline.js"
import { emptyHeaders } from "@telefrek/http/utils.js"
import { readFileSync } from "fs"
import { join } from "path"
import { HttpClientApi, HttpServerApi, bindApi } from "./api.js"
import { type ServiceError } from "./index.js"

export const TEST_LOGGER: Logger = new DefaultLogger({
  name: "test.logger",
  level: LogLevel.DEBUG,
})

export const ABORTED_RESPONSE: HttpResponse = {
  status: {
    code: HttpStatusCode.INTERNAL_SERVER_ERROR,
    message: "Aborted",
  },
  headers: emptyHeaders(),
}

export function createHttp2Server(certDir: string): HttpServer {
  TEST_LOGGER.info(`Getting certs from ${certDir}`)
  const config: HttpServerConfig = {
    name: "TestServer",
    tls: {
      mutualAuthentication: false,
      publicCertificate: readFileSync(join(certDir, "cert.pem")),
      privateKey: readFileSync(join(certDir, "key.pem")),
    },
  }

  return new NodeHttp2Server(config, TEST_LOGGER)
}

export function runServerPipeline(
  source: HttpOperationSource,
  handler: HttpHandler = NOT_FOUND_HANDLER,
  options?: HttpPipelineOptions,
): HttpPipeline {
  const pipeline = createPipeline(DEFAULT_SERVER_PIPELINE_CONFIGURATION)

  pipeline.add(source, handler, options)
  return pipeline
}

let CLIENT: Optional<HttpClient>

export function createHttp2Client(certDir: string, port: number): HttpClient {
  return (
    CLIENT ??
    (CLIENT = new HttpClientBuilder({
      name: "TestClient",
      host: "localhost",
      port,
      tls: {
        certificateAuthority: readFileSync(join(certDir, "cert.pem")),
      },
    })
      .build()
      .on("error", (error) => TEST_LOGGER.fatal(`Client Error: ${error}`)))
  )
}

export interface TestItem {
  id: number
  name: string
  createdAt?: number
}

export interface ItemData {
  name: string
}

export interface TestService {
  createItem(create: ItemData): MaybeAwaitable<TestItem>
  getItem(itemId: number): MaybeAwaitable<Optional<TestItem>>
  // updateItem(update: TestItem): ServiceResponse<TestItem>
}

export function getTestClient(provider: () => HttpClient): TestService {
  return bindApi<TestService>(provider, {
    getItem: HttpClientApi.httpGet("/test/items/:itemId", (id) => {
      return {
        itemId: id,
      }
    }),
    createItem: HttpClientApi.httpPost("/test/items", (item) => {
      return {
        body: item,
      }
    }),
  })
}

@HttpClientApi.enable(() => CLIENT!)
export class TestClient2 implements TestService {
  @HttpClientApi.post("/test/items", (data) => {
    return { body: data }
  })
  createItem(_: ItemData): MaybeAwaitable<TestItem> {
    throw new Error("Method not implemented.")
  }
  @HttpClientApi.get("/test/items/:itemId", (id) => {
    return { itemId: id }
  })
  getItem(_: number): MaybeAwaitable<Optional<TestItem>> {
    throw new Error("Method not implemented.")
  }
}

let CURRENT_ID: number = 2

function makeServiceResponse<T>(error: ServiceError) {
  return error as T
}

@HttpServerApi.enable({
  pathPrefix: "/test",
})
export class TestServiceServer implements TestService {
  private items: Map<number, TestItem> = new Map([
    [1, { id: 1, createdAt: Date.now(), name: "foo" }],
  ])

  @HttpServerApi.post("/items", (details) => [details.body! as ItemData])
  createItem(create: ItemData): MaybeAwaitable<TestItem> {
    if (create === undefined) {
      return makeServiceResponse({ code: 400, message: "Missing body" })
    }

    const item: TestItem = {
      id: CURRENT_ID++,
      createdAt: Date.now(),
      name: create.name,
    }
    this.items.set(item.id, item)

    return item
  }

  @HttpServerApi.get("/items/:itemId", (details) => [details.itemId as number])
  getItem(itemId: number): MaybeAwaitable<Optional<TestItem>> {
    const item = this.items.get(itemId)
    TEST_LOGGER.info(`Got item: ${getDebugInfo(item)} for ${itemId}`)
    return item
  }

  updateItem(update: TestItem): MaybeAwaitable<TestItem> {
    if (update === undefined) {
      return makeServiceResponse({ code: 400, message: "Missing body" })
    }

    const item = this.items.get(update.id)
    if (item) {
      item.name = update.name
      return item
    }

    return makeServiceResponse({ code: 404, message: "Item does not exist" })
  }
}
