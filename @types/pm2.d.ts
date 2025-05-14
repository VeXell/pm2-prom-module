import 'pm2';

declare module 'pm2' {
    export type AxmMonitor = {
        value: number | string;
        type: string;
        unit?: 'MiB' | '%' | 'ms' | 'req/min';
        historic: boolean;
    };

    export type Pm2Env = {
        axm_options: {
            isModule: boolean;
            metrics?: Object;
        };
        axm_actions: any;
        exec_mode: 'fork_mode' | 'cluster_mode';
        status: 'online' | 'stopping' | 'stopped' | 'launching' | 'errored' | 'one-launch-status';
        instances: number;
        restart_time?: number;
        created_at?: number;
        axm_monitor?: {
            [key: string]: AxmMonitor;
        };
        BLOCKLET_DOCKER_NAME: string | undefined;
    };
}
