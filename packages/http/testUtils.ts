/**
 * Set of classes that are used for testing only
 */

import { consumeJsonStream } from "@telefrek/core/json"
import {
  ConsoleLogWriter,
  DefaultLogger,
  LogLevel,
  type Logger,
} from "@telefrek/core/logging.js"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { HttpClientBuilder, type HttpClient } from "./client.js"
import {
  HttpMethod,
  HttpStatusCode,
  type HttpHandler,
  type HttpResponse,
} from "./index.js"
import type { HttpOperationSource } from "./operations.js"
import { createPipeline, type HttpPipeline } from "./pipeline.js"
import { createRouter, getRoutingParameters, type Router } from "./routing.js"
import type { HttpServer, HttpServerConfig } from "./server.js"
import { NodeHttp2Server } from "./server/http2.js"
import {
  DEFAULT_SERVER_PIPELINE_CONFIGURATION,
  NOT_FOUND_HANDLER,
} from "./server/pipeline.js"
import {
  emptyHeaders,
  invalidRequest,
  jsonBody,
  jsonContents,
  noContents,
  notAllowed,
} from "./utils.js"

export const TEST_LOGGER: Logger = new DefaultLogger({
  name: "test.logger",
  level: LogLevel.INFO,
  writer: new ConsoleLogWriter(),
  includeTimestamps: true,
})

export const ABORTED_RESPONSE: HttpResponse = {
  status: {
    code: HttpStatusCode.INTERNAL_SERVER_ERROR,
    message: "Aborted",
  },
  headers: emptyHeaders(),
}

/**
 * Creates a test {@link Router} for paths with various behavior
 *
 * @returns A {@link Router} that can be used to handle certain requests
 */
export function createTestRouter(): Router {
  const router = createRouter()

  // Accept everything to route1
  router.addHandler("/route1", (_, abort) => {
    if (abort?.aborted) {
      return ABORTED_RESPONSE
    }

    return noContents()
  })

  // Manipulate an item
  router.addHandler("/route2/:itemId", async (req, abort) => {
    if (abort?.aborted) {
      return ABORTED_RESPONSE
    }

    const parameters = getRoutingParameters()
    const itemId = parameters?.get("itemId")
    const body = req.body
      ? await consumeJsonStream(req.body.contents)
      : undefined

    if (itemId) {
      switch (req.method) {
        case HttpMethod.HEAD:
          return noContents()
        case HttpMethod.GET:
          return jsonContents({ itemId: itemId })
        case HttpMethod.PUT:
        case HttpMethod.PATCH:
          return body
            ? jsonContents(body, HttpStatusCode.ACCEPTED)
            : invalidRequest()
      }

      return notAllowed()
    }

    return invalidRequest()
  })

  // Add a route where we need to cleanup what we got back and don't consume the body
  router.addHandler("/route3", (req, abort) => {
    if (abort?.aborted) {
      return ABORTED_RESPONSE
    }

    // if (req.body) await drain(req.body?.contents)

    return {
      status: {
        code: HttpStatusCode.OK,
      },
      headers: emptyHeaders(),
      body: jsonBody({ foo: "bar" }),
    }
  })

  return router
}

export function createHttp2Server(
  handler: HttpHandler = NOT_FOUND_HANDLER,
  pipeline: HttpPipeline = createPipeline(
    DEFAULT_SERVER_PIPELINE_CONFIGURATION,
  ),
): HttpServer {
  const config: HttpServerConfig = {
    name: "TestServer",
    tls: {
      mutualAuthentication: false,
      publicCertificate: readFileSync(
        join(
          import.meta.dirname ?? dirname(fileURLToPath(import.meta.url)),
          "../../resources/test/cert.pem",
        ),
      ),
      privateKey: readFileSync(
        join(
          import.meta.dirname ?? dirname(fileURLToPath(import.meta.url)),
          "../../resources/test/key.pem",
        ),
      ),
    },
  }

  const server: HttpServer = new NodeHttp2Server(config, TEST_LOGGER)
  if (!pipeline.add(server as HttpOperationSource, handler, {})) {
    TEST_LOGGER.error(`Failed to add server to pipeline!`)
  }

  return server
}

export function createHttp2Client(port: number): HttpClient {
  return new HttpClientBuilder({
    name: "TestClient",
    host: "localhost",
    port,
    tls: {
      certificateAuthority: readFileSync(
        join(
          import.meta.dirname ?? dirname(fileURLToPath(import.meta.url)),
          "../../resources/test/cert.pem",
        ),
      ),
    },
  })
    .withLogger(TEST_LOGGER)
    .build()
    .on("error", (error) => TEST_LOGGER.fatal(`Client Error: ${error}`))
}
