/**
 * Service definition and tooling for tests
 */

import { getDebugInfo } from "@telefrek/core/index.js"
import {
  ConsoleLogWriter,
  DefaultLogger,
  LogLevel,
  type Logger,
} from "@telefrek/core/logging.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import { HttpClientBuilder, type HttpClient } from "@telefrek/http/client.js"
import {
  HttpMethod,
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
import type { RoutingParameters } from "@telefrek/http/routing.js"
import type { HttpServer, HttpServerConfig } from "@telefrek/http/server.js"
import { NodeHttp2Server } from "@telefrek/http/server/http2.js"
import {
  DEFAULT_SERVER_PIPELINE_CONFIGURATION,
  NOT_FOUND_HANDLER,
} from "@telefrek/http/server/pipeline.js"
import { emptyHeaders } from "@telefrek/http/utils.js"
import { readFileSync } from "fs"
import { join } from "path"
import { routableApi, route } from "./decorators.js"
import { SerializationFormat, type ServiceResponse } from "./index.js"

export const TEST_LOGGER: Logger = new DefaultLogger({
  name: "test.logger",
  level: LogLevel.INFO,
  writer: new ConsoleLogWriter(),
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

export function createHttp2Client(certDir: string, port: number): HttpClient {
  return new HttpClientBuilder({
    name: "TestClient",
    host: "localhost",
    port,
    tls: {
      certificateAuthority: readFileSync(join(certDir, "cert.pem")),
    },
  })
    .withLogger(TEST_LOGGER)
    .build()
    .on("error", (error) => TEST_LOGGER.fatal(`Client Error: ${error}`))
}

export interface TestItem {
  id: number
  name: string
  createdAt?: number
}

export interface ItemData {
  name: string
}

let CURRENT_ID: number = 1

@routableApi({
  pathPrefix: "/test",
})
export class TestService {
  private items: Map<number, TestItem> = new Map()

  @route({
    template: "/items",
    method: HttpMethod.POST,
    mapping: <ItemData>(
      _parameters: Optional<RoutingParameters>,
      body?: ItemData,
    ) => {
      return [body]
    },
    format: SerializationFormat.JSON,
  })
  createItem(create: ItemData): ServiceResponse<TestItem> {
    if (create === undefined) {
      return { code: 400, message: "Missing body" }
    }

    const item: TestItem = {
      id: CURRENT_ID++,
      createdAt: Date.now(),
      name: create.name,
    }
    this.items.set(item.id, item)

    return item
  }

  @route({
    template: "/items/:itemId",
    method: HttpMethod.GET,
    mapping: (parameters: Optional<RoutingParameters>, _?: unknown) => {
      TEST_LOGGER.info(`mapping parameters: ${getDebugInfo(parameters)}`)
      return [parameters?.get("itemId")]
    },
  })
  getItem(itemId: number): Optional<TestItem> {
    TEST_LOGGER.info(`Received itemId: ${itemId}`)
    return this.items.get(itemId)
  }

  @route({
    template: "/items/:itemId",
    method: HttpMethod.PATCH,
    mapping: <ItemData>(
      parameters: Optional<RoutingParameters>,
      body?: ItemData,
    ) => {
      return [parameters?.get("itemId"), body]
    },
  })
  updateItem(itemId: number, update: ItemData): ServiceResponse<TestItem> {
    if (update === undefined) {
      return { code: 400, message: "Missing body" }
    }

    const item = this.items.get(itemId)
    if (item) {
      item.name = update.name
      return item
    }

    return { code: 404, message: "Item does not exist" }
  }
}
