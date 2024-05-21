import {
  trace as Tracing,
  context as TracingContext,
  type Span,
  type Tracer,
} from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { isPromise } from "util/types"
import { registerContextTracker } from "../context.js"
import { info } from "../logging.js"
import type {
  AnyArgs,
  Func,
  MaybeAwaitableAny,
  Optional,
} from "../type/utils.js"
import { GRANADA_VERSION } from "../version.js"

export { trace as Tracing, context as TracingContext } from "@opentelemetry/api"

/**
 * Build a tracer for the framework
 */
let FRAMEWORK_TRACER: Optional<Tracer>

/**
 * Try to register the {@link AsyncLocalStorageContextManager} to ensure it
 * tracks across async barriers as well as hooking up span context tracking
 *
 * @returns True if the async tracing was enabled
 */
export function enableAsyncTracing(): boolean {
  registerContextTracker({
    name: "SpanTracker",
    wrap(target) {
      const span = getActiveSpan()

      if (span) {
        return (...args: AnyArgs): MaybeAwaitableAny => {
          return TracingContext.with(
            Tracing.setSpan(TracingContext.active(), span),
            async () => {
              return await target(...args)
            },
          )
        }
      }

      return target
    },
  })

  return TracingContext.setGlobalContextManager(
    new AsyncLocalStorageContextManager(),
  )
}

/**
 * Return the framework {@link Tracer}
 */
export function getTracer(): Tracer {
  return (
    FRAMEWORK_TRACER ??
    (FRAMEWORK_TRACER = Tracing.getTracer("granada-framework", GRANADA_VERSION))
  )
}

interface NamedSpan extends Span {
  name: string
}

export function getActiveSpan(): Optional<Span> {
  return Tracing.getActiveSpan()
}

export function checkTracing(checkpoint: string): void {
  const span = Tracing.getActiveSpan()
  if (span && span.isRecording()) {
    info(`[${checkpoint}]: Span ${(span as NamedSpan).name ?? "unknown name"}`)
  } else {
    info(`[${checkpoint}]: No Span`)
  }
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
      const original = descriptor.value as Func<AnyArgs, MaybeAwaitableAny>

      // Get the name
      const getName: Func<AnyArgs, string> =
        typeof nameExtractor === "function"
          ? nameExtractor
          : (..._: AnyArgs) => nameExtractor ?? methodName

      descriptor.value = (...args: AnyArgs) => {
        const span = getTracer().startSpan(`${getName(...args)}`)
        let isAsync = false
        try {
          const response = TracingContext.with(
            Tracing.setSpan(TracingContext.active(), span),
            () => {
              return original(...args)
            },
          )

          // Check if this is a promise
          if (isPromise(response)) {
            isAsync = true
            return response.finally(() => span.end())
          }

          return response
        } finally {
          if (!isAsync) {
            span.end()
          }
        }
      }
    } else {
      throw new Error("Invalid target for decorator!")
    }
  }
}
