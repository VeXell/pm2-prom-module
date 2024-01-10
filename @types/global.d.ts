type IConfig = {
    debug: boolean;
    port: string;
    service_name: string;
    aggregate_app_metrics: boolean;
};

type IPMXConfig = {
    module_conf: IConfig;
};
