/**
 * Helps to bootstrap the metrics for this framework
 */

import opentelemetry from "@opentelemetry/api"
import { getDebugInfo } from ".."

console.log("boatrace metrics...")

console.log(getDebugInfo(opentelemetry.metrics.getMeterProvider()))

/**
 * Setup our framework metrics
 */
export const GRANADA_METRICS_METER = opentelemetry.metrics
  .getMeterProvider()
  .getMeter("granada-framework-metrics", "1.0.0", {})

console.log(getDebugInfo(GRANADA_METRICS_METER))
