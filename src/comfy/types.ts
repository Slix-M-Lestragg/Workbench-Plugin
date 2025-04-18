// Define possible states for the ComfyUI connection
export type ComfyStatus = 'Disconnected' | 'Connecting' | 'Ready' | 'Busy' | 'Error' | 'Launching';

// Interface defining the expected methods for interacting with the ComfyUI API
// This is kept separate from the SDK to allow for a minimal implementation
export interface ComfyApi {
    baseUrl: string;
    getObjectInfo(): Promise<any>;
    getPromptHistory(): Promise<any>;
    getQueue(): Promise<any>;
    getSystemStats(): Promise<any>;
}