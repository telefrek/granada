/**
 * Helps to bootstrap the metrics for this framework
 */

import opentelemetry from "@opentelemetry/api"
/**
 * Setup our framework metrics
 */
export const GRANADA_METRICS_METER = opentelemetry.metrics
  .getMeterProvider()
  .getMeter("granada-framework-metrics", "1.0.0", {})
