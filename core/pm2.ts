import pm2, { Pm2Env } from 'pm2';

import { App, IPidDataInput, PM2_METRICS } from './app';
import { toUndescore } from '../utils';
import { PM2BusResponse } from '../types';
import { getPidsUsage } from '../utils/cpu';

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
    metricAppStatus,
    deletePromAppMetrics,
    deletePromAppInstancesMetrics,
} from '../metrics';

import { processAppMetrics, deleteAppMetrics } from '../metrics/app';

import { getLogger } from '../utils/logger';
import { getDockerStats } from '../utils/docker';

type IPidsData = Record<number, IPidDataInput>;
type IAppData = Record<string, { pids: number[]; restartsSum: number; status?: Pm2Env['status'] }>;

const WORKER_CHECK_INTERVAL = 1000;
const SHOW_STAT_INTERVAL = 10000;

const APPS: { [key: string]: App } = {};

const isMonitoringApp = (app: pm2.ProcessDescription) => {
    const pm2_env = app.pm2_env as pm2.Pm2Env;

    if (
        pm2_env.axm_options.isModule ||
        !app.name ||
        app.pm_id === undefined // pm_id might be zero
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
        status: pidData.status,
    });
};

const detectActiveApps = () => {
    const logger = getLogger();

    pm2.list((err, apps) => {
        if (err) return console.error(err.stack || err);

        const pidsMonit: IPidsData = {};
        const mapAppPids: IAppData = {};
        const activePM2Ids = new Set<number>();

        apps.forEach((appInstance: pm2.ProcessDescription) => {
            const pm2_env = appInstance.pm2_env as pm2.Pm2Env;
            const appName = appInstance.name;

            if (!isMonitoringApp(appInstance) || !appName || appInstance.pm_id === undefined) {
                return;
            }

            // Fill all apps pids
            if (!mapAppPids[appName]) {
                mapAppPids[appName] = {
                    pids: [],
                    restartsSum: 0,
                };
            }

            mapAppPids[appName].restartsSum =
                mapAppPids[appName].restartsSum + Number(pm2_env.restart_time || 0);

            // Get the last app instance status
            mapAppPids[appName].status = appInstance.pm2_env?.status;

            if (appInstance.pid && appInstance.pm_id !== undefined) {
                mapAppPids[appName].pids.push(appInstance.pid);

                // Fill active pm2 apps id to collect internal statistic
                if (pm2_env.status === 'online') {
                    activePM2Ids.add(appInstance.pm_id);
                }

                // Fill monitoring data
                pidsMonit[appInstance.pid] = {
                    cpu: 0,
                    memory: 0,
                    pmId: appInstance.pm_id,
                    id: appInstance.pid,
                    restartCount: pm2_env.restart_time || 0,
                    createdAt: pm2_env.created_at || 0,
                    metrics: pm2_env.axm_monitor,
                    status: pm2_env.status,
                };
            }
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
                        logger.debug(
                            `App ${appName} clear metrics. Removed PIDs ${removedIntances.toString()}`
                        );
                        deletePromAppInstancesMetrics(appName, removedIntances);

                        if (!activePids.length) {
                            // Delete app metrics because it does not have active PIDs anymore
                            logger.debug(
                                `App ${appName} does not have active PIDs. Clear app metrics`
                            );
                            deleteAppMetrics(appName);
                        }
                    }

                    const pidsRestartsSum = workingApp
                        .getRestartCount()
                        .reduce((accum, item) => accum + item.value, 0);

                    if (processingApp.restartsSum > pidsRestartsSum) {
                        // Reset metrics when active restart app bigger then active app
                        // This logic exist to prevent autoscaling problems if we use only !==
                        logger.debug(`App ${appName} has been restarted. Clear app metrics`);
                        deleteAppMetrics(appName);
                    }
                }
            }
        });

        // Create instances for new apps
        for (const [appName, entry] of Object.entries(mapAppPids)) {
            if (!APPS[appName]) {
                APPS[appName] = new App(appName);
            }

            const workingApp = APPS[appName];

            if (workingApp) {
                // Update status
                workingApp.updateStatus(entry.status);
            }
        }

        // Collect statistic from apps. Do it after all APPS created
        if (activePM2Ids.size > 0) {
            // logger.debug(`Collect app metrics from PIDs ${Array.from(activePM2Ids)}`);
            sendCollectStaticticBusEvent(Array.from(activePM2Ids));
        }

        // Update metric with available apps
        metricAvailableApps?.set(Object.keys(APPS).length);

        // Get all pids to monit
        const pids = Object.keys(pidsMonit);

        // Get real pids data.
        // !ATTENTION! Can not use PM2 app.monit because of incorrect values of CPU usage
        getPidsUsage(pids)
            .then(async (stats) => {
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

                // Get docker stats
                // @ts-expect-error
                const dockerApps = apps.filter((app) => app.pm2_env?.BLOCKLET_DOCKER_NAME);
                await getDockerStats(
                    // @ts-expect-error
                    dockerApps.map((x) => x.pm2_env?.BLOCKLET_DOCKER_NAME)
                ).then((stats) => {
                    stats.map((stat, i) => {
                        if (!stat) {
                            return;
                        }
                        const entry = mapAppPids[dockerApps[i].name!];
                        if (entry) {
                            entry.pids.forEach((pid) => {
                                pidsMonit[pid].cpu = stat.cpuUsage;
                                pidsMonit[pid].memory = stat.memoryUsage;
                            });
                        }
                    });
                });

                for (const [appName, entry] of Object.entries(mapAppPids)) {
                    const workingApp = APPS[appName];

                    if (workingApp) {
                        // Update pids data
                        entry.pids.forEach((pidId) => {
                            const monit: IPidDataInput | undefined = pidsMonit[pidId];

                            if (monit) {
                                updateAppPidsData(workingApp, monit);
                            }
                        });

                        // Collect metrics
                        processWorkingApp(workingApp);
                    }
                }
            })
            .catch((err) => {
                console.error(err.stack || err);
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
        }, conf.app_check_interval ?? WORKER_CHECK_INTERVAL);

        if (conf.debug) {
            setInterval(() => {
                if (Object.keys(APPS).length) {
                    for (const [, app] of Object.entries(APPS)) {
                        const cpuValues = app.getCpuThreshold().map((entry) => entry.value);
                        const memory = Math.round(app.getTotalUsedMemory() / 1024 / 1024);
                        const CPU = cpuValues.length ? cpuValues.toString() : '0';

                        getLogger().debug(
                            `App "${app.getName()}" has ${app.getActiveWorkersCount()} worker(s). CPU: ${CPU}, Memory: ${memory}MB`
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
    const labels = { app: workingApp.getName() };

    metricAppInstances?.set(labels, workingApp.getActiveWorkersCount());
    metricAppAverageMemory?.set(labels, workingApp.getAverageUsedMemory());
    metricAppTotalMemory?.set(labels, workingApp.getTotalUsedMemory());
    metricAppAverageCpu?.set(labels, workingApp.getAverageCpu());
    metricAppUptime?.set(labels, workingApp.getUptime());
    metricAppStatus?.set(labels, workingApp.getStatus());

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
}

function sendCollectStaticticBusEvent(pm2Ids: number[]) {
    // Request available metrics from all running apps
    pm2Ids.forEach((pm2id) => {
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
