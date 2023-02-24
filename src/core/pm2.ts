import pm2 from 'pm2';

import { App } from './app';

import {
    metricAvailableApps,
    metricAppInstances,
    metricAppAverageMemory,
    metricAppTotalMemory,
} from '../utils/metrics';

const WORKER_CHECK_INTERVAL = 1000;

const APPS: { [key: string]: App } = {};

export const startPm2Connect = (_conf: IConfig) => {
    pm2.connect((err) => {
        if (err) return console.error(err.stack || err);

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
}
