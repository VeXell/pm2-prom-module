// @ts-ignore
import pmx from 'pmx';
import client from 'prom-client';
import { createServer, ServerResponse, IncomingMessage } from 'http';

import { startPm2Connect } from './core/pm2';
import { initLogger } from './utils/logger';
import { initMetrics, registry } from './utils/metrics';

const DEFAULT_PREFIX = 'pm2';

const startPromServer = (prefix: string, port: string, serviceName?: string) => {
    initMetrics(prefix, serviceName);
    const aggregatorRegistry = new client.AggregatorRegistry();

    const promServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        if (req.url === '/cluster') {
            res.setHeader('Content-Type', aggregatorRegistry.contentType);
            res.end(await aggregatorRegistry.clusterMetrics());
        } else {
            res.setHeader('Content-Type', registry.contentType);
            res.end(await registry.metrics());
        }

        return;
    });

    promServer.listen(port, () => console.log(`Metrics server is available on port ${port}.`));
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

        initLogger({ isDebug: moduleConfig.debug });
        startPm2Connect(moduleConfig);
        startPromServer(DEFAULT_PREFIX, moduleConfig.port, moduleConfig.service_name);

        pmx.configureModule({
            human_info: [
                ['Status', 'Module enabled'],
                ['Debug', moduleConfig.debug ? 'Enabled' : 'Disabled'],
                ['Port', moduleConfig.port],
                ['Service name', moduleConfig.service_name ? moduleConfig.service_name : `N/A`],
            ],
        });
    }
);
