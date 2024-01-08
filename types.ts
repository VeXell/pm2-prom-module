import { Aggregator } from 'prom-client';

type IValue = { labels: Record<string, string | number>; value: number; metricName?: string };

export const enum MetricType {
    Counter = 'counter',
    Gauge = 'gauge',
    Histogram = 'histogram',
    Summary = 'summary',
}

export type IBaseMetric = {
    aggregator: Aggregator;
    values: IValue[];
    name: string;
    help: string;
};

export type ICounterMetric = IBaseMetric & {
    type: MetricType.Counter;
};

export type IGaugeMetric = IBaseMetric & {
    type: MetricType.Gauge;
};

export type IHistogramMetric = IBaseMetric & {
    type: MetricType.Histogram;
};

export type ISummaryMetric = IBaseMetric & {
    type: MetricType.Summary;
    percentiles?: number[];
    maxAgeSeconds?: number;
    ageBuckets?: number;
    pruneAgedBuckets?: boolean;
    compressCount?: number;
};

export type IMetric = ICounterMetric | IGaugeMetric | IHistogramMetric | ISummaryMetric;

export type AppResponse = { metrics: IMetric[] };

export type PM2BusResponse = {
    process?: { namespace: string; name: string; pm_id: number };
    raw?: {
        topic: string;
        data?: AppResponse;
    };
};
