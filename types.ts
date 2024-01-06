import { Aggregator } from 'prom-client';

type IValue = { labels: Record<string, string | number>; value: number };

export const enum MetricType {
    Counter = 'counter',
    Gauge = 'gauge',
    Histogram = 'histogram',
    Summary = 'summary',
}

export type IMetric = {
    aggregator: Aggregator;
    values: IValue[];
    type: MetricType;
    name: string;
    help: string;
};

export type AppResponse = { metrics: IMetric[] };

export type PM2BusResponse = {
    process?: { namespace: string; name: string; pm_id: number };
    raw?: {
        topic: string;
        data: AppResponse;
    };
};
