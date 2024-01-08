import client from 'prom-client';
import { AppResponse, IMetric, MetricType } from '../types';
import { getLogger } from '../utils/logger';

type IAppPidMetric = Record<string, IMetric>;
type IAppNameMetric = Record<string, IAppPidMetric>;
const dynamicAppMetrics: { [key: string]: IAppNameMetric } = {};

const DEFAULT_LABELS = ['app', 'instance'];

const createMetricByType = (metric: IMetric, labels: string[]) => {
    switch (metric.type) {
        case MetricType.Counter:
            const metricEntry = new client.Counter({
                name: metric.name,
                help: metric.help,
                aggregator: metric.aggregator,
                labelNames: [...DEFAULT_LABELS, ...labels],
                registers: [],
            });

            return metricEntry;
        default:
            return null;
    }
};

const parseLabels = (values: IMetric['values']) => {
    const labels = new Set<string>();

    values.forEach((entry) => {
        Object.keys(entry.labels).forEach((label) => {
            labels.add(String(label));
        });
    });

    return Array.from<string>(labels);
};

export const createRegistryMetrics = (registry: client.Registry) => {
    const logger = getLogger();
    const metrics: Record<string, client.Metric> = {};

    for (const [, appEntry] of Object.entries(dynamicAppMetrics)) {
        for (const [appName, pidEntry] of Object.entries(appEntry)) {
            for (const [pm2id, metric] of Object.entries(pidEntry)) {
                if (!metrics[metric.name]) {
                    const parsedLabels = parseLabels(metric.values);
                    metrics[metric.name] = createMetricByType(metric, parsedLabels);
                }

                const createdMetric = metrics[metric.name];

                if (!createdMetric) {
                    logger.error(`Unsupported metric type ${metric.type} for ${metric.name}`);
                } else {
                    // Registry metric
                    registry.registerMetric(createdMetric);

                    // Fill data
                    switch (metric.type) {
                        case MetricType.Counter:
                            const defaultLabels: Record<string, string | number> = {
                                app: appName,
                                instance: pm2id,
                            };

                            metric.values.forEach((entry) => {
                                (createdMetric as client.Counter).inc(
                                    { ...entry.labels, ...defaultLabels },
                                    entry.value
                                );
                            });

                            break;
                        default:
                            return null;
                    }
                }
            }
        }
    }
};

export const processAppMetrics = (
    _config: IConfig,
    data: { pmId: number; appName: string; appResponse: AppResponse }
) => {
    if (!Array.isArray(data.appResponse.metrics)) {
        return;
    }

    data.appResponse.metrics.forEach((entry) => {
        if (Array.isArray(entry.values) && entry.values.length) {
            const metricName = entry.name;

            if (!dynamicAppMetrics[metricName]) {
                dynamicAppMetrics[metricName] = {};
            }

            const appKey = dynamicAppMetrics[metricName][data.appName];

            if (!appKey) {
                dynamicAppMetrics[metricName][data.appName] = {};
            }

            const pm2id = String(data.pmId);
            dynamicAppMetrics[metricName][data.appName][pm2id] = entry;
        }
    });
};

export const getAppRegistry = (serviceName: string) => {
    if (Object.keys(dynamicAppMetrics).length) {
        const registry = new client.Registry();
        registry.setDefaultLabels({ serviceName });

        createRegistryMetrics(registry);

        return registry;
    }

    return undefined;
};
