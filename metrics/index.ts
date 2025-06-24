import client from 'prom-client';
import os from 'node:os';

import { getCpuCount } from '../utils/cpu';
import {
    getAvailableMemory,
    getBlockletServerInfo,
    getCPULimit,
    getFreeMemory,
    getUsedMemory,
    hasDockerLimitFiles,
} from '../utils/docker';

import { getAppRegistry } from './app';

const METRIC_BLOCKLET_SERVER_INFO = 'blocklet_server_info';
const METRIC_FREE_MEMORY = 'free_memory';
const METRIC_AVAILABLE_CPU = 'cpu_count';
const METRIC_AVAILABLE_APPS = 'available_apps';
const METRIC_APP_INSTANCES = 'app_instances';
const METRIC_APP_AVERAGE_MEMORY = 'app_average_memory';
const METRIC_APP_PIDS_MEMORY = 'app_pids_memory';
const METRIC_APP_TOTAL_MEMORY = 'app_total_memory';
const METRIC_APP_AVERAGE_CPU = 'app_average_cpu';
const METRIC_APP_PIDS_CPU = 'app_pids_cpu';
const METRIC_APP_PIDS_CPU_THRESHOLD = 'app_pids_cpu_threshold';
const METRIC_APP_RESTART_COUNT = 'app_restart_count';
const METRIC_APP_UPTIME = 'app_uptime';
const METRIC_APP_STATUS = 'app_status';
const METRIC_TOTAL_MEMORY_CONTAINER = 'container_total_memory';
const METRIC_FREE_MEMORY_CONTAINER = 'container_free_memory';
const METRIC_USED_MEMORY_CONTAINER = 'container_used_memory';
const METRIC_AVAILABLE_CPU_CONTAINER = 'container_cpu_count';

export const registry = new client.Registry();

export let metricAvailableApps: client.Gauge | undefined;
export let metricAppInstances: client.Gauge | undefined;
export let metricAppAverageMemory: client.Gauge | undefined;
export let metricAppTotalMemory: client.Gauge | undefined;
export let metricAppAverageCpu: client.Gauge | undefined;
export let metricAppPidsCpuLast: client.Gauge | undefined;
export let metricAppPidsCpuThreshold: client.Gauge | undefined;
export let metricAppRestartCount: client.Gauge | undefined;
export let metricAppUptime: client.Gauge | undefined;
export let metricAppPidsMemory: client.Gauge | undefined;
export let metricAppStatus: client.Gauge | undefined;

let currentPrefix = '';

export const dynamicGaugeMetricClients: { [key: string]: client.Gauge } = {};

// Metrics
export const initMetrics = (prefix: string) => {
    currentPrefix = prefix;

    new client.Gauge({
        name: `${prefix}_${METRIC_BLOCKLET_SERVER_INFO}`,
        help: 'Show blocklet server info',
        async collect() {
            const info = await getBlockletServerInfo();
            this.set(info, 1);
        },
        registers: [registry],
        labelNames: ['name', 'version', 'mode', 'internalIP'],
    });

    new client.Gauge({
        name: `${prefix}_${METRIC_FREE_MEMORY}`,
        help: 'Show available host free memory (System OS)',
        collect() {
            this.set(os.freemem());
        },
        registers: [registry],
    });

    new client.Gauge({
        name: `${prefix}_${METRIC_AVAILABLE_CPU}`,
        help: 'Show available CPUs count (System OS)',
        collect() {
            this.set(getCpuCount());
        },
        registers: [registry],
    });

    // Check if we in docker container
    hasDockerLimitFiles()
        .then(() => {
            new client.Gauge({
                name: `${prefix}_${METRIC_TOTAL_MEMORY_CONTAINER}`,
                help: 'Available memory in container',
                async collect() {
                    try {
                        const memory = await getAvailableMemory();
                        this.set(memory);
                    } catch {}
                },
                registers: [registry],
            });

            new client.Gauge({
                name: `${prefix}_${METRIC_FREE_MEMORY_CONTAINER}`,
                help: 'Free memory in container',
                async collect() {
                    try {
                        const memory = await getFreeMemory();
                        this.set(memory);
                    } catch {}
                },
                registers: [registry],
            });

            new client.Gauge({
                name: `${prefix}_${METRIC_USED_MEMORY_CONTAINER}`,
                help: 'Used memory in container',
                async collect() {
                    try {
                        const memory = await getUsedMemory();
                        this.set(memory);
                    } catch {}
                },
                registers: [registry],
            });

            new client.Gauge({
                name: `${prefix}_${METRIC_AVAILABLE_CPU_CONTAINER}`,
                help: 'Available CPUs limit in container',
                async collect() {
                    try {
                        const limit = await getCPULimit();
                        this.set(limit);
                    } catch {}
                },
                registers: [registry],
            });
        })
        .catch(() => {
            //
        });

    metricAvailableApps = new client.Gauge({
        name: `${prefix}_${METRIC_AVAILABLE_APPS}`,
        help: 'Show available apps to monitor',
        registers: [registry],
    });

    // Specific app metrics

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

    metricAppUptime = new client.Gauge({
        name: `${prefix}_${METRIC_APP_UPTIME}`,
        help: 'Show app uptime in seconds',
        registers: [registry],
        labelNames: ['app'],
    });

    metricAppStatus = new client.Gauge({
        name: `${prefix}_${METRIC_APP_STATUS}`,
        help: 'Current App status. (0-unknown,1-running,2-pending,3-stopped,4-errored)',
        registers: [registry],
        labelNames: ['app'],
    });

    // Metrics with instances

    metricAppPidsCpuLast = new client.Gauge({
        name: `${prefix}_${METRIC_APP_PIDS_CPU}`,
        help: 'Show current (last) usage CPU for every app instance',
        registers: [registry],
        labelNames: ['app', 'instance'],
    });

    metricAppPidsCpuThreshold = new client.Gauge({
        name: `${prefix}_${METRIC_APP_PIDS_CPU_THRESHOLD}`,
        help: 'Show average CPU for every app instance to detect autoscale if module exists',
        registers: [registry],
        labelNames: ['app', 'instance'],
    });

    metricAppRestartCount = new client.Gauge({
        name: `${prefix}_${METRIC_APP_RESTART_COUNT}`,
        help: 'Show restart count of the app',
        registers: [registry],
        labelNames: ['app', 'instance'],
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

export const combineAllRegistries = (needAggregate: boolean) => {
    const appRegistry = getAppRegistry(needAggregate);

    if (appRegistry) {
        return client.Registry.merge([registry, appRegistry]);
    } else {
        return registry;
    }
};

export const deletePromAppMetrics = (appName: string, instances: number[]) => {
    metricAppInstances?.remove(appName);
    metricAppAverageMemory?.remove(appName);
    metricAppTotalMemory?.remove(appName);
    metricAppAverageCpu?.remove(appName);
    metricAppUptime?.remove(appName);
    metricAppStatus?.remove(appName);

    deletePromAppInstancesMetrics(appName, instances);
};

export const deletePromAppInstancesMetrics = (appName: string, instances: number[]) => {
    instances.forEach((pmId) => {
        metricAppPidsCpuLast?.remove({ app: appName, instance: pmId });
        metricAppPidsCpuThreshold?.remove({ app: appName, instance: pmId });
        metricAppRestartCount?.remove({ app: appName, instance: pmId });
        metricAppPidsMemory?.remove({ app: appName, instance: pmId });

        for (const [, entry] of Object.entries(dynamicGaugeMetricClients)) {
            entry?.remove({ app: appName, instance: pmId });
        }
    });
};
