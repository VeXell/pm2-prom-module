class SimpleLogger {
    private readonly isDebug: boolean = false;

    constructor(isDebug: boolean = false) {
        this.isDebug = isDebug;
    }

    debug(message: string) {
        if (this.isDebug) {
            const value = `DEBUG: ${message}`;
            this.log(value);
        }
    }

    error(message: string) {
        const value = `ERROR: ${message}`;
        this.logError(value);
    }

    info(message: string) {
        const value = `INFO: ${message}`;
        this.log(value);
    }

    private log(message: string) {
        console.log(message);
    }

    private logError(message: string) {
        console.error(message);
    }
}

type IInitOptions = {
    isDebug: boolean;
};

let loggerInstance: SimpleLogger | undefined;

export const initLogger = ({ isDebug }: IInitOptions) => {
    if (!loggerInstance) {
        loggerInstance = new SimpleLogger(isDebug);
    }
};

export const getLogger = () => {
    if (!loggerInstance) {
        loggerInstance = new SimpleLogger();
    }

    return loggerInstance;
};

export const logger = getLogger();
