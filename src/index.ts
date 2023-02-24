// @ts-ignore
import pmx from 'pmx';
import { createServer, ServerResponse, IncomingMessage } from 'http';

import { startPm2Connect } from './core/pm2';
import { initLogger } from './utils/logger';
import { registry as promClient, initMetrics } from './utils/metrics';

const DEFAULT_PREFIX = 'pm2';

const startPromServer = (prefix: string) => {
    initMetrics(prefix);

    createServer(async (_req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('Content-Type', promClient.contentType);
        res.end(await promClient.metrics());
        return;
    });
};

pmx.initModule(
    {
        widget: {
            el: {
                probes: true,
                actions: true,
            },

            block: {
                actions: false,
                issues: true,
                meta: true,
            },
        },
    },
    function (err: any, conf: IPMXConfig) {
        if (err) return console.error(err.stack || err);

        const moduleConfig = conf.module_conf;
        const prefix = moduleConfig.prefix || DEFAULT_PREFIX;

        initLogger({ isDebug: moduleConfig.debug });
        startPm2Connect(moduleConfig);
        startPromServer(prefix);

        pmx.configureModule({
            human_info: [
                ['Status', 'Module enabled'],
                ['Debug', moduleConfig.debug ? 'Enabled' : 'Disabled'],
                ['Port', moduleConfig.port],
                ['Metrics prefix', moduleConfig.prefix],
            ],
        });
    }
);
