type IConfig = {
    debug: boolean;
    port: string;
    service_name: string;
    aggregate_app_metrics: boolean;
    app_check_interval: number;
};

type IPMXConfig = {
    module_conf: IConfig;
};
