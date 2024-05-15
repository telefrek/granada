/**
 * Handling context tracking for an operation
 */

import type { FrameworkPriority } from "@telefrek/core"
import type { Optional } from "@telefrek/core/type/utils.js"
import { AsyncLocalStorage } from "async_hooks"
import type { HttpHandler, HttpResponse } from "./index.js"
import { HttpOperationState, type HttpOperation } from "./operations.js"

export const HTTP_OPERATION_CONTEXT_STORE: AsyncLocalStorage<HttpOperationContext> =
  new AsyncLocalStorage()

/**
 * Retrieves the current opation context
 *
 * @returns The current operation context
 */
export function getOperationContext(): Optional<HttpOperationContext> {
  return HTTP_OPERATION_CONTEXT_STORE.getStore()
}

export function getOperationContextKey<T>(key: symbol | string): Optional<T> {
  const opContext = getOperationContext()
  return opContext ? (opContext[key] as T) : undefined
}

export function setOperationContextKey<T>(
  key: symbol | string,
  context: T,
): void {
  const opContext = getOperationContext()
  if (opContext) {
    opContext[key] = context
  }
}

/**
 * Context for the current {@link HttpOperation} as it moves through a {@link HttpPipeline}
 */
export interface HttpOperationContext {
  operation: HttpOperation
  response?: HttpResponse
  handler?: HttpHandler
  priority?: FrameworkPriority

  [key: string | symbol]: unknown
}

/**
 * Check to see if the context is in a request processing phase
 *
 * @param context The {@link HttpOperationContext} to examine
 *
 * @returns True if the context is effectively finished
 */
export function isTerminal(context: HttpOperationContext): boolean {
  switch (context.operation.state) {
    case HttpOperationState.ABORTED:
    case HttpOperationState.TIMEOUT:
    case HttpOperationState.COMPLETED:
      return true
  }

  return false
}

/**
 * Check to see if the context is in a request processing phase
 *
 * @param context The {@link HttpOperationContext} to examine
 *
 * @returns True if the context is currently processing the request
 */
export function isInRequestPhase(context: HttpOperationContext): boolean {
  switch (context.operation.state) {
    case HttpOperationState.READING:
    case HttpOperationState.PROCESSING:
      return !context.response
  }

  return false
}

/**
 * Check to see if the context is in a response processing phase
 *
 * @param context The {@link HttpOperationContext} to examine
 *
 * @returns True if the context is currently processing the response
 */
export function isInResponsePhase(context: HttpOperationContext): boolean {
  switch (context.operation.state) {
    case HttpOperationState.WRITING:
    case HttpOperationState.PROCESSING:
      return context.response !== undefined
  }

  return false
}
