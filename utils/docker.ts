import { access, constants, readFile } from 'node:fs/promises';
import os from 'node:os';
import { getCpuCount } from './cpu';

//const MEMORY_AVAILABLE = '/sys/fs/cgroup/memory.limit_in_bytes';
//const MEMORY_USED = '/sys/fs/cgroup/memory.usage_in_bytes';

const MEMORY_AVAILABLE = '/sys/fs/cgroup/memory.max';
const MEMORY_USED = '/sys/fs/cgroup/memory.current';
const CPUS_LIMIT = '/sys/fs/cgroup/cpu.max';

export const hasDockerLimitFiles = async () => {
    await access(MEMORY_AVAILABLE, constants.R_OK);
};

export const getAvailableMemory = async () => {
    try {
        const data = (await readFile(MEMORY_AVAILABLE, { encoding: 'utf8' })).trim();

        if (data === 'max') {
            return os.totalmem();
        } else {
            const memoryNumber = parseInt(data, 10);

            if (isNaN(memoryNumber)) {
                return 0;
            } else {
                return memoryNumber;
            }
        }
    } catch {
        return 0;
    }
};

export const getUsedMemory = async () => {
    try {
        const data = (await readFile(MEMORY_USED, { encoding: 'utf8' })).trim();
        const usedMemory = parseInt(data, 10);

        if (isNaN(usedMemory)) {
            return 0;
        } else {
            return usedMemory;
        }
    } catch {
        return 0;
    }
};

export const getFreeMemory = async () => {
    try {
        const data = (await readFile(MEMORY_AVAILABLE, { encoding: 'utf8' })).trim();
        const systemFreeMem = os.freemem();

        if (data === 'max') {
            // In that case we do not have any limits. Use only freemem
            return systemFreeMem;
        }

        // In that case we should calculate free memory
        const availableMemory = parseInt(data, 10);

        if (isNaN(availableMemory)) {
            // If we can not parse return OS Free memory
            return systemFreeMem;
        }

        const usedMemory = await getUsedMemory();

        if (availableMemory <= systemFreeMem) {
            // We have docker limit in the container
            return availableMemory - usedMemory;
        } else {
            // Limited by system available memory
            return systemFreeMem;
        }
    } catch {
        return 0;
    }
};

export const getCPULimit = async () => {
    let count = getCpuCount();
    const delimeter = 100000;

    try {
        const data = (await readFile(CPUS_LIMIT, { encoding: 'utf8' })).trim();

        if (data) {
            const values = data.split(' ');

            if (values.length === 2) {
                const parsedValue = parseInt(values[0], 10);

                if (!isNaN(parsedValue)) {
                    count = parsedValue / delimeter;
                }
            }
        }
    } catch {}

    return count;
};
