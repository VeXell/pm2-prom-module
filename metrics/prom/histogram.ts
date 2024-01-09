import client from 'prom-client';
import { IMetric } from '../../types';

export class IHistogram extends client.Histogram {
    name: string;
    help: string;
    type: client.MetricType;
    aggregator: client.Aggregator;
    values: Record<string, IMetric['values']> = {};

    setValues(defaultLabels: Record<string, string | number>, values: IMetric['values']) {
        let valueKey = '';

        for (const [key, value] of Object.entries(defaultLabels)) {
            valueKey += `${key}:${value};`;
        }

        this.values[valueKey] = values.map((entry) => {
            const newEntry = { ...entry };
            const labels = { ...entry.labels, ...defaultLabels };

            newEntry.labels = labels;

            return newEntry;
        });
    }

    async getForPromString() {
        const values: IMetric['values'] = [];

        for (const [, entries] of Object.entries(this.values)) {
            entries.forEach((value) => values.push(value));
        }

        return {
            name: this.name,
            help: this.help,
            type: this.type,
            values,
            aggregator: this.aggregator,
        };
    }
}

export const getHistogramBuckets = (values: IMetric['values']) => {
    const labels = new Set<number>();

    values.forEach((entry) => {
        Object.keys(entry.labels).forEach((label) => {
            if (label === 'le' && entry.labels[label] !== '+Inf') {
                labels.add(Number(entry.labels[label]));
            }
        });
    });

    return Array.from(labels);
};
