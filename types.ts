import { Aggregator } from 'prom-client';

type IValue = { labels: (string | number)[]; value: number };

export type IMetric = {
    aggregator: Aggregator;
    values: IValue[];
    type: string;
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
