# PM2-Prom-Module [![npm version](https://badge.fury.io/js/pm2-prom-module.svg)](https://www.npmjs.com/package/pm2-prom-module)

PM2 module to help collect applications statistic and send it to Prometheus server

**NEW**: Starting from version 2.0.0, the plugin now supports the collection of all your Prometheus metrics from the running applications across multiple instances.

## Motivation

Most of applications use Prometheus monitoring server to collect statistic and then show it on Grafana dashboard. PM2 gives you a way to monitor the resource usage of your application but unfortunately most of information is available from your terminal or with PM2 Plus dashboard. To solve this isses you should use additional module to export statistic data.

Also if you use [PM2-AutoScale](https://www.npmjs.com/package/pm2-autoscale) module you want to see how many active instances of the app is currently active and how many resources it using.

## Solution

This module `pm2-prom-module` allows you to collect all PM2 monitoring data such as `CPU Usage`, `Memory Usage` and etc for your every applications and run HTTP server inside module to collect all metrics.

### PM collected statistic

- Free memory
- CPUs count
- Count of running apps
- Count of instances for every app
- Average using memory for every app
- Total using memory for all instances of a app
- Average using CPU for every app
- Current CPU usage for every app instance
- Restarts count for every app instance
- Uptime for every app
- App status (0-unknown, 1-running, 2-pending, 3-stopped, 4-errored)
- Memory and CPU limits when run PM2 in docker container

Also collect all PM2 default metrics for every instance:

- Used Heap Size
- Heap Usage
- Heap Size
- Event Loop Latency p95
- Event Loop Latency
- Active handles
- Active requests
- HTTP req/min
- HTTP P95 Latency
- HTTP Mean Latency

## Install

```bash
pm2 install pm2-prom-module
```

After installation module creates HTTPS server on address `http://localhost:9988/` and servers responds with Prometheus metrics

## Uninstall

```bash
pm2 uninstall pm2-prom-module
```

## Configuration

Default settings:

- `port` Connection port for Prometheus agent. (default to `9988`)
- `hostname` Listen address. (default to `0.0.0.0`)
- `unix_socket_path` Set if you want to listen on unix socket (default to `` - empty string)
- `service_name` Default label for registry (default to `` - empty string)
- `debug` Enable debug mode to show logs from the module (default to `false`)
- `aggregate_app_metrics` Enable to aggregate metrics from app instances (default to `true`)
- `app_check_interval` Interval to check available apps and collect statistic (default to `1000`)
- `prefix` Prefix for metrics (default to `pm2`)

To modify the module config values you can use the following commands:

```bash
pm2 set pm2-prom-module:debug true
pm2 set pm2-prom-module:port 10801
pm2 set pm2-prom-module:hostname 127.0.0.1
pm2 set pm2-prom-module:service_name MyApp
pm2 set pm2-prom-module:aggregate_app_metrics true
pm2 set pm2-prom-module:app_check_interval 5000
```

## How to collect your own metrics from apps

As of plugin version `2.0.0`, it enables the collection of metrics from all currently running applications in PM2, presenting them in a unified output alongside other PM2 metrics.

To communicate between PM2 nodejs application and `pm2-prom-module`you can use [pm2-prom-module-client](https://www.npmjs.com/package/pm2-prom-module-client) which is using process messaging bus between module and an app.

Here an example how to use it:

```typescript
import client from 'prom-client';
import { initMetrics } from 'pm2-prom-module-client';

const registry = new client.Registry();
const PREFIX = `nodejs_app_`;

const metricRequestCounter = new client.Counter({
    name: `${PREFIX}request_counter`,
    help: 'Show total request count',
    registers: [registry],
});

// Register your prom-client Registry
initMetrics(registry);

// ...
app.get('/*', async (req: AppFastifyRequest, res) => {
    // ...
    metricRequestCounter?.inc();
    // ...
});
```

Plugin automatically collect metrics from all running instances of apps and all metrics will be available on the same endpoint with `pm2-prom-module`. Have a look on an example below.

Also you can add any of your own labels for any of `prom-client` counters, but `app`, and `instance` are reserved for plugin and will be overwritten.

Since version `2.1.0` module support aggregation data for all instances by default.
But you can disable it with module configuration.

```bash
pm2 set pm2-prom-module:aggregate_app_metrics false
```

Aggregated data from all running apps:

```bash
# HELP nodejs_app_requests_total Show total request count
# TYPE nodejs_app_requests_total counter
nodejs_app_requests_total{app="app",serviceName="MyApp"} 8
nodejs_app_requests_total{app="app2",serviceName="MyApp"} 3
```

## Example output

```bash
# HELP pm2_free_memory Show available host free memory
# TYPE pm2_free_memory gauge
pm2_free_memory{serviceName="my-app"} 377147392

# HELP pm2_cpu_count Show available CPUs count
# TYPE pm2_cpu_count gauge
pm2_cpu_count{serviceName="my-app"} 4

# HELP pm2_available_apps Show available apps to monitor
# TYPE pm2_available_apps gauge
pm2_available_apps{serviceName="my-app"} 1

# HELP pm2_app_instances Show app instances count
# TYPE pm2_app_instances gauge
pm2_app_instances{app="app",serviceName="my-app"} 2

# HELP pm2_app_average_memory Show average using memory of an app
# TYPE pm2_app_average_memory gauge
pm2_app_average_memory{app="app",serviceName="my-app"} 60813927

# HELP pm2_app_total_memory Show total using memory of an app
# TYPE pm2_app_total_memory gauge
pm2_app_total_memory{app="app",serviceName="my-app"} 121626624

# HELP pm2_event_loop_latency_p95 Event Loop Latency p95. Unit "ms"
# TYPE pm2_event_loop_latency_p95 gauge
pm2_event_loop_latency_p95{app="app",instance="13",serviceName="my-app"} 2.55
pm2_event_loop_latency_p95{app="app",instance="14",serviceName="my-app"} 2.48

# HELP nodejs_app_requests_total Show total request count
# TYPE nodejs_app_requests_total counter
nodejs_app_requests_total{app="app",instance="13",serviceName="my-app"} 10
nodejs_app_requests_total{app="app",instance="14",serviceName="my-app"} 17
```

## FAQ

### How i can change `max-memory-restart`?

You can install plugin and restart it with the command:

```
pm2 restart pm2-prom-module --max-memory-restart=3000M
```

## Change log

### Version 2.7.1

- Update libs
- Allow to monit instances with pm_id=0. [Merge request](https://github.com/VeXell/pm2-prom-module/pull/14).

### Version 2.6.0

- New logic to collect internal statistic from apps. Check status before send request to process via `sendDataToProcessId`

### Version 2.5.4

- Change logic to detect app status to prevent failed request with `sendDataToProcessId`
- Add new metric `prefix` Prefix for metrics (default to `pm2`)

```bash
pm2 set pm2-prom-module:prefix my_metrics
```

### Version 2.5.2

Additional metrics when PM2 running in docker container and you limit it with commands for example `docker run --memory="512m" --cpus="2"`

- Add new metric `pm2_container_total_memory` describes total available memory in docker container
- Add new metric `pm2_container_free_memory` describes free memory in docker container
- Add new metric `pm2_container_used_memory` describes used memory in container
- Add new metric `pm2_container_cpu_count` describes available CPUs limit in docker container

### Version 2.4.0

- Add new metric `pm2_app_status` describes status of an app. (0-unknown,1-running,2-pending,3-stopped,4-errored)
  All other metrics related to the app (not for pids) will be displayed. For example, `pm2_available_apps` will show app until
  it will be deleted from the PM2 or `pm2_app_instances` will show 0 for `stopped` or `errored` status apps.

### Version 2.3.2

- Add new config option `hostname`. Listen address. If you want to specify, for example, `localhost`, `127.0.0.1`
- Add new config option `unix_socket_path`. Run server on unix socket path.

### Version 2.3.1

- Add new config option `app_check_interval`. Interval to check available apps and collect statistic
