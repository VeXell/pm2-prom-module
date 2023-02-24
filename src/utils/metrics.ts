import client from 'prom-client';
import os from 'node:os';

const METRIC_FREE_MEMORY = 'free_memory';
const METRIC_AVAILABLE_CPU = 'cpu_count';
const METRIC_AVAILABLE_APPS = 'available_apps';
const METRIC_APP_INSTANCES = 'app_instances';
const METRIC_APP_AVERAGE_MEMORY = 'app_average_memory';
const METRIC_APP_TOTAL_MEMORY = 'app_total_memory';

export const registry = new client.Registry();

export let metricAvailableApps: client.Gauge | undefined;
export let metricAppInstances: client.Gauge | undefined;
export let metricAppAverageMemory: client.Gauge | undefined;
export let metricAppTotalMemory: client.Gauge | undefined;

// Metrics
export const initMetrics = (prefix: string) => {
    new client.Gauge({
        name: `${prefix}_${METRIC_FREE_MEMORY}`,
        help: 'Show available host free memory',
        collect() {
            this.set(os.freemem());
        },
        registers: [registry],
    });

    new client.Gauge({
        name: `${prefix}_${METRIC_AVAILABLE_CPU}`,
        help: 'Show available CPUs count',
        collect() {
            this.set(os.cpus().length);
        },
        registers: [registry],
    });

    metricAvailableApps = new client.Gauge({
        name: `${prefix}_${METRIC_AVAILABLE_APPS}`,
        help: 'Show available apps to monitor',
        registers: [registry],
    });

    metricAppInstances = new client.Gauge({
        name: `${prefix}_${METRIC_APP_INSTANCES}`,
        help: 'Show app instances count',
        registers: [registry],
        labelNames: ['app'],
    });

    metricAppAverageMemory = new client.Gauge({
        name: `${prefix}_${METRIC_APP_AVERAGE_MEMORY}`,
        help: 'Show average using memory of an app',
        registers: [registry],
        labelNames: ['app'],
    });

    metricAppTotalMemory = new client.Gauge({
        name: `${prefix}_${METRIC_APP_TOTAL_MEMORY}`,
        help: 'Show total using memory of an app',
        registers: [registry],
        labelNames: ['app'],
    });
};
