import pm2 from 'pm2';

import { App, PM2_METRICS } from './app';
import { toUndescore } from '../utils';

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
} from '../utils/metrics';

const WORKER_CHECK_INTERVAL = 1000;

const APPS: { [key: string]: App } = {};

export const startPm2Connect = (_conf: IConfig) => {
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

        setInterval(() => {
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

                    processWorkingApp(workingApp);
                });
            });
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

    workingApp.getCurrentPidsCpu().map((entry, index) => {
        metricAppPidsCpu?.set({ ...labels, instance: index + 1 }, entry.value);
    });

    workingApp.getRestartCount().map((entry, index) => {
        metricAppRestartCount?.set({ ...labels, instance: index + 1 }, entry.value);
    });

    workingApp.getPidPm2Metrics().map((entry, index) => {
        Object.keys(entry.metrics).forEach((metricKey) => {
            if (dynamicGaugeMetricClients[metricKey]) {
                dynamicGaugeMetricClients[metricKey].set(
                    { ...labels, instance: index + 1 },
                    entry.metrics[metricKey]
                );
            }
        });
    });
}
