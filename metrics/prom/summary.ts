import client from 'prom-client';
import { IMetric } from '../../types';

export class ISummary extends client.Summary {
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

    async get() {
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
            collect: async () => {},
        };
    }
}
