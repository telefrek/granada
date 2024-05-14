/**
 * Helps to bootstrap the metrics for this framework
 */

import opentelemetry, {
  ValueType,
  createNoopMeter,
  type Meter,
} from "@opentelemetry/api"
import type { EventLoopUtilization } from "perf_hooks"
import type { HeapInfo, HeapSpaceInfo } from "v8"
import { registerShutdown } from "../lifecycle.js"
import type { Optional } from "../type/utils.js"
import { GRANADA_VERSION } from "../version.js"

let _metricsEnabled = false
let _meter = createNoopMeter()

/**
 * Create scaffolding that will be a NO_OP unless {@link enableGranadaMetrics}
 * is invoked
 */

export function getGranadaMeter(): Meter {
  return _meter
}

/**
 * Options for which metrics are enabled
 */
export interface NodeMetricEnabledOptions {
  heap: boolean
  gc: boolean
  eventLoop: boolean
}

/**
 * Constant that enables all node metrics
 */
export const ALL_NODE_METRICS: NodeMetricEnabledOptions = {
  heap: true,
  gc: true,
  eventLoop: true,
}

/**
 * Enable the core Granada framework metrics
 */
export function enableGranadaMetrics(): void {
  if (!_metricsEnabled) {
    _meter = opentelemetry.metrics
      .getMeterProvider()
      .getMeter("granada-framework-metrics", GRANADA_VERSION)
  }
  _metricsEnabled = true
}

/**
 * Enable tracking node metrics
 *
 * @param options The {@link NodeMetricEnabledOptions} to use (default is
 * {@link ALL_NODE_METRICS}))
 */
export async function enableNodeCoreMetrics(
  options: NodeMetricEnabledOptions = ALL_NODE_METRICS,
): Promise<void> {
  const nodeJSMeter = opentelemetry.metrics
    .getMeterProvider()
    .getMeter("NodeJS", process.version)

  if (options.heap) {
    await trackHeapMetrics(nodeJSMeter)
  }

  if (options.gc) {
    await trackGC(nodeJSMeter)
  }

  if (options.eventLoop) {
    await trackEventLoop(nodeJSMeter)
  }
}

/** Helper type */
interface GCDetails {
  kind: number
  flags: number
}

/**
 * Add GC metrics based on perf_hooks {@link PerformanceObserver}
 *
 * @param meter The {@link Meter} to add metrics to
 */
async function trackGC(meter: Meter): Promise<void> {
  const { constants, PerformanceObserver } = await import("perf_hooks")

  const gcTypes = {
    [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: "incremental",
    [constants.NODE_PERFORMANCE_GC_MAJOR]: "major",
    [constants.NODE_PERFORMANCE_GC_MINOR]: "minor",
    [constants.NODE_PERFORMANCE_GC_WEAKCB]: "weak_callbacks",
  } as const

  const histogram = meter.createHistogram("node_gc_duration", {
    description: "Node GC time per collection type",
    unit: "s",
    valueType: ValueType.DOUBLE,
    advice: {
      explicitBucketBoundaries: [
        0.001, 0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1,
      ],
    },
  })

  // Start the observer
  new PerformanceObserver((entries) => {
    for (const entry of entries.getEntriesByType("gc")) {
      const details = entry.detail! as GCDetails
      histogram.record(Number.parseFloat((entry.duration / 1000).toFixed(6)), {
        kind: gcTypes[details.kind] ?? "unmapped",
      })
    }
  }).observe({ entryTypes: ["gc"] })
}

/**
 * Track event loop utilization via the exposed `eventLoopUtilization`
 * performance method
 *
 * @param meter The {@link Meter} to add metrics to
 */
async function trackEventLoop(meter: Meter): Promise<void> {
  const performance = (await import("perf_hooks")).performance

  let previous: Optional<EventLoopUtilization>

  meter
    .createObservableGauge("event_loop_utilization", {
      description:
        "A measure of how much the event loop was utilized during the past collection period",
      valueType: ValueType.DOUBLE,
    })
    .addCallback((result) => {
      const current = performance.eventLoopUtilization()

      // Check if we are calculating a delta
      if (previous) {
        const utilization = performance.eventLoopUtilization(previous, current)

        result.observe(utilization.utilization)
      } else {
        // Default to the current utilization metrics
        result.observe(current.utilization)
      }

      previous = current
    })
}

/**
 * Adds heap information and statistics
 *
 * @param meter The {@link Meter} to add metrics to
 */
async function trackHeapMetrics(meter: Meter): Promise<void> {
  // Import v8 as needed
  const { getHeapSpaceStatistics, getHeapStatistics } = await import("v8")

  // Read these on a cadence since it may be expensive
  let lastHeapValues: HeapSpaceInfo[] = []
  let lastHeapInfo: Optional<HeapInfo>
  const interval = setInterval(() => {
    lastHeapValues = getHeapSpaceStatistics()
    lastHeapInfo = getHeapStatistics()
  }, 15_000)

  registerShutdown(()=>{
    clearInterval(interval)
  })

  meter
    .createObservableGauge("heap_space_used_size", {
      description: "The amount of heap used by space",
      unit: "bytes",
      valueType: ValueType.INT,
    })
    .addCallback((result) => {
      const spaces = lastHeapValues

      for (const space of spaces) {
        result.observe(space.space_used_size, { space: space.space_name })
      }
    })

  meter
    .createObservableGauge("heap_space_available_size", {
      description: "The amount of heap available by space",
      unit: "bytes",
      valueType: ValueType.INT,
    })
    .addCallback((result) => {
      const spaces = lastHeapValues

      for (const space of spaces) {
        result.observe(space.space_available_size, { space: space.space_name })
      }
    })

  meter
    .createObservableGauge("heap_space_physical_size", {
      description: "The amount of physical heap memory used by space",
      unit: "bytes",
      valueType: ValueType.INT,
    })
    .addCallback((result) => {
      const spaces = lastHeapValues

      for (const space of spaces) {
        result.observe(space.physical_space_size, { space: space.space_name })
      }
    })

  meter
    .createObservableGauge("node_memory_info", {
      description: "unknown",
      unit: "bytes",
      valueType: ValueType.INT,
    })
    .addCallback((result) => {
      const usage = lastHeapInfo
      if (usage) {
        result.observe(usage.external_memory, { segment: "external_memory" })
        result.observe(usage.malloced_memory, { segment: "malloced_memory" })
        result.observe(usage.total_heap_size, { segment: "total_heap_size" })
        result.observe(usage.total_physical_size, {
          segment: "total_physical_size",
        })
        result.observe(usage.used_heap_size, { segment: "used_heap_size" })
        result.observe(usage.total_global_handles_size, {
          segment: "total_global_handles_size ",
        })
      }
    })

  meter
    .createObservableGauge("node_memory_handles", {
      description: "..",
      valueType: ValueType.INT,
    })
    .addCallback((result) => {
      const usage = lastHeapInfo
      if (usage) {
        result.observe(usage.number_of_native_contexts, { context: "native" })
        result.observe(usage.number_of_detached_contexts, {
          context: "detached",
        })
      }
    })
}
