/**
 * Http Server Pipeline defaults
 */

import type { MaybeAwaitable } from "@telefrek/core/index.js"
import {
  HttpStatusCode,
  type HttpHandler,
  type HttpRequest,
  type HttpResponse,
} from "../index.js"
import type { HttpPipelineConfiguration } from "../pipeline.js"
import {
  COMPRESS_RESPONSE_BODY,
  PARSE_REQUEST_BODY,
  VERIFY_RESPONSE_BODY_FOR_SEND,
} from "../pipeline/contents.js"
import { emptyHeaders } from "../utils.js"

export const DEFAULT_SERVER_PIPELINE_CONFIGURATION: HttpPipelineConfiguration =
  {
    requestTransforms: [PARSE_REQUEST_BODY],
    responseTransforms: [VERIFY_RESPONSE_BODY_FOR_SEND, COMPRESS_RESPONSE_BODY],
  }

export const NOT_FOUND_HANDLER: HttpHandler = (
  _: HttpRequest,
): MaybeAwaitable<HttpResponse> =>
  <HttpResponse>{
    status: {
      code: HttpStatusCode.NOT_FOUND,
    },
    headers: emptyHeaders(),
  }
