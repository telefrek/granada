/**
 * Helps to bootstrap the metrics for this framework
 */

import opentelemetry from "@opentelemetry/api"

/**
 * Setup our framework metrics
 */
export const FRAMEWORK_METRICS_METER = opentelemetry.metrics.getMeter(
  "granada-framework-metrics",
  "1.0.0",
)
