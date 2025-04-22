// Imports
// -------------------------
    import { Notice, requestUrl } from 'obsidian';
    import type Workbench from '../main';
    import { updateStatusBar } from '../ui/status_bar';
    import { startPolling, stopPolling, pollStatus } from './polling';
    import { ComfyApi } from '@saintno/comfyui-sdk'; // Still needed for actions
    import type { ComfyStatus, SystemStats, QueueInfo } from './types';

// --- Listener Handlers ---
    /** Parses system stats data received from the ComfyUI API.
     * Handles both standard and Crystools-enhanced structures.
     * @param pluginInstance The instance of the Workbench plugin.
     * @param stats The raw stats data object from the API.
     * @returns A structured SystemStats object or null if parsing fails.
     */
    function parseSystemStats(pluginInstance: Workbench, stats: any): SystemStats | null {
        // Basic validation of the input data.
        if (!stats || typeof stats !== 'object') {
            console.warn("Received invalid system stats data:", stats);
            return null;
        }

        try {
            // Check for Crystools structure first (more detailed).
            if (stats.hasOwnProperty('system') && stats.hasOwnProperty('devices') && Array.isArray(stats.devices)) {
                const systemInfo = stats.system;
                const devices = stats.devices;

                // Calculate RAM usage and utilization.
                const ram_total = systemInfo?.ram_total ?? 0;
                const ram_free = systemInfo?.ram_free ?? 0;
                const ram_used = ram_total > 0 ? ram_total - ram_free : 0;
                const ram_utilization = ram_total > 0 ? (ram_used / ram_total) * 100 : undefined;
                const cpu_utilization = systemInfo?.cpu_usage ?? undefined;

                // Map Crystools data to the SystemStats interface.
                const mappedStats: SystemStats = {
                    gpus: devices.filter((device: any) => device.type !== 'cpu').map((device: any) => ({
                        name: device.name || 'Unknown GPU',
                        type: device.type || 'Unknown',
                        index: device.index ?? -1,
                        vram_total: device.vram_total ?? 0,
                        vram_free: device.vram_free ?? 0,
                        vram_used: (device.vram_total ?? 0) - (device.vram_free ?? 0),
                        gpu_utilization: device.gpu_utilization ?? device.utilization ?? undefined, // Handle potential naming difference
                        memory_utilization: device.vram_utilization ?? undefined
                    })),
                    cpu_utilization: cpu_utilization,
                    ram_total: ram_total,
                    ram_used: ram_used,
                    ram_utilization: ram_utilization,
                };
                pluginInstance.latestSystemStats = mappedStats; // Update plugin state
                return mappedStats;
            } else {
                // Fallback to standard ComfyUI /system_stats structure.
                const standardStats = stats as any;
                const ram_total = standardStats.ram_total ?? 0;
                // Calculate RAM used if free is provided, otherwise use provided used value.
                const ram_used = standardStats.ram_used ?? (ram_total > 0 && standardStats.ram_free ? ram_total - standardStats.ram_free : undefined);
                // Calculate RAM utilization if possible.
                const ram_utilization = standardStats.ram_utilization ?? (ram_total > 0 && ram_used !== undefined ? (ram_used / ram_total) * 100 : undefined);
                const cpu_utilization = standardStats.cpu_utilization ?? undefined;

                // Map standard data to the SystemStats interface.
                const mappedStats = {
                cpu_utilization: cpu_utilization,
                ram_utilization: ram_utilization,
                ram_used: ram_used,
                ram_total: ram_total,
                gpus: standardStats.gpus?.map((gpu: any) => ({
                    name: gpu.name,
                    type: gpu.type ?? 'Unknown',
                    index: gpu.index ?? -1,
                    gpu_utilization: gpu.gpu_utilization ?? undefined,
                    // Handle different potential keys for VRAM usage/total.
                    vram_used: gpu.mem_used ?? gpu.vram_used ?? 0,
                    vram_total: gpu.mem_total ?? gpu.vram_total ?? 0,
                    vram_free: gpu.mem_free ?? gpu.vram_free ?? undefined,
                    memory_utilization: gpu.mem_utilization ?? gpu.vram_utilization ?? undefined
                })) ?? [] // Ensure gpus is always an array.
                } as SystemStats;
                pluginInstance.latestSystemStats = mappedStats; // Update plugin state
                return mappedStats;
            }
        } catch (error) {
            console.error("Error parsing system stats data:", error, stats);
            return null; // Return null on parsing error
        }
    }

    /** Handles progress events received from the ComfyUI SDK WebSocket.
     * Updates the plugin's progress state.
     * @param pluginInstance The instance of the Workbench plugin.
     * @param data The progress event data from the SDK.
     */
    function handleProgressEvent(pluginInstance: Workbench, data: any) {
        // Basic validation of the input data.
        if (!data || typeof data !== 'object') {
            console.warn("Received invalid progress event data:", data);
            return;
        }
        // console.log("Received progress event:", data); // Optional: Log for debugging

        // Update progress state on the plugin instance.
        pluginInstance.currentProgressValue = data.value ?? null;
        pluginInstance.currentProgressMax = data.max ?? null;

        // If progress reaches max, clear progress state after a short delay.
        // This prevents the progress bar from disappearing instantly if another job starts quickly.
        if (data.value !== null && data.max !== null && data.value >= data.max) {
            setTimeout(() => {
                // Double-check if the value is still max before clearing,
                // as another job might have started in the meantime.
                if (pluginInstance.currentProgressValue === pluginInstance.currentProgressMax) {
                    pluginInstance.currentProgressValue = null;
                    pluginInstance.currentProgressMax = null;
                    pluginInstance.currentRunningPromptId = null; // Also clear the prompt ID
                    // Status bar updates are primarily handled by polling, but could be triggered here if needed.
                    // updateStatusBar(pluginInstance, pluginInstance.currentComfyStatus);
                }
            }, 1000); // Delay of 1 second
        }
    }


// --- Connection Handling ---
    /** Handles the sequence of actions after a successful initial API connection check.
     * Instantiates the ComfyUI SDK, sets up listeners, and starts polling.
     * @param pluginInstance The instance of the Workbench plugin.
     * @param httpUrl The base HTTP URL of the ComfyUI API (e.g., http://127.0.0.1:8188).
     * @returns A promise resolving to true if the SDK setup and initial poll are successful (or if only the initial poll fails).
     */
    async function handleConnectionSuccess(pluginInstance: Workbench, httpUrl: string): Promise<boolean> {
        console.log('ComfyUI connection successful (API endpoint reachable).');
        new Notice('Successfully connected to ComfyUI API');

        // --- Instantiate ComfyApi for actions and WebSocket features ---
        try {
            // Clean up any previous SDK instance thoroughly before creating a new one.
            if (pluginInstance.comfyApi) {
                cleanupComfyApiInstance(pluginInstance);
            }

            console.log('Initializing ComfyUI SDK instance for actions/websockets...');
            const clientId = `obsidian-workbench-${Date.now()}`; // Unique client ID for WebSocket
            pluginInstance.comfyApi = new ComfyApi(httpUrl, clientId);

            // Add persistent listeners AFTER creating the instance.
            // These handle WebSocket closure and errors.
            pluginInstance.comfyApi.addEventListener('close', () => handleSdkClose(pluginInstance));
            pluginInstance.comfyApi.addEventListener('error', (errorEvent: any) => handleSdkError(pluginInstance, errorEvent));

            // Progress Listener setup via SDK.
            console.log("Subscribing to progress events via SDK.");
            pluginInstance.progressListener = (ev: CustomEvent<any>) => handleProgressEvent(pluginInstance, ev.detail);
            pluginInstance.comfyApi.addEventListener("progress", pluginInstance.progressListener as any);

            // Initiate the WebSocket connection via SDK's init().
            // This happens asynchronously. We don't await it here.
            // The connection status is primarily determined by polling initially.
            // Errors or closures during init will be caught by the 'error'/'close' listeners attached above.
            pluginInstance.comfyApi.init();
            console.log("ComfyUI SDK WebSocket initialization initiated.");
            /* // Removed incorrect promise handling: The SDK's init might not return a promise,
            // and relying on events ('close', 'error') is more robust.
            pluginInstance.comfyApi.init().then(() => { ... }).catch(initError => { ... });
            */

        } catch (sdkError: any) {
            console.error("Failed to instantiate or setup ComfyUI SDK:", sdkError);
            new Notice(`Failed to setup ComfyUI SDK: ${sdkError.message}`);
            // Don't necessarily disconnect entirely, as HTTP polling might still work for basic status.
            // Polling will eventually set the status to Error if it fails repeatedly.
            pluginInstance.comfyApi = null; // Ensure the SDK instance is null if instantiation failed.
        }

        // --- Start Polling ---
        try {
            // Perform an initial poll immediately to set the Ready/Busy state.
            await pollStatus(pluginInstance);
            pluginInstance.pollingRetryCount = 0; // Reset retry count after successful connection and initial poll.
            // Start regular polling interval if enabled in settings.
            if (pluginInstance.settings.enablePolling) {
                startPolling(pluginInstance);
            }
            return true; // Indicate overall connection success (API reachable).
        } catch (pollError) {
            console.error("Initial status poll failed after connection was established:", pollError);
            // The API endpoint was reachable, but the first status poll failed.
            // The status bar will be updated to 'Error' by pollStatus.
            // Resolve true because the core API check succeeded. Polling handles the ongoing error state.
            return true;
        }
    }

    /** Handles the sequence of actions when the initial API connection check fails.
     * Updates the status bar, cleans up resources, and stops polling.
     * @param pluginInstance The instance of the Workbench plugin.
     * @param reason A string describing the reason for the failure.
     * @param isInitialCheck Indicates if this failure occurred during the plugin's initial load check.
     * @param wasDisconnected Indicates if the status was 'Disconnected' before this check attempt started. // <-- Add this parameter description
     * @returns Always returns false to indicate connection failure.
     */
    function handleConnectionFailure(pluginInstance: Workbench, reason: string, isInitialCheck: boolean = false): boolean { // <-- Add wasDisconnected parameter
        // const wasConnecting = pluginInstance.currentComfyStatus === 'Connecting'; // This might be less reliable now, use wasDisconnected instead if needed.


        // Determine final status and whether to show notice
        let finalStatus: ComfyStatus = 'Error';
        let showNotice = !isInitialCheck; // Example: Show notice only if it wasn't already disconnected and not the initial check

        // Check for common network errors indicating the server is likely offline
        const connectionRefused = reason.includes('Connection refused') || reason.includes('Failed to fetch') || reason.includes('ECONNREFUSED');

        // Logging (already handled in the catch block for the specific wasDisconnected case)
        // You might adjust logging here based on the new parameter if needed.
        if (!(isInitialCheck && connectionRefused) && !connectionRefused) {
             // Avoid double logging the specific case handled in the catch block
            console.error(`ComfyUI connection failed: ${reason}`);
        }

        if ((isInitialCheck) && connectionRefused) {
            finalStatus = 'Disconnected';
            showNotice = false; // Don't show notice for expected initial failure or failure when already disconnected
            console.log(`Setting status to Disconnected due to connection failure (Initial: ${isInitialCheck}).`);
        } else {
            // For other errors (invalid URL, non-200 status, later connection refused), keep Error status
            finalStatus = 'Error';
            // Show notice only if it failed unexpectedly (not initial/disconnected refusal)
            showNotice = !((isInitialCheck) && connectionRefused);
        }


        if (showNotice) {
            new Notice(`ComfyUI connection failed: ${reason}`);
        }

        // Update the status bar to reflect the determined state.
        updateStatusBar(pluginInstance, finalStatus, `Connection failed: ${reason}`);

        // Clean up any existing SDK instance and associated listeners.
        cleanupComfyApiInstance(pluginInstance);

        // Stop polling if it was running or scheduled.
        stopPolling(pluginInstance);

        // Clear any potentially stale progress state.
        pluginInstance.currentRunningPromptId = null;
        pluginInstance.currentProgressValue = null;
        pluginInstance.currentProgressMax = null;

        pluginInstance.currentComfyStatus = finalStatus; // Set the final status *after* updating UI/logging
        return false; // Indicate connection failure
    }


// --- SDK Event Handlers (for established WebSocket connections) ---
    /** Handles the 'close' event from the ComfyUI SDK WebSocket.
     * Logs the event and cleans up the SDK instance. Polling determines the ongoing status.
     * @param pluginInstance The instance of the Workbench plugin.
     */
    function handleSdkClose(pluginInstance: Workbench) {
        console.warn("ComfyUI SDK WebSocket connection closed.");
        // Don't immediately set status to Disconnected. Polling will determine the actual server state.
        // If polling fails repeatedly after WS closure, it will set the status to Error.
        // The primary action here is to clean up the SDK instance and its specific listeners.
        cleanupComfyApiInstance(pluginInstance);
        // Polling might continue trying via HTTP if configured.
    }

    /** Handles the 'error' event from the ComfyUI SDK WebSocket.
     * Logs the error and cleans up the SDK instance. Polling determines the ongoing status.
     * @param pluginInstance The instance of the Workbench plugin.
     * @param errorEvent The error event object from the SDK.
     */
    function handleSdkError(pluginInstance: Workbench, errorEvent: any) {
        console.error("ComfyUI SDK WebSocket error:", errorEvent);
        // Similar to handleSdkClose, don't immediately change the overall status. Polling handles the state.
        // Clean up the SDK instance as the WebSocket connection is likely broken or unusable.
        cleanupComfyApiInstance(pluginInstance);
        // Polling might continue trying via HTTP if configured.
    }

    /** Helper function to safely clean up the ComfyUI SDK instance and its event listeners.
     * Removes listeners and attempts to close the WebSocket connection via the SDK.
     * @param pluginInstance The instance of the Workbench plugin.
     */
    function cleanupComfyApiInstance(pluginInstance: Workbench) {
        if (pluginInstance.comfyApi) {
            console.log("Cleaning up ComfyUI SDK instance and listeners...");
            try {
                // Remove specific listeners first to avoid potential issues during generic cleanup.
                if (pluginInstance.progressListener) {
                    pluginInstance.comfyApi.removeEventListener("progress", pluginInstance.progressListener as any);
                    pluginInstance.progressListener = null; // Clear the reference
                    console.log("Removed SDK progress listener.");
                }
                // Remove generic listeners added during setup.
                // Note: Depending on the SDK implementation, removing anonymous functions might require storing references.
                // Assuming simple removal works based on current usage.
                pluginInstance.comfyApi.removeEventListener('close', () => handleSdkClose(pluginInstance));
                pluginInstance.comfyApi.removeEventListener('error', (errorEvent: any) => handleSdkError(pluginInstance, errorEvent));

                // Use SDK's built-in cleanup methods if available.
                if (typeof (pluginInstance.comfyApi as any).close === 'function') {
                    (pluginInstance.comfyApi as any).close(); // Attempt to close the WebSocket connection.
                    console.log("Closed ComfyUI WebSocket connection via SDK close().");
                }
                // Fallback or additional cleanup: remove all listeners if the method exists.
                if (typeof (pluginInstance.comfyApi as any).removeAllListeners === 'function') {
                    (pluginInstance.comfyApi as any).removeAllListeners();
                    console.log("Removed all SDK listeners via removeAllListeners().");
                }
            } catch (e) {
                console.warn("Error during ComfyApi instance cleanup:", e);
            } finally {
                // Ensure the SDK instance and related listener references are nullified.
                pluginInstance.comfyApi = null;
                pluginInstance.systemMonitorListener = null; // Clear legacy listener reference if any.
                pluginInstance.progressListener = null; // Ensure progress listener reference is cleared.
                console.log("ComfyUI SDK instance set to null.");
            }
        }
    }


// --- Main Connection Check Function ---
    /** Checks the connection to the ComfyUI API endpoint.
     * Stops polling, cleans up previous connections, performs an HTTP check,
     * and then calls success or failure handlers.
     * @param pluginInstance The instance of the Workbench plugin.
     * @param isInitialCheck Indicates if this is the initial check during plugin load.
     * @returns A promise resolving to true if the API is reachable, false otherwise.
     */
    export async function checkComfyConnection(pluginInstance: Workbench, isInitialCheck: boolean = false): Promise<boolean> {
        // Avoid concurrent connection attempts if already connecting or launching.
            if (pluginInstance.currentComfyStatus === 'Connecting' || pluginInstance.currentComfyStatus === 'Launching') {
                console.log("Connection check skipped: Already connecting or launching.");
                return false;
            }
    
        // Stop any existing polling before attempting a new connection.
            stopPolling(pluginInstance);
        // Clean up any previous SDK instance *before* attempting a new connection.
            cleanupComfyApiInstance(pluginInstance);
    
        // Get and validate the API URL from settings.
            const apiUrlString = pluginInstance.settings.comfyApiUrl?.trim();
            if (!apiUrlString) {
                return handleConnectionFailure(pluginInstance, 'ComfyUI API URL is empty', isInitialCheck);
            }
    
            let httpUrl: string; // Base URL (e.g., http://127.0.0.1:8188)
            let checkUrl: string; // Specific endpoint for the check (e.g., /queue)

            try {
                const apiUrl = new URL(apiUrlString);
                httpUrl = apiUrl.origin; // Get the base origin (scheme + hostname + port).
                checkUrl = `${httpUrl}/queue`; // Use the /queue endpoint for a lightweight connection check.
                console.log(`Attempting connection check to: ${checkUrl}`);
            } catch (e) {
                // Handle cases where the URL string is invalid.
                return handleConnectionFailure(pluginInstance, 'Invalid ComfyUI API URL format', isInitialCheck);
            }

            const wasDisconnected = pluginInstance.currentComfyStatus === 'Disconnected'; // Check if it was previously disconnected
    
        // Reset polling retry count for the new connection attempt.
            pluginInstance.pollingRetryCount = 0;
        // Update status bar to indicate connection attempt.
            updateStatusBar(pluginInstance, 'Connecting', `Connecting to ${apiUrlString}...`);
            try {
                // Perform a simple GET request to the check endpoint using Obsidian's requestUrl.
                console.log(`Checking ComfyUI API connection at: ${checkUrl} with ${pluginInstance.currentComfyStatus}`);
                const response = await requestUrl({
                    url: checkUrl,
                    method: 'GET',
                    // Note: Obsidian's requestUrl doesn't have a direct timeout option.
                    // It relies on fetch defaults or system limits.
                    // For more control, an AbortController could be implemented.
                });

                // Check if the HTTP status code indicates success.
                if (response.status === 200) {
                    // Call the success handler, which will proceed with SDK setup and polling.
                    return await handleConnectionSuccess(pluginInstance, httpUrl);
                } else {
                    // Handle non-200 status codes as connection failures.
                    // Pass wasDisconnected status to the failure handler
                    return handleConnectionFailure(pluginInstance, `API check failed (Status: ${response.status})`, isInitialCheck);
                }
            } catch (error: any) {
                // Handle network errors (e.g., DNS resolution failure, server unreachable).
                let reason = 'Network error';
                if (error.message) {
                    reason += `: ${error.message}`;
                }
                // Provide more specific feedback for common network issues.
                const isConnectionRefused = error.message?.includes('ERR_CONNECTION_REFUSED') || error.message?.includes('Failed to fetch');
                if (isConnectionRefused) {
                    reason = 'Connection refused (Server offline?)';
                }

                // *** MODIFIED SECTION START ***
                // This is the expected state on startup if the server isn't running.
                if (isConnectionRefused) {
                    console.log(`Connection check failed while previously disconnected (server likely offline): ${reason}`);
                    // Keep the Disconnected status, update tooltip appropriately.
                    updateStatusBar(pluginInstance, 'Disconnected', 'Server offline');
                    // Ensure SDK is cleaned up (might have been attempted if logic flow was different)
                    cleanupComfyApiInstance(pluginInstance);
                    // Stop polling just in case it was somehow started
                    stopPolling(pluginInstance);
                     // Set final status explicitly
                    pluginInstance.currentComfyStatus = 'Disconnected';
                    return false; // Indicate connection failure, but handled as expected state
                }
                // *** MODIFIED SECTION END ***


                // Avoid logging an error to the console if it's the initial check and just a connection refusal.
                // This handles cases where it wasn't previously disconnected but failed initially.
                if (isInitialCheck && isConnectionRefused) {
                    console.log(`Initial connection check failed: ${reason}`); // Log as info instead of error
                } else {
                    // Log other errors normally (e.g., network errors when previously connected, other error types)
                    console.error(`Network error during connection check: ${reason}`, error);
                }

                // Pass wasDisconnected status to the general failure handler for other error types
                return handleConnectionFailure(pluginInstance, reason, isInitialCheck);
            }
        }


// --- Data Fetching Functions (using direct API calls via requestUrl) ---
    /** Fetches system stats directly from the ComfyUI /system_stats endpoint using requestUrl.
     * Parses the response using `parseSystemStats`.
     * @param pluginInstance The instance of the Workbench plugin.
     * @returns A promise resolving to the parsed SystemStats object, the last known stats on fetch error, or null if URL is invalid or parsing fails.
     */
    export async function fetchSystemStats(pluginInstance: Workbench): Promise<SystemStats | null> {
        // Get and validate the API URL.
        const apiUrlString = pluginInstance.settings.comfyApiUrl?.trim();
        if (!apiUrlString) {
            console.warn("Cannot fetch system stats: ComfyUI API URL is not set.");
            pluginInstance.latestSystemStats = null; // Clear stats if URL is missing.
            return null;
        }

        let statsUrl: string;
        try {
            const apiUrl = new URL(apiUrlString);
            statsUrl = `${apiUrl.origin}/system_stats`; // Construct the full URL for the endpoint.
        } catch (e) {
            console.error("Invalid ComfyUI API URL format for fetching system stats.");
            pluginInstance.latestSystemStats = null; // Clear stats on URL format error.
            return null;
        }

        try {
            // console.log(`Fetching system stats from: ${statsUrl}`); // Debug log
            const response = await requestUrl({ url: statsUrl, method: 'GET' });

            if (response.status === 200) {
                const statsData = response.json; // Get the JSON payload.
                // console.log("Raw system_stats data:", statsData); // Debug log
                const parsedStats = parseSystemStats(pluginInstance, statsData); // Use the parsing helper.
                if (parsedStats) {
                    // console.log("Parsed system stats:", parsedStats); // Debug log
                    return parsedStats; // Return the successfully parsed stats.
                } else {
                    console.warn("Failed to parse system stats data received from API.");
                    // Decide whether to keep last known stats or clear them on parse failure. Clearing for now.
                    pluginInstance.latestSystemStats = null;
                    return null;
                }
            } else {
                // Handle non-200 status codes during fetch.
                console.warn(`Failed to fetch system stats: Status ${response.status}`);
                // Don't clear stats on a temporary fetch error; return the last known good state.
                return pluginInstance.latestSystemStats;
            }
        } catch (error) {
            // Handle network errors during fetch.
            console.error("Error fetching system stats via requestUrl:", error);
            // Don't clear stats on a network error; return the last known good state.
            return pluginInstance.latestSystemStats;
        }
    }

    /** Fetches queue information directly from the ComfyUI /queue endpoint using requestUrl.
     * @param pluginInstance The instance of the Workbench plugin.
     * @returns A promise resolving to a QueueInfo object or null if the fetch fails or the URL is invalid.
     */
    export async function fetchQueueInfo(pluginInstance: Workbench): Promise<QueueInfo | null> {
        // Get and validate the API URL.
        const apiUrlString = pluginInstance.settings.comfyApiUrl?.trim();
        if (!apiUrlString) {
            console.warn("Cannot fetch queue info: ComfyUI API URL is not set.");
            return null;
        }

        let queueUrl: string;
        try {
            const apiUrl = new URL(apiUrlString);
            queueUrl = `${apiUrl.origin}/queue`; // Construct the full URL for the endpoint.
        } catch (e) {
            console.error("Invalid ComfyUI API URL format for fetching queue info.");
            return null;
        }

        try {
            // console.log(`Fetching queue info from: ${queueUrl}`); // Debug log
            const response = await requestUrl({ url: queueUrl, method: 'GET' });

            if (response.status === 200) {
                const queueData = response.json; // Get the JSON payload.
                // console.log("Raw queue data:", queueData); // Debug log
                // Basic validation of the received data structure.
                if (queueData && typeof queueData === 'object') {
                    // Map the relevant fields to the QueueInfo interface.
                    return {
                        queue_running: queueData.queue_running || [], // Default to empty array if missing.
                        queue_pending: queueData.queue_pending || []  // Default to empty array if missing.
                    } as QueueInfo;
                } else {
                    console.warn("Received invalid queue info data:", queueData);
                    return null; // Return null if data structure is unexpected.
                }
            } else {
                // Handle non-200 status codes during fetch.
                console.warn(`Failed to fetch queue info: Status ${response.status}`);
                return null; // Return null on non-200 status.
            }
        } catch (error) {
            // Handle network errors during fetch.
            console.error("Error fetching queue info via requestUrl:", error);
            return null; // Return null on network error.
        }
    }

// --- Workflow Execution (Uses ComfyUI SDK) ---
    /** Runs a workflow by sending it to the ComfyUI API via the SDK's queuePrompt method.
     * Updates the plugin's progress state and status bar.
     * @param pluginInstance The instance of the Workbench plugin.
     * @param workflowData The workflow data object (typically parsed from a JSON file).
     * @throws An error if the SDK is not available, the connection status is not Ready/Busy, or if the API call fails.
     */
    export async function runWorkflow(pluginInstance: Workbench, workflowData: any): Promise<void> {
        // --- Pre-flight Checks ---
        // 1. Check if the SDK instance exists.
        if (!pluginInstance.comfyApi) {
            updateStatusBar(pluginInstance, pluginInstance.currentComfyStatus, "ComfyUI SDK not available");
            throw new Error("ComfyUI SDK is not available. Cannot run workflow.");
        }
        // 2. Check if the connection status (determined by polling) indicates the server is ready or busy.
        //    This prevents trying to queue a workflow if the server is disconnected, in an error state, etc.
        if (pluginInstance.currentComfyStatus !== 'Ready' && pluginInstance.currentComfyStatus !== 'Busy') {
            updateStatusBar(pluginInstance, pluginInstance.currentComfyStatus, `ComfyUI not ready (${pluginInstance.currentComfyStatus})`);
            throw new Error(`ComfyUI is not ready (Status: ${pluginInstance.currentComfyStatus}). Cannot run workflow.`);
        }

        // --- Execute Workflow ---
        try {
            // Reset progress state before starting a new workflow.
            pluginInstance.currentRunningPromptId = null;
            pluginInstance.currentProgressValue = null;
            pluginInstance.currentProgressMax = null;

            console.log("Attempting to queue prompt via SDK...");
            // Call the SDK's queuePrompt method.
            const result = await pluginInstance.comfyApi.queuePrompt(workflowData, {});
            const promptId = result?.prompt_id; // Extract the prompt ID from the result.

            if (promptId) {
                console.log(`Workflow queued with Prompt ID: ${promptId}`);
                pluginInstance.currentRunningPromptId = promptId; // Store the running prompt ID for progress tracking.
                // Status bar will update automatically via polling or progress events from the WebSocket.
                new Notice(`Workflow started (ID: ${promptId})`);
                // Optional: Manually trigger a poll shortly after queuing to potentially update status faster.
                // setTimeout(() => pollStatus(pluginInstance), 500);
            } else {
                // Handle cases where the API call succeeded but didn't return a prompt ID.
                console.warn("queuePrompt did not return a prompt_id.", result);
                new Notice("Workflow queued, but failed to get Prompt ID.");
                // Update status bar to indicate potential issue or just let polling handle it.
                updateStatusBar(pluginInstance, 'Ready', 'Workflow queued (no ID)');
            }
        } catch (error) {
            // Handle errors during the SDK call (e.g., network issues, API errors).
            console.error("Error running workflow via SDK:", error);
            // Reset progress state on error.
            pluginInstance.currentRunningPromptId = null;
            pluginInstance.currentProgressValue = null;
            pluginInstance.currentProgressMax = null;
            // Update status bar to reflect the execution failure.
            updateStatusBar(pluginInstance, 'Error', 'Workflow execution failed');
            // Re-throw the error so the calling function (e.g., in main.ts) can handle it (e.g., show a more specific notice).
            throw error;
        }
    }