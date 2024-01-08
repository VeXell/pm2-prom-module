import client from 'prom-client';
import os from 'node:os';

import { getCpuCount } from '../utils/cpu';

import { getAppRegistry } from './app';

const METRIC_FREE_MEMORY = 'free_memory';
const METRIC_AVAILABLE_CPU = 'cpu_count';
const METRIC_AVAILABLE_APPS = 'available_apps';
const METRIC_APP_INSTANCES = 'app_instances';
const METRIC_APP_AVERAGE_MEMORY = 'app_average_memory';
const METRIC_APP_PIDS_MEMORY = 'app_pids_memory';
const METRIC_APP_TOTAL_MEMORY = 'app_total_memory';
const METRIC_APP_AVERAGE_CPU = 'app_average_cpu';
const METRIC_APP_PIDS_CPU = 'app_pids_cpu';
const METRIC_APP_RESTART_COUNT = 'app_restart_count';
const METRIC_APP_UPTIME = 'app_uptime';

export const registry = new client.Registry();

export let metricAvailableApps: client.Gauge | undefined;
export let metricAppInstances: client.Gauge | undefined;
export let metricAppAverageMemory: client.Gauge | undefined;
export let metricAppTotalMemory: client.Gauge | undefined;
export let metricAppAverageCpu: client.Gauge | undefined;
export let metricAppPidsCpu: client.Gauge | undefined;
export let metricAppRestartCount: client.Gauge | undefined;
export let metricAppUptime: client.Gauge | undefined;
export let metricAppPidsMemory: client.Gauge | undefined;

let currentPrefix = '';

export const dynamicGaugeMetricClients: { [key: string]: client.Gauge } = {};

// Metrics
export const initMetrics = (prefix: string, serviceName?: string) => {
    currentPrefix = prefix;

    if (serviceName) {
        registry.setDefaultLabels({ serviceName });
        //appRegistry.setDefaultLabels({ serviceName });
    }

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
            this.set(getCpuCount());
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

    metricAppAverageCpu = new client.Gauge({
        name: `${prefix}_${METRIC_APP_AVERAGE_CPU}`,
        help: 'Show average app cpu usage',
        registers: [registry],
        labelNames: ['app'],
    });

    metricAppPidsCpu = new client.Gauge({
        name: `${prefix}_${METRIC_APP_PIDS_CPU}`,
        help: 'Show current usage CPU for every app instance',
        registers: [registry],
        labelNames: ['app', 'instance'],
    });

    metricAppRestartCount = new client.Gauge({
        name: `${prefix}_${METRIC_APP_RESTART_COUNT}`,
        help: 'Show restart count of the app',
        registers: [registry],
        labelNames: ['app', 'instance'],
    });

    metricAppUptime = new client.Gauge({
        name: `${prefix}_${METRIC_APP_UPTIME}`,
        help: 'Show app uptime in seconds',
        registers: [registry],
        labelNames: ['app'],
    });

    metricAppPidsMemory = new client.Gauge({
        name: `${prefix}_${METRIC_APP_PIDS_MEMORY}`,
        help: 'Show current usage memory for every app instance',
        registers: [registry],
        labelNames: ['app', 'instance'],
    });
};

export const initDynamicGaugeMetricClients = (metrics: { key: string; description: string }[]) => {
    metrics.forEach((entry) => {
        dynamicGaugeMetricClients[entry.key] = new client.Gauge({
            name: `${currentPrefix}_${entry.key}`,
            help: entry.description,
            registers: [registry],
            labelNames: ['app', 'instance'],
        });
    });
};

export const combineAllRegistries = (serviceName: string) => {
    const appRegistry = getAppRegistry(serviceName);

    if (appRegistry) {
        return client.Registry.merge([registry, appRegistry]);
    } else {
        return registry;
    }
};
