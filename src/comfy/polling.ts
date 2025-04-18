import type Workbench from '../main';
import { updateStatusBar } from '../ui/status_bar'; // Import necessary functions

/**
 * Starts the status polling interval.
 * @param pluginInstance The instance of the Workbench plugin.
 */
export function startPolling(pluginInstance: Workbench): void {
    stopPolling(pluginInstance); // Clear any existing interval first

    if (!pluginInstance.settings.enablePolling || !pluginInstance.comfyApi || pluginInstance.settings.pollingIntervalSeconds < 2) {
        console.log('Polling disabled or prerequisites not met.');
        return;
    }

    console.log(`Starting ComfyUI status polling every ${pluginInstance.settings.pollingIntervalSeconds} seconds.`);
    pluginInstance.pollingIntervalId = window.setInterval(async () => {
        await pollStatus(pluginInstance); // Pass the instance
    }, pluginInstance.settings.pollingIntervalSeconds * 1000);
}

/**
 * Stops the status polling interval.
 * @param pluginInstance The instance of the Workbench plugin.
 */
export function stopPolling(pluginInstance: Workbench): void {
    if (pluginInstance.pollingIntervalId !== null) {
        console.log('Stopping ComfyUI status polling.');
        window.clearInterval(pluginInstance.pollingIntervalId);
        pluginInstance.pollingIntervalId = null;
    }
}

/**
 * Performs a single status poll check.
 * @param pluginInstance The instance of the Workbench plugin.
 */
export async function pollStatus(pluginInstance: Workbench): Promise<void> {
    if (!pluginInstance.comfyApi || pluginInstance.currentComfyStatus === 'Connecting' || pluginInstance.currentComfyStatus === 'Launching') {
        return;
    }

    try {
        const queueData = await pluginInstance.comfyApi.getQueue();
        const queueRunning = queueData?.queue_running;
        const queuePending = queueData?.queue_pending;

        if (Array.isArray(queueRunning) && queueRunning.length > 0) {
            const currentJob = queueRunning[0];
            const promptId = currentJob?.[1];
            const progress = currentJob?.[2]?.[0];
            const totalSteps = currentJob?.[2]?.[1];
            let tooltip = `Busy: Processing prompt ${promptId || '?'}.`;
            if (progress !== undefined && totalSteps !== undefined) {
                tooltip += ` Step ${progress}/${totalSteps}`;
            }
            updateStatusBar(pluginInstance, 'Busy', tooltip);
        } else if (Array.isArray(queuePending) && queuePending.length > 0) {
            updateStatusBar(pluginInstance, 'Busy', `Busy: ${queuePending.length} item(s) pending in queue.`);
        } else {
            updateStatusBar(pluginInstance, 'Ready', `Ready. Polling active.`);
        }
    } catch (error) {
        console.error('Polling error:', error);
        updateStatusBar(pluginInstance, 'Error', `Polling failed: ${error.message}`);
        stopPolling(pluginInstance); // Stop polling on error
        pluginInstance.comfyApi = null; // Assume API is no longer valid
    }
}