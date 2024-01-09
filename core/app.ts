import { AxmMonitor } from 'pm2';
import { toUndescore } from '../utils';

export type IPidDataInput = {
    id: number;
    pmId: number;
    memory: number;
    cpu: number;
    restartCount: number;
    createdAt: number;
    metrics?: { [key: string]: AxmMonitor };
};

type IMetrics = { [key: string]: number };

type IPidData = {
    id: number;
    pmId: number;
    memory: number[];
    cpu: number[];
    restartCount: number;
    metrics: IMetrics;
};

const MONIT_ITEMS_LIMIT = 30;

export const PM2_METRICS = [
    { name: 'Used Heap Size', unit: 'bytes' },
    { name: 'Heap Usage', unit: '%' },
    { name: 'Heap Size', unit: 'bytes' },
    { name: 'Event Loop Latency p95', unit: 'ms' },
    { name: 'Event Loop Latency', unit: 'ms' },
    { name: 'Active handles', unit: 'number' },
    { name: 'Active requests', unit: 'number' },
    { name: 'HTTP', unit: 'req/min' },
    { name: 'HTTP P95 Latency', unit: 'ms' },
    { name: 'HTTP Mean Latency', unit: 'ms' },
];

export class App {
    private readonly pids: { [key: number]: IPidData } = {};
    private readonly name: string;
    private startTime: number = 0;

    public isProcessing: boolean = false;

    constructor(name: string) {
        this.name = name;
    }

    removeNotActivePids(activePids: number[]) {
        Object.keys(this.pids).forEach((pid) => {
            if (activePids.indexOf(Number(pid)) === -1) {
                delete this.pids[pid];
            }
        });

        return this;
    }

    updatePid(pidData: IPidDataInput) {
        const pid = pidData.id;

        if (Object.keys(this.pids).length === 0) {
            // Set start time first time when we update pids
            this.startTime = pidData.createdAt;
        }

        if (!this.pids[pid]) {
            this.pids[pid] = {
                id: pid,
                pmId: pidData.pmId,
                memory: [pidData.memory],
                cpu: [pidData.cpu],
                restartCount: pidData.restartCount,
                metrics: this.fillMetricsData(pidData.metrics),
            };
        } else {
            const memoryValues = [pidData.memory, ...this.pids[pid].memory].slice(
                0,
                MONIT_ITEMS_LIMIT
            );
            const cpuValues = [pidData.cpu, ...this.pids[pid].cpu].slice(0, MONIT_ITEMS_LIMIT);

            this.pids[pid].memory = memoryValues;
            this.pids[pid].cpu = cpuValues;
            this.pids[pid].restartCount = pidData.restartCount;
            this.pids[pid].metrics = this.fillMetricsData(pidData.metrics);
        }

        return this;
    }

    getActivePm2Ids() {
        const values: number[] = [];

        for (const [, entry] of Object.entries(this.pids)) {
            values.push(entry.pmId);
        }

        return values;
    }

    getMonitValues() {
        return this.pids;
    }

    getAverageUsedMemory() {
        const memoryValues = this.getAveragePidsMemory();
        return Math.round(memoryValues.reduce((sum, value) => sum + value) / memoryValues.length);
    }

    getAverageCpu() {
        const cpuValues = this.getAveragePidsCpu();
        return Math.round(cpuValues.reduce((sum, value) => sum + value) / cpuValues.length);
    }

    getRestartCount() {
        const values: { pid: string; value: number; pmId: number }[] = [];

        for (const [pid, entry] of Object.entries(this.pids)) {
            values.push({
                pid,
                pmId: entry.pmId,
                value: entry.restartCount,
            });
        }

        return values;
    }

    getPidPm2Metrics() {
        const values: { pid: string; metrics: IMetrics; pmId: number }[] = [];

        for (const [pid, entry] of Object.entries(this.pids)) {
            values.push({
                pid,
                pmId: entry.pmId,
                metrics: entry.metrics,
            });
        }

        return values;
    }

    getCurrentPidsCpu() {
        const values: { pid: string; value: number; pmId: number }[] = [];

        for (const [pid, entry] of Object.entries(this.pids)) {
            values.push({
                pid,
                pmId: entry.pmId,
                value: entry.cpu[0] || 0,
            });
        }

        return values;
    }

    getCurrentPidsMemory() {
        const values: { pid: string; value: number; pmId: number }[] = [];

        for (const [pid, entry] of Object.entries(this.pids)) {
            values.push({
                pid,
                pmId: entry.pmId,
                value: entry.memory[0] || 0,
            });
        }

        return values;
    }

    getTotalUsedMemory() {
        const memoryValues: number[] = [];

        for (const [, entry] of Object.entries(this.pids)) {
            if (entry.memory[0]) {
                // Get the last memory value
                memoryValues.push(entry.memory[0]);
            }
        }
        return memoryValues.reduce((sum, value) => sum + value);
    }

    getName() {
        return this.name;
    }

    getActiveWorkersCount() {
        return Object.keys(this.pids).length;
    }

    getUptime() {
        return Math.round((Number(new Date()) - this.startTime) / 1000);
    }

    private getAveragePidsMemory() {
        const memoryValues: number[] = [];

        for (const [, entry] of Object.entries(this.pids)) {
            // Collect average memory for every pid
            const value = Math.round(
                entry.memory.reduce((sum, value) => sum + value) / entry.memory.length
            );
            memoryValues.push(value);
        }

        return memoryValues;
    }

    private getAveragePidsCpu(): number[] {
        const cpuValues: number[] = [];

        for (const [, entry] of Object.entries(this.pids)) {
            const value = Math.round(
                entry.cpu.reduce((sum, value) => sum + value) / entry.cpu.length
            );
            cpuValues.push(value);
        }

        return cpuValues;
    }

    private fillMetricsData(amxMetrics?: IPidDataInput['metrics']): IMetrics {
        const metrics: IMetrics = {};

        if (amxMetrics) {
            const availableMetrics = PM2_METRICS.map((entry) => entry.name);

            Object.keys(amxMetrics).forEach((key) => {
                if (availableMetrics.indexOf(key) !== -1) {
                    const metricKey = toUndescore(key);

                    // Force number for metrics
                    let value = Number(amxMetrics[key].value);

                    if (amxMetrics[key].unit === 'MiB') {
                        value = value * 1024 * 1024;
                    }

                    metrics[metricKey] = value;
                }
            });
        }

        return metrics;
    }
}
