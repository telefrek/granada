/**
 * Set of classes that are used for testing only
 */

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
import { DEFAULT_CLIENT_PIPELINE_CONFIGURATION } from "./client/pipeline.js"
import { type HttpOperationSource } from "./index.js"
import { createPipeline, type HttpPipeline } from "./pipeline.js"
import type { HttpServer, HttpServerConfig } from "./server.js"
import { NodeHttp2Server } from "./server/http2.js"
import { NOT_FOUND_HANDLER } from "./server/pipeline.js"

export const TEST_LOGGER: Logger = new DefaultLogger({
  name: "test.logger",
  level: LogLevel.INFO,
  writer: new ConsoleLogWriter(),
  includeTimestamps: true,
})

export function createHttp2Server(
  pipeline: HttpPipeline = createPipeline(
    DEFAULT_CLIENT_PIPELINE_CONFIGURATION,
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
  if (!pipeline.add(server as HttpOperationSource, NOT_FOUND_HANDLER, {})) {
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
