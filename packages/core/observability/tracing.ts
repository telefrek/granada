import { trace, type Context, type Tracer } from "@opentelemetry/api"
import type { Optional } from "../type/utils.js"
import { GRANADA_VERSION } from "../version.js"

const _tracer = trace.getTracer("granada-framework", GRANADA_VERSION)

/**
 * Return the current tracer
 */
export function getTracer(): Tracer {
  return _tracer
}

/**
 * Helper method to get the current trace context from objects that might not
 * have it
 */
export interface TraceableContext {
  context: Optional<Context>
}

/**
 * Type Guard for extracting {@link TraceableContext} implementations
 *
 * @param object The object to inspect
 * @returns True if the object has a non-null span property
 */
function isTraceableContext(object: unknown): object is TraceableContext {
  return (
    typeof object === "object" &&
    object !== null &&
    "context" in object &&
    object.context !== undefined
  )
}

/**
 * Extract the trace context from an object
 *
 * @param object The object to try to extract context from
 * @returns A {@link Span} if one is found or undefined if not
 */
export function extractTraceContext(object: unknown): Optional<Context> {
  return isTraceableContext(object) ? object.context : undefined
}
