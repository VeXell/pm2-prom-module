import pm2 from 'pm2';

import { App, PM2_METRICS } from './app';
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
    metricAppPidsCpu,
    metricAppRestartCount,
    metricAppUptime,
    metricAppPidsMemory,
} from '../metrics';

import { processAppMetrics, deleteAppMetrics } from '../metrics/app';

import { getLogger } from '../utils/logger';

const WORKER_CHECK_INTERVAL = 1000;

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

const detectActiveApps = () => {
    const logger = getLogger();

    pm2.list((err, apps) => {
        if (err) return console.error(err.stack || err);

        const allAppsPids: { [key: string]: { pids: number[]; restartsSum: number } } = {};

        apps.forEach((app) => {
            const pm2_env = app.pm2_env as pm2.Pm2Env;
            const appName = app.name;

            if (isMonitoringApp(app)) {
                logger.debug(`Skip app ${appName}`);
                return;
            }

            // Fill all apps pids
            if (!allAppsPids[appName]) {
                allAppsPids[appName] = {
                    pids: [],
                    restartsSum: 0,
                };
            }

            allAppsPids[appName].pids.push(app.pid);
            allAppsPids[appName].restartsSum =
                allAppsPids[appName].restartsSum + Number(pm2_env.restart_time || 0);
        });

        Object.keys(APPS).forEach((appName) => {
            // Filters apps which do not have active pids
            if (!allAppsPids[appName]) {
                logger.debug(`Delete ${appName} because it not longer exists`);
                delete APPS[appName];

                // Clear app metrics
                deleteAppMetrics(appName);
            } else {
                const workingApp = APPS[appName];

                if (workingApp) {
                    const pidsRestartsSum = workingApp
                        .getRestartCount()
                        .reduce((accum, item) => accum + item.value, 0);

                    if (pidsRestartsSum !== allAppsPids[appName].restartsSum) {
                        logger.debug(`App ${appName} has been restarted. Clear metrics`);
                        deleteAppMetrics(appName);
                    }
                }
            }
        });

        apps.forEach((app) => {
            const pm2_env = app.pm2_env as pm2.Pm2Env;
            const appName = app.name;

            if (isMonitoringApp(app)) {
                return;
            }

            if (!APPS[appName]) {
                APPS[appName] = new App(appName);
            }

            const workingApp = APPS[appName];
            const activePids = allAppsPids[appName].pids;

            if (activePids) {
                workingApp.removeNotActivePids(activePids);
            }

            const restartCount = pm2_env.restart_time || 0;

            workingApp.updatePid({
                id: app.pid,
                memory: app.monit.memory,
                cpu: app.monit.cpu || 0,
                pmId: app.pm_id,
                restartCount,
                createdAt: pm2_env.created_at || 0,
                metrics: pm2_env.axm_monitor,
            });

            // Collect metrics
            processWorkingApp(workingApp);
        });
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
                    packet.raw.topic === 'pm2-prom-module:metrics' &&
                    packet.raw.data
                ) {
                    const { name, pm_id } = packet.process;

                    logger.debug(
                        `Got message from app=${name} and pid=${pm_id}. Message=${JSON.stringify(
                            packet.raw.data
                        )}`
                    );

                    if (name && APPS[name] && packet.raw.data.metrics) {
                        logger.debug(`Process message for the app ${name}`);

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

    workingApp.getCurrentPidsCpu().map((entry) => {
        metricAppPidsCpu?.set({ ...labels, instance: entry.pmId }, entry.value);
    });

    workingApp.getCurrentPidsMemory().map((entry) => {
        metricAppPidsMemory?.set({ ...labels, instance: entry.pmId }, entry.value);
    });

    workingApp.getRestartCount().map((entry) => {
        metricAppRestartCount?.set({ ...labels, instance: entry.pmId }, entry.value);
    });

    workingApp.getPidPm2Metrics().map((entry) => {
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
                if (err) return console.error(err.stack || err);
            }
        );
    });
}
