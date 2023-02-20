import pm2 from 'pm2';
import os from 'node:os';

import { App } from './app';
import { handleUnit } from '../utils';
import { getLogger } from '../utils/logger';

const WORKER_CHECK_INTERVAL = 1000;
const SHOW_STAT_INTERVAL = 10000;

const TOTAL_CPUS = os.cpus().length;
const MAX_AVAILABLE_WORKERS_COUNT = TOTAL_CPUS - 1;

const APPS: { [key: string]: App } = {};

export const startPm2Connect = (conf: IConfig) => {
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

                    processWorkingApp(conf, workingApp);
                });
            });
        }, WORKER_CHECK_INTERVAL);

        if (conf.debug) {
            setInterval(() => {
                getLogger().debug(
                    `System: Free memory ${handleUnit(os.freemem())}, Total memory: ${handleUnit(
                        os.totalmem()
                    )}`
                );

                if (Object.keys(APPS).length) {
                    for (const [, app] of Object.entries(APPS)) {
                        getLogger().debug(
                            `App "${app.getName()}" has ${app.getActiveWorkersCount()} worker(s). CPU: ${app.getCpuThreshold()}, Memory: ${app.getTotalUsedMemory()}MB`
                        );
                    }
                } else {
                    getLogger().debug(`No apps available`);
                }
            }, SHOW_STAT_INTERVAL);
        }
    });
};

function processWorkingApp(conf: IConfig, workingApp: App) {
    //
}
