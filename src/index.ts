// @ts-ignore
import pmx from 'pmx';

import { startPm2Connect } from './core/pm2';
import { initLogger } from './utils/logger';

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

        pmx.configureModule({
            human_info: [
                ['Status', 'Module enabled'],
                ['Debug', moduleConfig.debug ? 'Enabled' : 'Disabled'],
            ],
        });
    }
);
