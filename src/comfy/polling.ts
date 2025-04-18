import type Workbench from '../main';
import { updateStatusBar } from '../ui/status_bar';

/**
 * Starts the status polling interval.
 * @param pluginInstance The instance of the Workbench plugin.
 */
export function startPolling(pluginInstance: Workbench): void {
    stopPolling(pluginInstance); // Clear existing interval & reset retries

    if (!pluginInstance.settings.enablePolling || !pluginInstance.comfyApi || pluginInstance.settings.pollingIntervalSeconds < 2) {
        console.log('Polling disabled or prerequisites not met.');
        return;
    }

    // Reset retry count whenever polling starts successfully
    pluginInstance.pollingRetryCount = 0;

    console.log(`Starting ComfyUI status polling every ${pluginInstance.settings.pollingIntervalSeconds} seconds.`);
    pluginInstance.pollingIntervalId = window.setInterval(async () => {
        // Ensure we don't poll if a retry is already scheduled
        if (pluginInstance.pollingRetryTimeoutId === null) {
            await pollStatus(pluginInstance);
        }
    }, pluginInstance.settings.pollingIntervalSeconds * 1000);
}

/**
 * Stops the status polling interval and any pending retries.
 * @param pluginInstance The instance of the Workbench plugin.
 */
export function stopPolling(pluginInstance: Workbench): void {
    // Clear main polling interval
    if (pluginInstance.pollingIntervalId !== null) {
        console.log('Stopping ComfyUI status polling interval.');
        window.clearInterval(pluginInstance.pollingIntervalId);
        pluginInstance.pollingIntervalId = null;
    }
    // Clear any pending retry timeout
    if (pluginInstance.pollingRetryTimeoutId !== null) {
        console.log('Clearing pending polling retry.');
        window.clearTimeout(pluginInstance.pollingRetryTimeoutId);
        pluginInstance.pollingRetryTimeoutId = null;
    }
    // Reset retry counter
    pluginInstance.pollingRetryCount = 0;
}

/**
 * Performs a single status poll check, with retry logic on error.
 * @param pluginInstance The instance of the Workbench plugin.
 */
export async function pollStatus(pluginInstance: Workbench): Promise<void> {
    // Clear any potentially completed retry timeout before proceeding
    pluginInstance.pollingRetryTimeoutId = null;

    if (!pluginInstance.comfyApi) {
        console.log("pollStatus skipped: ComfyAPI not available.");
        // Don't automatically retry if the API object itself is gone
        // Let checkComfyConnection handle re-establishing it.
        if (pluginInstance.currentComfyStatus !== 'Disconnected' && pluginInstance.currentComfyStatus !== 'Error') {
             updateStatusBar(pluginInstance, 'Disconnected', 'API unavailable during poll');
             stopPolling(pluginInstance); // Stop everything if API is lost
        }
        return;
    }
    if (pluginInstance.currentComfyStatus === 'Launching') {
        console.log("pollStatus skipped: Still launching.");
        return;
    }

    try {
        console.log("Polling ComfyUI status...");
        const queueData = await pluginInstance.comfyApi.getQueue();
        if (queueData === null || typeof queueData === 'undefined') {
             throw new Error("Received null or undefined queue data from API.");
        }

        // --- Success ---
        // Reset retry count on successful poll
        if (pluginInstance.pollingRetryCount > 0) {
            console.log("Polling successful, resetting retry count.");
        }
        pluginInstance.pollingRetryCount = 0;

        const queueRunning = queueData?.queue_running;
        const queuePending = queueData?.queue_pending;

        if (Array.isArray(queueRunning) && queueRunning.length > 0) {
            // ... (logic for Busy status - running) ...
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
            // ... (logic for Busy status - pending) ...
            updateStatusBar(pluginInstance, 'Busy', `Busy: ${queuePending.length} item(s) pending in queue.`);
        } else {
            // ... (logic for Ready status) ...
            updateStatusBar(pluginInstance, 'Ready', `Ready.${pluginInstance.settings.enablePolling ? ' Polling active.' : ''}`);
        }

    } catch (error: any) {
        console.error('Polling error:', error);

        // --- Retry Logic ---
        const settings = pluginInstance.settings;
        if (settings.enablePollingRetry && pluginInstance.pollingRetryCount < settings.pollingRetryAttempts) {
            pluginInstance.pollingRetryCount++;
            const retryDelayMs = settings.pollingRetryDelaySeconds * 1000;
            const attempt = pluginInstance.pollingRetryCount;
            const maxAttempts = settings.pollingRetryAttempts;

            console.log(`Polling attempt ${attempt}/${maxAttempts} failed. Retrying in ${settings.pollingRetryDelaySeconds}s...`);
            updateStatusBar(pluginInstance, 'Connecting', `Connection lost. Retrying ${attempt}/${maxAttempts}...`); // Use 'Connecting' icon/text for retry state

            // Schedule the next pollStatus attempt
            pluginInstance.pollingRetryTimeoutId = window.setTimeout(() => {
                // Call pollStatus again after the delay
                // Need to ensure `this` context is correct if calling directly,
                // but since we pass pluginInstance, it's fine.
                pollStatus(pluginInstance);
            }, retryDelayMs);

            // Stop the main interval timer while retrying
            if (pluginInstance.pollingIntervalId !== null) {
                 window.clearInterval(pluginInstance.pollingIntervalId);
                 pluginInstance.pollingIntervalId = null;
                 console.log("Paused main polling interval during retry attempts.");
            }

        } else {
            // --- Retries Disabled or Exhausted ---
            console.error('Polling failed permanently after retries (or retries disabled). Stopping polling.');
            updateStatusBar(pluginInstance, 'Error', `Polling failed: ${error.message}`);
            stopPolling(pluginInstance); // Stop interval, clear timeouts, reset count
            pluginInstance.comfyApi = null; // Assume API is no longer valid
        }
    }
}