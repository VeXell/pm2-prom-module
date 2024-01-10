// @ts-ignore
import pmx from 'pmx';
import { createServer, ServerResponse, IncomingMessage } from 'http';

import { startPm2Connect } from './core/pm2';
import { initLogger } from './utils/logger';
import { initMetrics, combineAllRegistries } from './metrics';

const DEFAULT_PREFIX = 'pm2';

const startPromServer = (prefix: string, moduleConfig: IConfig) => {
    initMetrics(prefix);

    const serviceName = moduleConfig.service_name;
    const port = moduleConfig.port;

    const promServer = createServer(async (_req: IncomingMessage, res: ServerResponse) => {
        const mergedRegistry = combineAllRegistries(Boolean(moduleConfig.aggregate_app_metrics));
        mergedRegistry.setDefaultLabels({ serviceName });

        res.setHeader('Content-Type', mergedRegistry.contentType);
        res.end(await mergedRegistry.metrics());

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
        startPromServer(DEFAULT_PREFIX, moduleConfig);

        pmx.configureModule({
            human_info: [
                ['Status', 'Module enabled'],
                ['Debug', moduleConfig.debug ? 'Enabled' : 'Disabled'],
                [
                    'Aggregate apps metrics',
                    moduleConfig.aggregate_app_metrics ? 'Enabled' : 'Disabled',
                ],
                ['Port', moduleConfig.port],
                ['Service name', moduleConfig.service_name ? moduleConfig.service_name : `N/A`],
            ],
        });
    }
);
