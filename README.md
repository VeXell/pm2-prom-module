# PM2-Prom-Module [![npm version](https://badge.fury.io/js/pm2-prom-module.svg)](https://www.npmjs.com/package/pm2-prom-module)

PM2 module to help collect applications statistic and send it to Prometheus server

## Motivation

## Solution

## Install

```bash
pm2 install pm2-prom-module
```

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
