/**
 * Helps to bootstrap the metrics for this framework
 */

import opentelemetry, { ValueType, type Meter } from "@opentelemetry/api"
import type { HeapInfo, HeapSpaceInfo } from "v8"
/**
 * Setup our framework metrics
 */
export const GRANADA_METRICS_METER = opentelemetry.metrics
  .getMeterProvider()
  .getMeter("granada-framework-metrics", "1.0.0")

/**
 * Options for which metrics are enabled
 */
export interface NodeMetricEnabledOptions {
  v8: boolean
}

/**
 * Constant that enables all node metrics
 */
export const ALL_NODE_METRICS: NodeMetricEnabledOptions = {
  v8: true,
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

  if (options.v8) {
    await trackV8Metrics(nodeJSMeter)
  }
}

async function trackV8Metrics(meter: Meter): Promise<void> {
  // Import v8 as needed
  const v8 = await import("v8")

  // Read these on a cadence since it may be expensive
  let lastHeapValues: HeapSpaceInfo[] = []
  let lastHeapInfo: HeapInfo | undefined
  setInterval(() => {
    lastHeapValues = v8.getHeapSpaceStatistics()
    lastHeapInfo = v8.getHeapStatistics()
  }, 15_000)

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
