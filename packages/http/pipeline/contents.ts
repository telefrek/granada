/**
 * Common content pipeline operations
 */

import { parseBody } from "../parsers.js"
import type { HttpOperationContext, HttpTransform } from "../pipeline.js"

export const PARSE_RESPONSE_BODY: HttpTransform = (
  context: HttpOperationContext,
) => {
  if (context.response?.body) {
    parseBody(context.response.headers, context.response.body)
  }

  return context
}

export const PARSE_REQUEST_BODY: HttpTransform = (
  context: HttpOperationContext,
) => {
  if (context.operation.request.body) {
    parseBody(context.operation.request.headers, context.operation.request.body)
  }

  return context
}
