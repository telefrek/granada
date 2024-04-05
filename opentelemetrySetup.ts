import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"
import { Resource } from "@opentelemetry/resources"
import { NodeSDK } from "@opentelemetry/sdk-node"
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions"

const resource = Resource.default().merge(
  new Resource({
    [SEMRESATTRS_SERVICE_NAME]: "dice-server",
    [SEMRESATTRS_SERVICE_VERSION]: "0.1.0",
  }),
)

const exporter = new PrometheusExporter()

export const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  metricReader: exporter,
  instrumentations: [getNodeAutoInstrumentations()],
  resource,
})
