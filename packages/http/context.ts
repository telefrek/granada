/**
 * Handling context tracking for an operation
 */

import { EmitterFor, type Emitter } from "@telefrek/core/events.js"
import type { FrameworkPriority } from "@telefrek/core/index.js"
import type { TaskCompletionEvents } from "@telefrek/core/tasks.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import { AsyncLocalStorage } from "async_hooks"
import type { HttpHandler, HttpResponse } from "./index.js"
import { HttpRequestPipelineMetrics } from "./metrics.js"
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
export interface HttpOperationContext extends Emitter<TaskCompletionEvents> {
  operation: HttpOperation
  response?: HttpResponse
  handler?: HttpHandler
  priority?: FrameworkPriority
  concurrency?: number

  [key: string | symbol]: unknown
}

export class DefaultHttpOperationContext
  extends EmitterFor<TaskCompletionEvents>
  implements HttpOperationContext
{
  operation: HttpOperation
  response: Optional<HttpResponse>
  handler: Optional<HttpHandler>
  priority: Optional<FrameworkPriority>
  concurrency?: number

  constructor(operation: HttpOperation) {
    super()
    this.operation = operation

    this.operation.on("finished", () => {
      const failed =
        this.operation.state !== HttpOperationState.COMPLETED ||
        (this.response?.status.code ?? 500) >= 500

      if (this.concurrency) {
        HttpRequestPipelineMetrics.PipelineContextConcurrencyHistogram.record(
          this.concurrency,
        )
      }

      if (failed) {
        HttpRequestPipelineMetrics.PipelineContextFailureCounter.add(1)
      }

      this.emit("completed", this.operation.duration, !failed)
    })
  }
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
