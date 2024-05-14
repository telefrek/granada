/**
 * Http Metrics
 */

import { ValueType } from "@opentelemetry/api"
import { getGranadaMeter } from "@telefrek/core/observability/metrics.js"
import { isNamedTransform, type NamedTransform } from "@telefrek/core/streams"
import type { Transform } from "stream"

/**
 * Metrics related to http request handling (server)
 */
export const HttpServerMetrics = {
  RequestStartedCounter: getGranadaMeter().createCounter(
    "http_incoming_request_received",
    {
      description: "The number of requests that have been received",
      valueType: ValueType.INT,
    },
  ),
  RequestFinishedCounter: getGranadaMeter().createCounter(
    "http_incoming_request_finished",
    {
      description: "The number of requests that have been finished",
      valueType: ValueType.INT,
    },
  ),
  /** Record the incoming request duration in seconds */
  IncomingRequestDuration: getGranadaMeter().createHistogram(
    "http_incoming_request_duration",
    {
      description: "The amount of time the incoming request took to complete",
      valueType: ValueType.DOUBLE,
      unit: "seconds",
      advice: {
        explicitBucketBoundaries: [
          0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 1,
        ],
      },
    },
  ),
  /** Record the number of requests that were shed */
  RequestsShedCounter: getGranadaMeter().createCounter(
    "http_incoming_request_shed_counter",
    {
      description:
        "The total count of requests that have been shed by the server",
      valueType: ValueType.INT,
    },
  ),
  /** Record the status for responses */
  ResponseStatus: getGranadaMeter().createCounter("http_response_status", {
    description:
      "The total number responses by status type the server has returned",
    valueType: ValueType.INT,
  }),
} as const

/**
 * Metrics related to routing statistics
 */
export const ApiRouteMetrics = {
  RouteErrors: getGranadaMeter().createCounter("unhandled_route_errors", {
    description: "The total number of unhandled errors from a specific route",
    valueType: ValueType.INT,
  }),
  RouteRequestDuration: getGranadaMeter().createHistogram(
    "incoming_route_duration",
    {
      description: "The amount of time the route request took to complete",
      valueType: ValueType.DOUBLE,
      unit: "seconds",
      advice: {
        explicitBucketBoundaries: [
          0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 1,
        ],
      },
    },
  ),
  RouteResponseStatus: getGranadaMeter().createCounter(
    "route_response_status",
    {
      description:
        "The total number responses by status type the route has returned",
      valueType: ValueType.INT,
    },
  ),
} as const

/**
 * Metrics related to pipeline processing
 */
export const HttpRequestPipelineMetrics = {
  /** Event that fires at each stage to track throughput */
  PipelineStageCounter: getGranadaMeter().createCounter(
    "http_pipeline_stage_invocations",
    {
      description: "The total number of invocations per stage in the pipeline",
      valueType: ValueType.INT,
    },
  ),
  PipelineWatermarkGauge: getGranadaMeter().createObservableGauge(
    "pipeline_watermarks",
    { description: "The watermarks for each stage", valueType: ValueType.INT },
  ),
  PipelineStageArrivalTime: getGranadaMeter().createHistogram(
    "pipeline_stage_arrival_time",
    {
      description:
        "The amount of time between a request being accepted to the indicated stage",
      valueType: ValueType.DOUBLE,
      unit: "seconds",
      advice: {
        explicitBucketBoundaries: [
          0.001, 0.002, 0.005, 0.01, 0.015, 0.025, 0.05, 0.075, 0.1, 0.5,
        ],
      },
    },
  ),
  /** Event that fires when the pipeline has backpressure */
  PipelineStageBackpressure: getGranadaMeter().createCounter(
    "http_pipeline_backpressure_events",
    {
      description:
        "The number of backpressure events fired at each stage in the pipeline",
      valueType: ValueType.INT,
    },
  ),
} as const

const MONITORED_TRANSFORMS: NamedTransform[] = []

export function removeTransform(transform: Transform): void {
  if (isNamedTransform(transform)) {
    const idx = MONITORED_TRANSFORMS.indexOf(transform)
    if (idx >= 0) {
      MONITORED_TRANSFORMS.splice(idx, 1)
    }
  }
}

export function monitorTransform(transform: Transform): void {
  if (isNamedTransform(transform)) {
    const idx = MONITORED_TRANSFORMS.indexOf(transform)
    if (idx < 0) {
      MONITORED_TRANSFORMS.push(transform)
    }
  }
}

// Hook the monitors to to keep this simple
HttpRequestPipelineMetrics.PipelineWatermarkGauge.addCallback((monitor) => {
  for (const transform of MONITORED_TRANSFORMS) {
    monitor.observe(transform.readableLength, {
      watermark: "read",
      transform: transform.name,
    })
    monitor.observe(transform.writableLength, {
      watermark: "write",
      transform: transform.name,
    })
  }
})

/**
 * Metrics related to request handling
 */
export const HttpRequestMetrics = {
  RequestTimeout: getGranadaMeter().createCounter("request_timeout_counter", {
    description: "The number of requests that were cancelled due to timeout",
    valueType: ValueType.INT,
  }),
  RequestDelayDuration: getGranadaMeter().createHistogram(
    "request_delay_duration",
    {
      description:
        "The amount of time between a request being accepted and handled via a pipeline",
      valueType: ValueType.DOUBLE,
      unit: "seconds",
      advice: {
        explicitBucketBoundaries: [
          0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 1,
        ],
      },
    },
  ),
} as const
