// Importing necessary OpenTelemetry packages including the core SDK, auto-instrumentations, OTLP trace exporter, and batch span processor
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import {BatchSpanProcessor, ConsoleSpanExporter} from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';



// Initialize OTLP trace exporter with the endpoint URL and headers
const traceExporter = new OTLPTraceExporter({
    url: 'https://api.axiom.co/v1/traces',
    headers: {
        'Authorization': `Bearer ${process.env.FP_AXIOM_TOKEN}`,
        'X-Axiom-Dataset': 'fireproof-pk'
    },
});

const traceConsole = new ConsoleSpanExporter()

// Creating a resource to identify your service in traces
const resource = Resource.default().merge(
    new Resource({
        [ATTR_SERVICE_NAME]: 'fireproof',
        [ATTR_SERVICE_VERSION]: '0.1.0',
    }),
);

// Configuring the OpenTelemetry Node SDK
export const sdk = new NodeSDK({
    // Adding a BatchSpanProcessor to batch and send traces
    spanProcessors: [new BatchSpanProcessor(traceExporter), new BatchSpanProcessor(traceConsole)],

    // Registering the resource to the SDK
    resource: resource,

    // Adding auto-instrumentations to automatically collect trace data
    instrumentations: [getNodeAutoInstrumentations()],
});

// For troubleshooting, set the log level to DiagLogLevel.DEBUG
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

// Starting the OpenTelemetry SDK to begin collecting telemetry data
sdk.start();
