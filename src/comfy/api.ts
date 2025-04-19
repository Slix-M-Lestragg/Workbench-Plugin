import { Notice, requestUrl } from 'obsidian';
import type Workbench from '../main';
import { updateStatusBar } from '../ui/status_bar';
import { startPolling, stopPolling, pollStatus } from './polling';
import { ComfyApi } from '@saintno/comfyui-sdk';
import type { SystemStats, QueueInfo } from './types'; // Import the types

export function checkComfyConnection(pluginInstance: Workbench): Promise<boolean> {
    // Return a promise that resolves/rejects based on connection success/failure
    return new Promise(async (resolve) => { // Removed unused 'reject' parameter
        let connectionTimeoutId: number | null = null; // Declare here

        // Prevent multiple simultaneous checks
        if (pluginInstance.currentComfyStatus === 'Connecting' || pluginInstance.currentComfyStatus === 'Launching') {
            console.log("Connection check skipped: Already connecting or launching.");
            resolve(false); // Resolve with false as no new connection was established by this call
            return;
        }

        stopPolling(pluginInstance); // Stop any existing polling

        // Clean up previous SDK instance if it exists
        if (pluginInstance.comfyApi) {
            try {
                 // Attempt to close WebSocket if SDK provides a method
                 if (typeof (pluginInstance.comfyApi as any).close === 'function') {
                     (pluginInstance.comfyApi as any).close();
                     console.log("Closed previous ComfyUI WebSocket connection.");
                 }
            } catch (e) {
                console.warn("Error closing previous ComfyApi connection:", e);
            } finally {
                 pluginInstance.comfyApi = null; // Ensure it's nullified
            }
        }

        const apiUrlString = pluginInstance.settings.comfyApiUrl?.trim();

        if (!apiUrlString) {
            new Notice('ComfyUI API URL is empty. Please configure it.');
            console.error('ComfyUI API URL is empty');
            updateStatusBar(pluginInstance, 'Error', 'ComfyUI API URL is empty');
            resolve(false);
            return;
        }

        let apiUrl: URL;
        let wsUrl: string; // WebSocket URL
        let httpUrl: string; // HTTP URL
        try {
            apiUrl = new URL(apiUrlString);
            // Construct WebSocket URL (ws:// or wss://)
            const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            // Include hostname and port (if specified)
            wsUrl = `${wsProtocol}//${apiUrl.hostname}${apiUrl.port ? ':' + apiUrl.port : ''}/ws`; // Standard /ws path
            httpUrl = apiUrl.origin; // Use the origin (scheme + hostname + port) for HTTP calls

            console.log(`Derived WebSocket URL: ${wsUrl}`);
            console.log(`Derived HTTP URL: ${httpUrl}`); // Log the HTTP URL
        } catch (e) {
            new Notice('Invalid ComfyUI API URL format.');
            console.error('Invalid ComfyUI API URL format:', e);
            updateStatusBar(pluginInstance, 'Error', 'Invalid ComfyUI API URL');
            resolve(false);
            return;
        }

        // Reset retry count and timeout
        pluginInstance.pollingRetryCount = 0;
        // No need to clear pollingRetryTimeoutId here, stopPolling already does

        updateStatusBar(pluginInstance, 'Connecting', `Connecting to ${apiUrlString}...`);

        // --- Connection Logic ---
        let initialCheckCompleted = false; // Flag to prevent race conditions and double resolution

        const cleanupConnectionAttempt = () => {
            if (connectionTimeoutId) clearTimeout(connectionTimeoutId);
            connectionTimeoutId = null;
            if (pluginInstance.comfyApi) {
                // Remove listeners specific to the connection attempt
                try {
                    pluginInstance.comfyApi.removeEventListener('ready', onReady);
                    pluginInstance.comfyApi.removeEventListener('error', onError);
                    pluginInstance.comfyApi.removeEventListener('close', onClose);
                } catch(listenerError) {
                    console.warn("Error removing connection event listeners:", listenerError);
                }
            }
        };

        // Define success handler
        const handleConnectionSuccess = async () => {
            if (initialCheckCompleted) return; // Already handled
            initialCheckCompleted = true;
            cleanupConnectionAttempt();
            console.log('ComfyUI connection successful (WebSocket ready or initial poll succeeded).');
            new Notice('Successfully connected to ComfyUI API');

            // Connection is up, now determine Ready/Busy state via pollStatus
            try {
                await pollStatus(pluginInstance); // Updates status bar internally
                // If pollStatus succeeded, status is now Ready or Busy
                pluginInstance.pollingRetryCount = 0; // Reset retries on successful connection & poll
                if (pluginInstance.settings.enablePolling) {
                    startPolling(pluginInstance);
                }
                resolve(true); // Resolve true: connection established and initial status checked
            } catch (pollError) {
                // pollStatus failed, status bar is likely 'Error' due to pollStatus internal logic
                console.error("Initial status poll failed after connection was established:", pollError);
                // Resolve true because the WebSocket connection itself succeeded,
                // but polling will handle the error state.
                resolve(true);
            }
        };

        // Define failure handler
        const handleConnectionFailure = (reason: string) => {
            if (initialCheckCompleted) return; // Already handled
            initialCheckCompleted = true;
            cleanupConnectionAttempt();
            console.error(`ComfyUI connection failed: ${reason}`);
            new Notice(`ComfyUI connection failed: ${reason}`);
            updateStatusBar(pluginInstance, 'Error', `Connection failed: ${reason}`);
            // Clean up the potentially partially connected SDK instance
            if (pluginInstance.comfyApi) {
                 try {
                     if (typeof (pluginInstance.comfyApi as any).close === 'function') {
                         (pluginInstance.comfyApi as any).close();
                     }
                 } catch (e) { /* Ignore */ }
                 pluginInstance.comfyApi = null;
            }
            resolve(false); // Resolve false: connection failed
        };

        // SDK Event Handlers
        const onReady = async () => {
            console.log(">>> SDK 'ready' event received!");
            await handleConnectionSuccess();
        };

        const onError = (errorEvent: Event | Error) => {
            console.log(">>> SDK 'error' event received!", errorEvent);
            const errorMessage = errorEvent instanceof Error ? errorEvent.message : 'WebSocket error';
            handleConnectionFailure(errorMessage);
        };

        const onClose = (closeEvent?: any) => {
             console.log(">>> SDK 'close' event received!", closeEvent);
             // Only treat 'close' as a failure if it happens *during* the initial 'Connecting' phase
             if (!initialCheckCompleted && pluginInstance.currentComfyStatus === 'Connecting') {
                const reason = closeEvent?.reason || 'WebSocket closed unexpectedly';
                handleConnectionFailure(reason);
             } else if (initialCheckCompleted && pluginInstance.currentComfyStatus !== 'Disconnected') {
                 // Handle closures *after* successful connection (e.g., server restart)
                 console.log("ComfyUI SDK connection closed after successful connection.");
                 updateStatusBar(pluginInstance, 'Disconnected', 'Connection closed');
                 pluginInstance.currentComfyStatus = 'Disconnected';
                 pluginInstance.comfyApi = null;
                 stopPolling(pluginInstance);
             }
        };

        try {
            // Step 1: Quick HTTP check
            console.log(`Attempting initial HTTP check to ${httpUrl}/system_stats`);
            const response = await requestUrl({
                url: `${httpUrl}/system_stats`,
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                throw: false // Handle errors manually
            });
            console.log(`HTTP check status: ${response.status}`);
            if (response.status !== 200) {
                handleConnectionFailure(`HTTP check failed (Status: ${response.status})`);
                return; // Exit promise execution
            }

            console.log('HTTP check successful. Initializing ComfyUI SDK instance...');

            // Step 2: Instantiate SDK with HTTP URL and Add Listeners
            pluginInstance.comfyApi = new ComfyApi(httpUrl);
            console.log('ComfyUI SDK instance created. Adding event listeners...');
            pluginInstance.comfyApi.addEventListener('ready', onReady);
            pluginInstance.comfyApi.addEventListener('error', onError);
            pluginInstance.comfyApi.addEventListener('close', onClose);
            console.log('Event listeners added.');

            // Step 3: Attempt initial poll immediately
            console.log('Attempting initial status poll immediately after SDK setup...');
            try {
                // Use pollStatus. If it succeeds, connection is established.
                await pollStatus(pluginInstance);
                // If pollStatus didn't throw, it means the API is responsive.
                console.log('Initial poll successful.');
                await handleConnectionSuccess(); // Treat as successful connection
                return; // Exit promise execution, already resolved in handleConnectionSuccess

            } catch (pollError: any) {
                 console.warn('Initial status poll failed:', pollError.message || pollError);
                 // Update status bar to reflect the poll failure, but continue waiting for SDK events/timeout.
                 // pollStatus itself might have set the status to Error.
                 if (pluginInstance.currentComfyStatus !== 'Error') {
                    updateStatusBar(pluginInstance, 'Error', `Initial poll failed`);
                 }
                 // Do NOT resolve or fail here. Let the WebSocket connection proceed or time out.
                 // The SDK might still establish the 'ready' state.
            }

            // Step 4: Set connection timeout (only relevant if initial poll failed)
            console.log('Setting connection timeout...');
            connectionTimeoutId = window.setTimeout(() => {
                // Check initialCheckCompleted flag to prevent race conditions
                if (!initialCheckCompleted) {
                     handleConnectionFailure('Connection timed out');
                }
            }, 30000); // 30-second timeout

            console.log('Connection timeout set. Waiting for SDK events or timeout...');

        } catch (error: any) { // Catch errors during HTTP check or ComfyApi instantiation
            handleConnectionFailure(error.message || 'Unknown setup error');
        }
    }); // End of Promise constructor
}

/**
 * Fetches system stats from the ComfyUI API.
 * @param pluginInstance The instance of the Workbench plugin.
 * @returns A promise resolving to SystemStats or null if failed.
 */
export async function fetchSystemStats(pluginInstance: Workbench): Promise<SystemStats | null> {
    if (!pluginInstance.comfyApi) {
        console.warn("fetchSystemStats called but comfyApi is not initialized.");
        return null;
    }
    try {
        // Assuming the SDK has a method getSystemStats()
        // If not, you might need to use requestUrl directly:
        // const response = await requestUrl({ url: `${pluginInstance.settings.comfyApiUrl}/system_stats`, method: 'GET' });
        // if (response.status === 200) return response.json as SystemStats;
        // else throw new Error(`Failed to fetch system stats: ${response.status}`);

        const stats = await pluginInstance.comfyApi.getSystemStats();
        return stats as SystemStats; // Cast or validate the response structure
    } catch (error) {
        console.error("Error fetching system stats:", error);
        // Optionally update status bar or show notice on specific errors
        return null;
    }
}

/**
 * Fetches queue information from the ComfyUI API.
 * @param pluginInstance The instance of the Workbench plugin.
 * @returns A promise resolving to QueueInfo or null if failed.
 */
export async function fetchQueueInfo(pluginInstance: Workbench): Promise<QueueInfo | null> {
    if (!pluginInstance.comfyApi) {
        console.warn("fetchQueueInfo called but comfyApi is not initialized.");
        return null;
    }
    try {
        // Assuming the SDK has a method getQueue()
        // If not, use requestUrl:
        // const response = await requestUrl({ url: `${pluginInstance.settings.comfyApiUrl}/queue`, method: 'GET' });
        // if (response.status === 200) return response.json as QueueInfo;
        // else throw new Error(`Failed to fetch queue info: ${response.status}`);

        const queueData = await pluginInstance.comfyApi.getQueue();
        // The SDK might return a different structure, adapt as needed.
        // Example structure assumed here based on modal usage:
        return {
            queue_running: queueData.queue_running || [],
            queue_pending: queueData.queue_pending || []
        } as QueueInfo;
    } catch (error) {
        console.error("Error fetching queue info:", error);
        return null;
    }
}