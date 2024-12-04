import { access, constants, readFile } from 'node:fs/promises';
import os from 'node:os';

const MEMORY_AVAILABLE = '/sys/fs/cgroup/memory/memory.limit_in_bytes';
const MEMORY_USED = '/sys/fs/cgroup/memory/memory.usage_in_bytes';

export const hasDockerLimitFiles = async () => {
    try {
        await access(MEMORY_AVAILABLE, constants.R_OK);
        return true;
    } catch {
        return false;
    }
};

export const getTotalMemory = async () => {
    try {
        const data = await readFile(MEMORY_AVAILABLE, { encoding: 'utf8' });

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

export const getFreeMemory = async () => {
    try {
        const totalMemory = await getTotalMemory();

        if (totalMemory > 0) {
            const data = await readFile(MEMORY_USED, { encoding: 'utf8' });
            const usedMemory = parseInt(data, 10);

            if (isNaN(usedMemory)) {
                return 0;
            } else {
                return totalMemory - usedMemory;
            }
        } else {
            return 0;
        }
    } catch {
        return 0;
    }
};
