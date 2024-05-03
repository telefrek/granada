import { context, trace, type Tracer } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { GRANADA_VERSION } from "../version.js"

export { context as TracingContext } from "@opentelemetry/api"

/**
 * Build a tracer for the framework
 */
const FRAMEWORK_TRACER = trace.getTracer("granada-framework", GRANADA_VERSION)

/**
 * Try to register the {@link AsyncLocalStorageContextManager} to ensure it
 * tracks across async barriers
 *
 * @returns True if the async tracing was enabled
 */
export function enableAsyncTracing(): boolean {
  return context.setGlobalContextManager(new AsyncLocalStorageContextManager())
}

/**
 * Return the framework {@link Tracer}
 */
export function getTracer(): Tracer {
  return FRAMEWORK_TRACER
}
