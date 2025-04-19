// Define possible states for the ComfyUI connection
export type ComfyStatus = 'Disconnected' | 'Connecting' | 'Ready' | 'Busy' | 'Error' | 'Launching';

// --- Types for Status Modal ---

export interface GpuStats {
    name: string;
    gpu_utilization?: number; // Percentage
    vram_used: number; // Bytes
    vram_total: number; // Bytes
}

export interface SystemStats {
    cpu_utilization?: number; // Percentage
    ram_utilization?: number; // Percentage
    gpus?: GpuStats[];
}

// Basic structure based on modal usage - adjust if ComfyUI API provides more detail
export interface QueueInfo {
    queue_running: any[]; // Array of running items (structure might be [prompt_id, ...])
    queue_pending: any[]; // Array of pending items
}
