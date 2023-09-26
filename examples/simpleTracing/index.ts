import * as opentelemetry from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node"
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { HttpRequest, createRouter, getDefaultBuilder } from '../../packages/http';

process.env['OTEL_SERVICE_NAME'] = "granada"
console.log("service name = " + process.env.OTEL_SERVICE_NAME ?? "undefined")

const sdk = new opentelemetry.NodeSDK({
    traceExporter: new OTLPTraceExporter({
        // optional - default url is http://localhost:4318/v1/traces
        url: 'http://localhost:4318/v1/traces',
        // optional - collection of custom headers to be sent with each request, empty by default
        headers: {},
    }),
    // traceExporter: new ConsoleSpanExporter(),
    metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
            url: 'http://localhost:4318/v1/metrics', // url is optional and can be omitted - default is http://localhost:4318/v1/metrics
            headers: {}, // an optional object containing custom headers to be sent with each request
        }),
    }),
    instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();

console.log("starting server just for kicks")

const router = createRouter()
router.register("/hello", (request: HttpRequest<any>) => {
    return Promise.resolve(request.respond(200, () => Promise.resolve("Hello World")))
})

const server = getDefaultBuilder().withRouter(router).build()

try {
    server.listen(8080)
} catch (err) {
    console.log(`error: ${err}`)
} finally {
    console.log("running")
}


process.on('SIGINT', async () => {
    console.log("sigint")
    setTimeout(() => {
        /* Code to run before exiting */
        process.exit()
    }, 3000);

    await server.close()
});