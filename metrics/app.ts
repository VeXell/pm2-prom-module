import client from 'prom-client';
import { AppResponse, IMetric, MetricType } from '../types';
import { getLogger } from '../utils/logger';

export const appRegistry = new client.Registry();

/*function aggregate(metricsArr) {
    const metricsByName = new client.Grouper();

    aggregatedRegistry.setContentType(registryType);

    // Gather by name
    metricsArr.forEach((metrics) => {
        metrics.forEach((metric) => {
            metricsByName.add(metric.name, metric);
        });
    });

    // Aggregate gathered metrics.
    metricsByName.forEach((metrics) => {
        const aggregatorName = metrics[0].aggregator;
        const aggregatorFn = aggregators[aggregatorName];
        if (typeof aggregatorFn !== 'function') {
            throw new Error(`'${aggregatorName}' is not a defined aggregator.`);
        }
        const aggregatedMetric = aggregatorFn(metrics);
        // NB: The 'omit' aggregator returns undefined.
        if (aggregatedMetric) {
            const aggregatedMetricWrapper = Object.assign(
                {
                    get: () => aggregatedMetric,
                },
                aggregatedMetric
            );
            aggregatedRegistry.registerMetric(aggregatedMetricWrapper);
        }
    });

    return aggregatedRegistry;
}*/

// type IAppPidMetric = Record<number, any>;
const dynamicAppMetrics: { [key: string]: client.Metric } = {};

const createMetricByType = (metric: IMetric, labels: string[]) => {
    const defaultLabels = ['app', 'instance'];

    switch (metric.type) {
        case MetricType.Counter:
            const metricEntry = new client.Counter({
                name: metric.name,
                help: metric.help,
                registers: [appRegistry],
                aggregator: metric.aggregator,
                labelNames: [...defaultLabels, ...labels],
            });

            dynamicAppMetrics[metric.name] = metricEntry;
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

export const processAppMetrics = (
    _config: IConfig,
    data: { pmId: number; appName: string; appResponse: AppResponse }
) => {
    if (!Array.isArray(data.appResponse.metrics)) {
        return;
    }

    const logger = getLogger();

    data.appResponse.metrics.forEach((entry) => {
        if (Array.isArray(entry.values) && entry.values.length) {
            const metricName = entry.name;
            let metric = dynamicAppMetrics[metricName];

            if (!metric) {
                const labels = parseLabels(entry.values);
                metric = createMetricByType(entry, labels);
            }

            if (metric) {
                console.log(`${metricName}: ${data.pmId} values ${JSON.stringify(entry.values)}`);
            } else {
                logger.error(`Unsupported metric type ${entry.type}`);
            }
        }
    });
};
