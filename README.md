# PM2-Prom-Module [![npm version](https://badge.fury.io/js/pm2-prom-module.svg)](https://www.npmjs.com/package/pm2-prom-module)

PM2 module to help collect applications statistic and send it to Prometheus server

## Motivation

Most of applications use Prometheus monitoring server to collect statistic and then show it on Grafana dashboard. PM2 gives you a way to monitor the resource usage of your application but unfortunately most of information is available from your terminal or with PM2 Plus dashboard. To solve this isses you should use additional module to export statistic data.

Also if you use [PM2-AutoScale](https://www.npmjs.com/package/pm2-autoscale) module you want to see how many active instances of the app is currently active and how many resources it using.

## Solution

This module `pm2-prom-module` allows you to collect all PM2 monitoring data such as `CPU Usage`, `Memory Usage` and etc for your every applications and run HTTP server inside module to collect all metrics.

### Collected statistic

-   Free memory
-   CPUs count
-   Count of running apps
-   Cound of instances for every app
-   Average using memory for every app
-   Total using memory for all instances of a app
-   Average using CPU for every app
-   Current CPU usage for every app instance
-   Restarts count for every app instance
-   Uptime for every app

Also collect all PM2 default metrics for every instance:

-   Used Heap Size
-   Heap Usage
-   Heap Size
-   Event Loop Latency p95
-   Event Loop Latency
-   Active handles
-   Active requests
-   HTTP req/min
-   HTTP P95 Latency
-   HTTP Mean Latency

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

-   `port` Connection port for Prometheus agent. (default to `9988`)
-   `service_name` Default label for registry (default to `` - empty string)
-   `debug` Enable debug mode to show logs from the module (default to `false`)

To modify the module config values you can use the following commands:

```bash
pm2 set pm2-prom-module:debug true
pm2 set pm2-prom-module:port 10801
pm2 set pm2-prom-module:service_name MyApp
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
pm2_event_loop_latency_p95{app="app",instance="1",serviceName="my-app"} 2.55
pm2_event_loop_latency_p95{app="app",instance="2",serviceName="my-app"} 2.48
```
