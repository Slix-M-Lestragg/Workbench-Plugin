import type Workbench from '../main';
import { updateStatusBar } from '../ui/status_bar';
import type { ComfyStatus } from './types';
import { Notice } from 'obsidian';

const POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds
const RETRY_DELAY_MS = 10000; // Wait 10 seconds before retrying
const MAX_RETRIES = 3; // Maximum number of retries

/**
 * Polls the ComfyUI status endpoint.
 * @param pluginInstance The instance of the Workbench plugin.
 */
export async function pollStatus(pluginInstance: Workbench): Promise<void> {
    const { comfyApi, settings } = pluginInstance;

    if (!comfyApi) {
        console.log("pollStatus skipped: ComfyAPI not available.");
        // If polling was active, transition to disconnected
        if (pluginInstance.currentComfyStatus !== 'Disconnected' && pluginInstance.currentComfyStatus !== 'Error') {
             updateStatusBar(pluginInstance, 'Disconnected', 'ComfyUI connection lost.');
             pluginInstance.currentComfyStatus = 'Disconnected'; // Ensure internal state matches
             stopPolling(pluginInstance); // Stop further attempts if API is gone
        }
        // Do not throw an error here if the API simply isn't available
        // Throwing here would incorrectly trigger failure logic in checkComfyConnection's initial poll
        return;
    }

    console.log("Polling ComfyUI status...");

    try {
        // --- Use SDK methods --- 
        // Use the HTTP URL derived during connection for direct API calls if needed,
        // but prefer SDK methods if they work correctly after initialization fix.
        const queueData = await comfyApi.getQueue(); // Assumes SDK uses the base HTTP URL correctly now
        const queueRunning = queueData?.queue_running ?? []; // Default to empty array
        const queuePending = queueData?.queue_pending ?? []; // Default to empty array
        const queueTotal = queueRunning.length + queuePending.length;

        // --- Determine Status ---
        let newStatus: ComfyStatus;
        let tooltip: string;

        if (queueTotal > 0) {
            newStatus = 'Busy';
            tooltip = `ComfyUI is busy. Queue: ${queueRunning.length} running, ${queuePending.length} pending.`;
        } else {
            newStatus = 'Ready';
            tooltip = 'ComfyUI is ready.';
        }

        // --- Update Status Bar --- 
        // Only update if the status actually changed to avoid flicker/noise
        if (pluginInstance.currentComfyStatus !== newStatus) {
            updateStatusBar(pluginInstance, newStatus, tooltip);
        } else {
            // Update tooltip even if status is the same (e.g., queue length changes)
            if (pluginInstance.statusBarItemEl && pluginInstance.statusBarItemEl.ariaLabel !== tooltip) {
                pluginInstance.statusBarItemEl.ariaLabel = tooltip;
            }
        }
        pluginInstance.pollingRetryCount = 0; // Reset retry count on success

        // If polling was paused for retries, resume it
        if (pluginInstance.pollingIntervalId === null && settings.enablePolling) {
            console.log("Resuming main polling interval after successful retry.");
            // Ensure we don't have a lingering retry timeout
            if (pluginInstance.pollingRetryTimeoutId) {
                clearTimeout(pluginInstance.pollingRetryTimeoutId);
                pluginInstance.pollingRetryTimeoutId = null;
            }
            startPolling(pluginInstance); // Restart the regular interval
        }


    } catch (error: any) {
        console.error("Polling error:", error); // Log the actual error

        // Increment retry count
        pluginInstance.pollingRetryCount++;
        const errorMessage = error.message || 'Polling failed';
        // Avoid spamming notices on every poll failure, maybe only on final failure?
        // new Notice(`ComfyUI polling failed: ${errorMessage}`); 

        if (pluginInstance.pollingRetryCount <= MAX_RETRIES) {
            console.warn(`Polling attempt ${pluginInstance.pollingRetryCount}/${MAX_RETRIES} failed. Retrying in ${RETRY_DELAY_MS / 1000}s...`);

            // Pause the main polling interval if it's running
            if (pluginInstance.pollingIntervalId !== null) {
                 console.log("Paused main polling interval during retry attempts.");
                 stopPolling(pluginInstance); // Stop the regular interval (important: stopPolling clears intervalId)
            }

            // Clear any existing retry timeout before setting a new one
            if (pluginInstance.pollingRetryTimeoutId) {
                clearTimeout(pluginInstance.pollingRetryTimeoutId);
            }

            // Schedule a single retry
            pluginInstance.pollingRetryTimeoutId = window.setTimeout(() => {
                pluginInstance.pollingRetryTimeoutId = null; // Clear the ID once the timeout executes
                // Don't restart polling here, just attempt the poll again
                pollStatus(pluginInstance); // Recursively call pollStatus for the retry
            }, RETRY_DELAY_MS);

            // Update status bar to indicate connection issue during retries
            updateStatusBar(pluginInstance, 'Error', `Polling failed (Attempt ${pluginInstance.pollingRetryCount}/${MAX_RETRIES}). Retrying...`);


        } else {
            console.error(`Polling failed permanently after ${MAX_RETRIES} retries. Stopping polling.`);
            new Notice(`ComfyUI connection lost: ${errorMessage}`); // Notify user on final failure
            updateStatusBar(pluginInstance, 'Error', `Polling failed: ${errorMessage}`);
            stopPolling(pluginInstance); // Stop polling completely (already called if interval was running, but safe to call again)
             // Consider setting status to Disconnected or Error permanently
             pluginInstance.currentComfyStatus = 'Error'; // Set final state to Error
             // Don't nullify comfyApi here, the connection *might* recover later if user clicks status bar
        }
         // --- IMPORTANT: Re-throw the error so the initial check in api.ts knows it failed --- 
         // This ensures the initial connection promise correctly reflects the first poll's outcome.
         throw error;
    }
}


/**
 * Starts the polling interval.
 * @param pluginInstance The instance of the Workbench plugin.
 */
export function startPolling(pluginInstance: Workbench): void {
    // Ensure polling is enabled in settings
    if (!pluginInstance.settings.enablePolling) {
        console.log("Polling is disabled in settings.");
        return;
    }

    if (pluginInstance.pollingIntervalId !== null) {
        console.log("Polling already active.");
        return; // Already polling
    }
     // Clear any pending retry timeout if we are explicitly starting polling
    if (pluginInstance.pollingRetryTimeoutId) {
        clearTimeout(pluginInstance.pollingRetryTimeoutId);
        pluginInstance.pollingRetryTimeoutId = null;
        console.log("Cleared pending polling retry when starting polling.");
    }


    console.log(`Starting ComfyUI status polling every ${POLLING_INTERVAL_MS / 1000} seconds.`);
    // Perform an immediate poll first
    pollStatus(pluginInstance).catch(err => {
        console.warn("Initial poll in startPolling failed, retries will handle it.");
        // Error is already handled by pollStatus retry logic
    });
    // Then set the interval
    pluginInstance.pollingIntervalId = window.setInterval(() => {
        pollStatus(pluginInstance).catch(err => {
             console.warn("Scheduled poll failed, retries will handle it.");
             // Error is already handled by pollStatus retry logic
        });
    }, POLLING_INTERVAL_MS);
}

/**
 * Stops the polling interval and any pending retry timeouts.
 * @param pluginInstance The instance of the Workbench plugin.
 */
export function stopPolling(pluginInstance: Workbench): void {
    if (pluginInstance.pollingIntervalId !== null) {
        clearInterval(pluginInstance.pollingIntervalId);
        pluginInstance.pollingIntervalId = null;
        console.log("Stopped ComfyUI status polling interval.");
    }
     // Also clear any pending retry timeout
    if (pluginInstance.pollingRetryTimeoutId) {
        clearTimeout(pluginInstance.pollingRetryTimeoutId);
        pluginInstance.pollingRetryTimeoutId = null;
        console.log("Cleared pending polling retry timeout during stopPolling.");
    }
}