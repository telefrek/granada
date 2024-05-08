import { context, trace as Trace, type Tracer } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import type { AnyArgs, Func } from "../type/utils.js"
import { GRANADA_VERSION } from "../version.js"

export { trace as Tracing, context as TracingContext } from "@opentelemetry/api"

/**
 * Build a tracer for the framework
 */
const FRAMEWORK_TRACER = Trace.getTracer("granada-framework", GRANADA_VERSION)

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

/**
 * Mark a method as able to receive requests
 *
 * @param options The {@link RouteOptions} for this method
 * @returns A decorated method that hooks the api routes to this method
 */
export function trace(nameExtractor?: string | Func<AnyArgs, string>) {
  return (
    _classPrototype: unknown,
    methodName: string,
    descriptor: PropertyDescriptor,
  ): void => {
    if (typeof descriptor.value === "function") {
      const original = descriptor.value as Func<AnyArgs, unknown>

      // Get the name
      const getName: Func<AnyArgs, string> =
        typeof nameExtractor === "function"
          ? nameExtractor
          : (..._: AnyArgs) => nameExtractor ?? methodName

      descriptor.value = (...args: AnyArgs) => {
        const span = getTracer().startSpan(`${getName(...args)}`)
        try {
          return context.with(
            Trace.setSpan(context.active(), span),
            async () => {
              return await original(...args)
            },
          )
        } finally {
          span.end()
        }
      }
    } else {
      throw new Error("Invalid target for decorator!")
    }
  }
}
