type IConfig = {
    debug: boolean;
    port: string;
    unix_socket_path: string;
    hostname: string;
    service_name: string;
    aggregate_app_metrics: boolean;
    app_check_interval: number;
};

type IPMXConfig = {
    module_conf: IConfig;
};

interface ErrnoException extends Error {
    errno?: number;
    code?: string;
    path?: string;
    syscall?: string;
    stack?: string;
}
