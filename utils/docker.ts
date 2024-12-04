import { access, constants } from 'node:fs/promises';

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
