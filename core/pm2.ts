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

import { processAppMetrics } from '../metrics/app';

import { getLogger } from '../utils/logger';

const WORKER_CHECK_INTERVAL = 1000;

const APPS: { [key: string]: App } = {};

const detectActiveApps = () => {
    pm2.list((err, apps) => {
        if (err) return console.error(err.stack || err);

        const allAppsPids: { [key: string]: number[] } = {};

        apps.forEach((app) => {
            // Fill all apps pids
            if (!allAppsPids[app.name]) {
                allAppsPids[app.name] = [];
            }

            allAppsPids[app.name].push(app.pid);
        });

        Object.keys(APPS).forEach((appName) => {
            if (!allAppsPids[appName]) {
                // Delete app if not longer exists
                delete APPS[appName];
            }
        });

        apps.forEach((app) => {
            const pm2_env = app.pm2_env as pm2.Pm2Env;

            if (pm2_env.axm_options.isModule) {
                return;
            }

            if (!app.name || !app.pid || app.pm_id === undefined) {
                return;
            }

            if (pm2_env.status !== 'online') {
                delete APPS[app.name];
                return;
            }

            if (!APPS[app.name]) {
                APPS[app.name] = new App(app.name);
            }

            const workingApp = APPS[app.name];

            const activePids = allAppsPids[app.name];
            if (activePids) {
                workingApp.removeNotActivePids(activePids);
            }

            workingApp.updatePid({
                id: app.pid,
                memory: app.monit.memory,
                cpu: app.monit.cpu || 0,
                pmId: app.pm_id,
                restartCount: pm2_env.restart_time || 0,
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
