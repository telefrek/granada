/**
 * Http Metrics
 */

import { ValueType } from "@opentelemetry/api"
import { GRANADA_METRICS_METER } from "@telefrek/core/observability/metrics.js"

/**
 * Metrics related to http request handling (server)
 */
export const HttpServerMetrics = {
  IncomingRequests: GRANADA_METRICS_METER.createCounter(
    "http_incoming_requests",
    {
      description:
        "The total number of incoming requests that a server has received",
      valueType: ValueType.INT,
    },
  ),
  IncomingRequestDuration: GRANADA_METRICS_METER.createHistogram(
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
  RequestsShedCounter: GRANADA_METRICS_METER.createCounter(
    "http_incoming_request_shed_counter",
    {
      description:
        "The total count of requests that have been shed by the server",
      valueType: ValueType.INT,
    },
  ),
  ResponseStatus: GRANADA_METRICS_METER.createCounter("http_response_status", {
    description:
      "The total number responses by status type the server has returned",
    valueType: ValueType.INT,
  }),
} as const

/**
 * Metrics related to routing statistics
 */
export const ApiRouteMetrics = {
  RouteRequests: GRANADA_METRICS_METER.createCounter(
    "incoming_route_requests",
    {
      description: "The total number of incoming requests to a specific route",
      valueType: ValueType.INT,
    },
  ),
  RouteRequestDuration: GRANADA_METRICS_METER.createHistogram(
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
  RouteResponseStatus: GRANADA_METRICS_METER.createCounter(
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
  PipelineExecutions: GRANADA_METRICS_METER.createCounter(
    "pipeline_stage_counter",
    {
      description: "The number of times a given pipeline stage has executed",
      valueType: ValueType.INT,
    },
  ),
  PipelineStageDuration: GRANADA_METRICS_METER.createHistogram(
    "pipeline_stage_duration",
    {
      description: "The amount of time spent in each stage",
      valueType: ValueType.DOUBLE,
      unit: "seconds",
      advice: {
        explicitBucketBoundaries: [
          0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5,
        ],
      },
    },
  ),
} as const

/**
 * Metrics related to request handling
 */
export const HttpRequestMetrics = {
  RequestCompleted: GRANADA_METRICS_METER.createCounter(
    "request_completed_counter",
    {
      description: "The number of requests that were completed",
      valueType: ValueType.INT,
    },
  ),
  RequestTimeout: GRANADA_METRICS_METER.createCounter(
    "request_timeout_counter",
    {
      description: "The number of requests that were cancelled due to timeout",
      valueType: ValueType.INT,
    },
  ),
  RequestDelayDuration: GRANADA_METRICS_METER.createHistogram(
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
