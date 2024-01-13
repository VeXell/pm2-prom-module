import pm2 from 'pm2';
import pidusage from 'pidusage';

import { App, IPidDataInput, PM2_METRICS } from './app';
import { toUndescore } from '../utils';
import { PM2BusResponse } from '../types';

import {
    initDynamicGaugeMetricClients,
    dynamicGaugeMetricClients,
    metricAvailableApps,
    metricAppInstances,
    metricAppAverageMemory,
    metricAppTotalMemory,
    metricAppAverageCpu,
    metricAppPidsCpuLast,
    metricAppRestartCount,
    metricAppUptime,
    metricAppPidsMemory,
    metricAppPidsCpuThreshold,
    deletePromAppMetrics,
    deletePromAppInstancesMetrics,
} from '../metrics';

import { processAppMetrics, deleteAppMetrics } from '../metrics/app';

import { getLogger } from '../utils/logger';

type IPidsData = Record<number, IPidDataInput>;

const WORKER_CHECK_INTERVAL = 1000;
const SHOW_STAT_INTERVAL = 10000;

const APPS: { [key: string]: App } = {};

const isMonitoringApp = (app: pm2.ProcessDescription) => {
    const pm2_env = app.pm2_env as pm2.Pm2Env;

    if (
        pm2_env.axm_options.isModule ||
        !app.name ||
        !app.pid ||
        app.pm_id === undefined || // pm_id might be zero
        pm2_env.status !== 'online'
    ) {
        return false;
    }

    return true;
};

const updateAppPidsData = (workingApp: App, pidData: IPidDataInput) => {
    workingApp.updatePid({
        id: pidData.id,
        memory: pidData.memory,
        cpu: pidData.cpu || 0,
        pmId: pidData.pmId,
        restartCount: pidData.restartCount,
        createdAt: pidData.createdAt,
        metrics: pidData.metrics,
    });
};

const detectActiveApps = () => {
    const logger = getLogger();

    pm2.list((err, apps) => {
        if (err) return console.error(err.stack || err);

        const pidsMonit: IPidsData = {};
        const mapAppPids: { [key: string]: { pids: number[]; restartsSum: number } } = {};

        apps.forEach((app) => {
            const pm2_env = app.pm2_env as pm2.Pm2Env;
            const appName = app.name;

            if (!isMonitoringApp(app) || !appName || !app.pid || app.pm_id === undefined) {
                return;
            }

            // Fill all apps pids
            if (!mapAppPids[appName]) {
                mapAppPids[appName] = {
                    pids: [],
                    restartsSum: 0,
                };
            }

            mapAppPids[appName].pids.push(app.pid);
            mapAppPids[appName].restartsSum =
                mapAppPids[appName].restartsSum + Number(pm2_env.restart_time || 0);

            // Fill monitoring data
            pidsMonit[app.pid] = {
                cpu: 0,
                memory: 0,
                pmId: app.pm_id,
                id: app.pid,
                restartCount: pm2_env.restart_time || 0,
                createdAt: pm2_env.created_at || 0,
                metrics: pm2_env.axm_monitor,
            };
        });

        Object.keys(APPS).forEach((appName) => {
            const processingApp = mapAppPids[appName];

            // Filters apps which do not have active pids
            if (!processingApp) {
                logger.debug(`Delete ${appName} because it not longer exists`);

                const workingApp = APPS[appName];
                const instances = workingApp.getActivePm2Ids();

                // Clear app metrics
                deleteAppMetrics(appName);

                // Clear all metrics in prom-client because an app is not exists anymore
                deletePromAppMetrics(appName, instances);

                delete APPS[appName];
            } else {
                const workingApp = APPS[appName];

                if (workingApp) {
                    const activePids = processingApp.pids;

                    const removedPids = workingApp.removeNotActivePids(activePids);

                    if (removedPids.length) {
                        const removedIntances = removedPids.map((entry) => entry.pmId);
                        deletePromAppInstancesMetrics(appName, removedIntances);
                    }

                    const pidsRestartsSum = workingApp
                        .getRestartCount()
                        .reduce((accum, item) => accum + item.value, 0);

                    if (processingApp.restartsSum > pidsRestartsSum) {
                        // Reset metrics when active restart app bigger then active app
                        // This logic exist to prevent autoscaling problems if we use only !==
                        logger.debug(`App ${appName} has been restarted. Clear metrics`);
                        deleteAppMetrics(appName);
                    }
                }
            }
        });

        for (const [appName, entry] of Object.entries(mapAppPids)) {
            if (entry.pids.length && !APPS[appName]) {
                APPS[appName] = new App(appName);
            }
        }

        // Get all pids to monit
        const pids = Object.keys(pidsMonit);

        if (pids.length) {
            // Get real pids data.
            // !ATTENTION! Can not use PM2 app.monit because of incorrect values of CPU usage
            pidusage(pids, (err, stats) => {
                if (err) return console.error(err.stack || err);

                // Fill data for all pids
                if (stats && Object.keys(stats).length) {
                    for (const [pid, stat] of Object.entries(stats)) {
                        const pidId = Number(pid);

                        if (pidId && pidsMonit[pidId]) {
                            pidsMonit[pidId].cpu = Math.round(stat.cpu * 10) / 10;
                            pidsMonit[pidId].memory = stat.memory;
                        }
                    }
                }

                for (const [appName, entry] of Object.entries(mapAppPids)) {
                    const workingApp = APPS[appName];

                    if (workingApp) {
                        entry.pids.forEach((pidId) => {
                            const monit = pidsMonit[pidId];

                            if (monit) {
                                updateAppPidsData(workingApp, monit);
                            }
                        });

                        // Collect metrics
                        processWorkingApp(workingApp);
                    }
                }
            });
        }
    });
};

export const startPm2Connect = (conf: IConfig) => {
    const logger = getLogger();

    pm2.connect((err) => {
        if (err) return console.error(err.stack || err);

        const additionalMetrics = PM2_METRICS.map((entry) => {
            return {
                key: toUndescore(entry.name),
                description: `${entry.name}. Unit "${entry.unit}"`,
            };
        });

        if (additionalMetrics.length) {
            initDynamicGaugeMetricClients(additionalMetrics);
        }

        detectActiveApps();

        // Collect statistic from running apps
        pm2.launchBus((err, bus): void => {
            if (err) return console.error(err.stack || err);

            logger.debug('Start bus listener');

            bus.on('process:msg', (packet: PM2BusResponse): void => {
                if (
                    packet.process &&
                    packet.raw &&
                    packet.raw.topic === 'pm2-prom-module:metrics' &&
                    packet.raw.data
                ) {
                    const { name, pm_id } = packet.process;

                    /*logger.debug(
                        `Got message from app=${name} and pid=${pm_id}. Message=${JSON.stringify(
                            packet.raw.data
                        )}`
                    );*/

                    if (name && APPS[name] && packet.raw.data.metrics) {
                        processAppMetrics(conf, {
                            pmId: pm_id,
                            appName: name,
                            appResponse: packet.raw.data,
                        });
                    }
                }
            });
        });

        // Start timer to update available apps
        setInterval(() => {
            detectActiveApps();
        }, WORKER_CHECK_INTERVAL);

        if (conf.debug) {
            setInterval(() => {
                if (Object.keys(APPS).length) {
                    for (const [, app] of Object.entries(APPS)) {
                        getLogger().debug(
                            `App "${app.getName()}" has ${app.getActiveWorkersCount()} worker(s). CPU: ${app
                                .getCpuThreshold()
                                .map((entry) => entry.value)}, Memory: ${Math.round(
                                app.getTotalUsedMemory() / 1024 / 1024
                            )}MB`
                        );
                    }
                } else {
                    getLogger().debug(`No apps available`);
                }
            }, SHOW_STAT_INTERVAL);
        }
    });
};

function processWorkingApp(workingApp: App) {
    metricAvailableApps?.set(Object.keys(APPS).length);

    const labels = { app: workingApp.getName() };

    metricAppInstances?.set(labels, workingApp.getActiveWorkersCount());
    metricAppAverageMemory?.set(labels, workingApp.getAverageUsedMemory());
    metricAppTotalMemory?.set(labels, workingApp.getTotalUsedMemory());
    metricAppAverageCpu?.set(labels, workingApp.getAverageCpu());
    metricAppUptime?.set(labels, workingApp.getUptime());

    workingApp.getCurrentPidsCpu().forEach((entry) => {
        metricAppPidsCpuLast?.set({ ...labels, instance: entry.pmId }, entry.value);
    });

    workingApp.getCpuThreshold().forEach((entry) => {
        metricAppPidsCpuThreshold?.set({ ...labels, instance: entry.pmId }, entry.value);
    });

    workingApp.getCurrentPidsMemory().forEach((entry) => {
        metricAppPidsMemory?.set({ ...labels, instance: entry.pmId }, entry.value);
    });

    workingApp.getRestartCount().forEach((entry) => {
        metricAppRestartCount?.set({ ...labels, instance: entry.pmId }, entry.value);
    });

    workingApp.getPidPm2Metrics().forEach((entry) => {
        Object.keys(entry.metrics).forEach((metricKey) => {
            if (dynamicGaugeMetricClients[metricKey]) {
                dynamicGaugeMetricClients[metricKey].set(
                    { ...labels, instance: entry.pmId },
                    entry.metrics[metricKey]
                );
            }
        });
    });

    // Request available metrics from the running app
    workingApp.getActivePm2Ids().forEach((pm2id) => {
        pm2.sendDataToProcessId(
            pm2id,
            {
                topic: 'pm2-prom-module:collect',
                data: {},
                // Required fields by pm2 but we do not use them
                id: pm2id,
            },
            (err) => {
                if (err)
                    return console.error(
                        `pm2-prom-module: sendDataToProcessId ${err.stack || err}`
                    );
            }
        );
    });
}
