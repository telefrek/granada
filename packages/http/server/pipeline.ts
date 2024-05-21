/**
 * Http Server Pipeline defaults
 */

import {
  HttpStatusCode,
  type HttpHandler,
  type HttpRequest,
  type HttpResponse,
} from "../index.js"
import { type HttpPipelineConfiguration } from "../pipeline.js"
import { createServerConpressionMiddleware } from "../pipeline/contents.js"
import { emptyHeaders } from "../utils.js"

export const DEFAULT_SERVER_PIPELINE_CONFIGURATION: HttpPipelineConfiguration =
  {
    transforms: [],
    middleware: [createServerConpressionMiddleware()],
  }

export const NOT_FOUND_HANDLER: HttpHandler = async (
  _: HttpRequest,
): Promise<HttpResponse> => {
  return <HttpResponse>{
    status: {
      code: HttpStatusCode.NOT_FOUND,
    },
    headers: emptyHeaders(),
  }
}
