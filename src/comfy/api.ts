import { Notice, requestUrl } from 'obsidian';
import type Workbench from '../main';
import { updateStatusBar } from '../ui/status_bar';
import { startPolling, stopPolling, pollStatus } from './polling';
import { ComfyApi } from '@saintno/comfyui-sdk'; // Still needed for actions
import type { SystemStats, QueueInfo } from './types';

// --- Listener Handlers (Remain largely the same, but attached differently ---

// Define the handler for system monitor events (Now primarily used if fetched via /system_stats)
function parseSystemStats(pluginInstance: Workbench, stats: any): SystemStats | null {
    if (!stats || typeof stats !== 'object') {
        console.warn("Received invalid system stats data:", stats);
        return null;
    }

    try {
        // Check for Crystools structure first
        if (stats.hasOwnProperty('system') && stats.hasOwnProperty('devices') && Array.isArray(stats.devices)) {
            const systemInfo = stats.system;
            const devices = stats.devices;

            const ram_total = systemInfo?.ram_total ?? 0;
            const ram_free = systemInfo?.ram_free ?? 0;
            const ram_used = ram_total > 0 ? ram_total - ram_free : 0;
            const ram_utilization = ram_total > 0 ? (ram_used / ram_total) * 100 : undefined;
            const cpu_utilization = systemInfo?.cpu_usage ?? undefined;

            const mappedStats: SystemStats = {
                gpus: devices.filter((device: any) => device.type !== 'cpu').map((device: any) => ({
                    name: device.name || 'Unknown GPU',
                    type: device.type || 'Unknown',
                    index: device.index ?? -1,
                    vram_total: device.vram_total ?? 0,
                    vram_free: device.vram_free ?? 0,
                    vram_used: (device.vram_total ?? 0) - (device.vram_free ?? 0),
                    gpu_utilization: device.gpu_utilization ?? device.utilization ?? undefined,
                    memory_utilization: device.vram_utilization ?? undefined
                })),
                cpu_utilization: cpu_utilization,
                ram_total: ram_total,
                ram_used: ram_used,
                ram_utilization: ram_utilization,
            };
            pluginInstance.latestSystemStats = mappedStats;
            return mappedStats;
        } else {
            // Standard structure fallback
            const standardStats = stats as any;
            const ram_total = standardStats.ram_total ?? 0;
            const ram_used = standardStats.ram_used ?? (ram_total > 0 && standardStats.ram_free ? ram_total - standardStats.ram_free : undefined);
            const ram_utilization = standardStats.ram_utilization ?? (ram_total > 0 && ram_used !== undefined ? (ram_used / ram_total) * 100 : undefined);
            const cpu_utilization = standardStats.cpu_utilization ?? undefined;

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
                   vram_used: gpu.mem_used ?? gpu.vram_used ?? 0,
                   vram_total: gpu.mem_total ?? gpu.vram_total ?? 0,
                   vram_free: gpu.mem_free ?? gpu.vram_free ?? undefined,
                   memory_utilization: gpu.mem_utilization ?? gpu.vram_utilization ?? undefined
               })) ?? []
            } as SystemStats;
            pluginInstance.latestSystemStats = mappedStats;
            return mappedStats;
        }
    } catch (error) {
        console.error("Error parsing system stats data:", error, stats);
        return null; // Return null on parsing error
    }
}


// Define the handler for progress events (Remains the same, attached via SDK instance if created)
function handleProgressEvent(pluginInstance: Workbench, data: any) {
    if (!data || typeof data !== 'object') {
        console.warn("Received invalid progress event data:", data);
        return;
    }
    // console.log("Received progress event:", data); // Optional: Log for debugging

    // Update progress state on the plugin instance
    pluginInstance.currentProgressValue = data.value ?? null;
    pluginInstance.currentProgressMax = data.max ?? null;

    // If progress reaches max, clear progress state after a short delay
    // This prevents the bar from disappearing instantly
    if (data.value !== null && data.max !== null && data.value >= data.max) {
        setTimeout(() => {
            // Check if the value is still max before clearing, another job might have started
            if (pluginInstance.currentProgressValue === pluginInstance.currentProgressMax) {
                pluginInstance.currentProgressValue = null;
                pluginInstance.currentProgressMax = null;
                pluginInstance.currentRunningPromptId = null; // Also clear the prompt ID
                // Optionally trigger a status bar update if needed, though polling should handle it
                // updateStatusBar(pluginInstance, pluginInstance.currentComfyStatus);
            }
        }, 1000); // Delay of 1 second
    }
}

// --- Connection Handling ---

// Function to handle successful connection (called after successful fetch)
async function handleConnectionSuccess(pluginInstance: Workbench, httpUrl: string) {
    console.log('ComfyUI connection successful (API endpoint reachable).');
    new Notice('Successfully connected to ComfyUI API');

    // --- Instantiate ComfyApi for actions and WebSocket features ---
    try {
        // Clean up any previous instance thoroughly before creating a new one
        if (pluginInstance.comfyApi) {
            cleanupComfyApiInstance(pluginInstance);
        }

        console.log('Initializing ComfyUI SDK instance for actions/websockets...');
        const clientId = `obsidian-workbench-${Date.now()}`;
        pluginInstance.comfyApi = new ComfyApi(httpUrl, clientId);

        // Add persistent listeners AFTER creating the instance
        pluginInstance.comfyApi.addEventListener('close', () => handleSdkClose(pluginInstance));
        pluginInstance.comfyApi.addEventListener('error', (errorEvent: any) => handleSdkError(pluginInstance, errorEvent));

        // Progress Listener
        console.log("Subscribing to progress events via SDK.");
        pluginInstance.progressListener = (ev: CustomEvent<any>) => handleProgressEvent(pluginInstance, ev.detail);
        pluginInstance.comfyApi.addEventListener("progress", pluginInstance.progressListener as any);

        // Initiate the WebSocket connection via SDK's init()
        // We don't await this here; status is determined by polling initially.
        // Errors/closure during init will be caught by the 'error'/'close' listeners.
        // Remove .then() and .catch() as init likely doesn't return a promise directly,
        // rely on event listeners instead.
        pluginInstance.comfyApi.init();
        console.log("ComfyUI SDK WebSocket initialization initiated.");
        /* // Removed incorrect promise handling:
        pluginInstance.comfyApi.init().then(() => {
             console.log("ComfyUI SDK WebSocket initialized successfully.");
             // SDK is ready for actions like runWorkflow
        }).catch(initError => {
             console.error("ComfyUI SDK WebSocket initialization failed:", initError);
             // Don't necessarily disconnect here, HTTP polling might still work.
             // Status bar should reflect the error state from polling failures if WS fails.
             // We might want to nullify comfyApi here if WS is critical for core features.
             // cleanupComfyApiInstance(pluginInstance); // Option: Clean up if WS init fails
        });
        */

    } catch (sdkError: any) {
        console.error("Failed to instantiate or setup ComfyUI SDK:", sdkError);
        new Notice(`Failed to setup ComfyUI SDK: ${sdkError.message}`);
        // Don't necessarily disconnect, polling might still work.
        // Update status bar to reflect potential issue? Polling will set Error state if it fails.
        pluginInstance.comfyApi = null; // Ensure it's null if instantiation failed
    }

    // --- Start Polling ---
    try {
        // Perform initial poll to set Ready/Busy state
        await pollStatus(pluginInstance);
        pluginInstance.pollingRetryCount = 0; // Reset retries after successful connection and initial poll
        if (pluginInstance.settings.enablePolling) {
            startPolling(pluginInstance); // Start regular polling interval
        }
        return true; // Indicate connection success
    } catch (pollError) {
        console.error("Initial status poll failed after connection was established:", pollError);
        // Connection succeeded, but polling failed. Status bar updated by pollStatus.
        // Resolve true because the API endpoint was reachable. Polling handles the error state.
        return true;
    }
}

// Function to handle connection failure (called after failed fetch or invalid URL)
function handleConnectionFailure(pluginInstance: Workbench, reason: string) {
    const wasConnecting = pluginInstance.currentComfyStatus === 'Connecting';
    console.error(`ComfyUI connection failed: ${reason}`);
    if (wasConnecting) { // Only show notice if it failed during initial connection attempt
         new Notice(`ComfyUI connection failed: ${reason}`);
    }
    updateStatusBar(pluginInstance, 'Error', `Connection failed: ${reason}`);

    // Clean up SDK instance and listeners if they exist
    cleanupComfyApiInstance(pluginInstance);

    // Stop polling if it was running
    stopPolling(pluginInstance);

    // Clear progress state
    pluginInstance.currentRunningPromptId = null;
    pluginInstance.currentProgressValue = null;
    pluginInstance.currentProgressMax = null;

    return false; // Indicate connection failure
}

// --- SDK Event Handlers (for established connections) ---

function handleSdkClose(pluginInstance: Workbench) {
    console.warn("ComfyUI SDK WebSocket connection closed.");
    // Don't immediately set to Disconnected. Polling will determine the actual state.
    // If polling fails repeatedly, it will set the status to Error.
    // We only need to clean up the SDK instance and its specific listeners.
    cleanupComfyApiInstance(pluginInstance); // Clean up listeners and instance
    // Polling might continue trying via HTTP.
}

function handleSdkError(pluginInstance: Workbench, errorEvent: any) {
    console.error("ComfyUI SDK WebSocket error:", errorEvent);
    // Similar to handleSdkClose, don't immediately change status. Polling handles state.
    // Clean up the SDK instance as the WebSocket connection is likely broken.
    cleanupComfyApiInstance(pluginInstance);
    // Polling might continue trying via HTTP.
}

// Helper to clean up ComfyApi instance and listeners
function cleanupComfyApiInstance(pluginInstance: Workbench) {
    if (pluginInstance.comfyApi) {
        console.log("Cleaning up ComfyUI SDK instance and listeners...");
        try {
            // Remove specific listeners first
            if (pluginInstance.progressListener) {
                pluginInstance.comfyApi.removeEventListener("progress", pluginInstance.progressListener as any);
                pluginInstance.progressListener = null;
                console.log("Removed SDK progress listener.");
            }
            // Remove generic listeners added during setup
            pluginInstance.comfyApi.removeEventListener('close', () => handleSdkClose(pluginInstance)); // Might need reference equality? Check SDK docs. Assume simple removal works.
            pluginInstance.comfyApi.removeEventListener('error', (errorEvent: any) => handleSdkError(pluginInstance, errorEvent));

            // Use SDK's built-in cleanup if available
            if (typeof (pluginInstance.comfyApi as any).close === 'function') {
                (pluginInstance.comfyApi as any).close(); // Close WebSocket if open
                console.log("Closed ComfyUI WebSocket connection via SDK close().");
            }
            if (typeof (pluginInstance.comfyApi as any).removeAllListeners === 'function') {
                (pluginInstance.comfyApi as any).removeAllListeners(); // Fallback if specific removal fails
                 console.log("Removed all SDK listeners via removeAllListeners().");
            }
        } catch (e) {
            console.warn("Error during ComfyApi instance cleanup:", e);
        } finally {
            pluginInstance.comfyApi = null;
            pluginInstance.systemMonitorListener = null; // Ensure this is cleared too (though not used by SDK directly now)
            pluginInstance.progressListener = null; // Ensure cleared
            console.log("ComfyUI SDK instance set to null.");
        }
    }
}


// --- Main Connection Check Function ---

export async function checkComfyConnection(pluginInstance: Workbench): Promise<boolean> {
    if (pluginInstance.currentComfyStatus === 'Connecting' || pluginInstance.currentComfyStatus === 'Launching') {
        console.log("Connection check skipped: Already connecting or launching.");
        return false;
    }

    // Stop any existing polling before attempting connection
    stopPolling(pluginInstance);
    // Clean up any previous SDK instance *before* attempting a new connection
    cleanupComfyApiInstance(pluginInstance);

    const apiUrlString = pluginInstance.settings.comfyApiUrl?.trim();
    if (!apiUrlString) {
        return handleConnectionFailure(pluginInstance, 'ComfyUI API URL is empty');
    }

    let httpUrl: string;
    let checkUrl: string;
    try {
        const apiUrl = new URL(apiUrlString);
        // Ensure trailing slash for consistency if needed, though URL object handles base path well
        httpUrl = apiUrl.origin; // Base URL like http://127.0.0.1:8188
        checkUrl = `${httpUrl}/queue`; // Use /queue endpoint for the check
        console.log(`Attempting connection check to: ${checkUrl}`);
    } catch (e) {
        return handleConnectionFailure(pluginInstance, 'Invalid ComfyUI API URL format');
    }

    pluginInstance.pollingRetryCount = 0; // Reset retries for the new attempt
    updateStatusBar(pluginInstance, 'Connecting', `Connecting to ${apiUrlString}...`);

    try {
        // Perform a simple GET request to a known endpoint
        const response = await requestUrl({
            url: checkUrl,
            method: 'GET',
            // Set a reasonable timeout for the connection check itself
            // Obsidian's requestUrl doesn't have a direct timeout, relies on fetch defaults/system limits
            // Consider adding an AbortController if long delays are an issue
        });

        if (response.status === 200) {
            // Call success handler, which will then try to init SDK and start polling
            return await handleConnectionSuccess(pluginInstance, httpUrl);
        } else {
            // Handle non-200 status codes as connection failures
            return handleConnectionFailure(pluginInstance, `API check failed (Status: ${response.status})`);
        }
    } catch (error: any) {
        // Handle network errors (fetch exceptions)
        console.error("Network error during connection check:", error);
        let reason = 'Network error';
        if (error.message) {
            reason += `: ${error.message}`;
        }
        // Check for common network errors if possible (e.g., ECONNREFUSED)
        if (error.message?.includes('ECONNREFUSED') || error.message?.includes('Failed to fetch')) {
             reason = 'Connection refused (Server offline?)';
        }
        return handleConnectionFailure(pluginInstance, reason);
    }
}


// --- Data Fetching Functions (using direct API calls) ---

/**
 * Fetches system stats from the ComfyUI API using requestUrl.
 * @param pluginInstance The instance of the Workbench plugin.
 * @returns A promise resolving to SystemStats or null if failed.
 */
export async function fetchSystemStats(pluginInstance: Workbench): Promise<SystemStats | null> {
    const apiUrlString = pluginInstance.settings.comfyApiUrl?.trim();
    if (!apiUrlString) {
        console.warn("Cannot fetch system stats: ComfyUI API URL is not set.");
        pluginInstance.latestSystemStats = null; // Clear stats if URL is missing
        return null;
    }

    let statsUrl: string;
    try {
        const apiUrl = new URL(apiUrlString);
        statsUrl = `${apiUrl.origin}/system_stats`;
    } catch (e) {
        console.error("Invalid ComfyUI API URL format for fetching system stats.");
        pluginInstance.latestSystemStats = null; // Clear stats on URL error
        return null;
    }

    try {
        // console.log(`Fetching system stats from: ${statsUrl}`); // Debug log
        const response = await requestUrl({ url: statsUrl, method: 'GET' });

        if (response.status === 200) {
            const statsData = response.json;
            // console.log("Raw system_stats data:", statsData); // Debug log
            const parsedStats = parseSystemStats(pluginInstance, statsData); // Use the parsing helper
            if (parsedStats) {
                 // console.log("Parsed system stats:", parsedStats); // Debug log
                 return parsedStats;
            } else {
                 console.warn("Failed to parse system stats data received from API.");
                 // Keep last known good stats instead of clearing? Or clear? Let's clear for now.
                 pluginInstance.latestSystemStats = null;
                 return null;
            }
        } else {
            console.warn(`Failed to fetch system stats: Status ${response.status}`);
            // Don't clear stats on temporary fetch error, return last known good state
            return pluginInstance.latestSystemStats;
        }
    } catch (error) {
        console.error("Error fetching system stats via requestUrl:", error);
        // Don't clear stats on network error, return last known good state
        return pluginInstance.latestSystemStats;
    }
}

/**
 * Fetches queue information from the ComfyUI API using requestUrl.
 * @param pluginInstance The instance of the Workbench plugin.
 * @returns A promise resolving to QueueInfo or null if failed.
 */
export async function fetchQueueInfo(pluginInstance: Workbench): Promise<QueueInfo | null> {
    const apiUrlString = pluginInstance.settings.comfyApiUrl?.trim();
    if (!apiUrlString) {
        console.warn("Cannot fetch queue info: ComfyUI API URL is not set.");
        return null;
    }

    let queueUrl: string;
    try {
        const apiUrl = new URL(apiUrlString);
        queueUrl = `${apiUrl.origin}/queue`;
    } catch (e) {
        console.error("Invalid ComfyUI API URL format for fetching queue info.");
        return null;
    }

    try {
        // console.log(`Fetching queue info from: ${queueUrl}`); // Debug log
        const response = await requestUrl({ url: queueUrl, method: 'GET' });

        if (response.status === 200) {
            const queueData = response.json;
            // console.log("Raw queue data:", queueData); // Debug log
            // Basic validation
            if (queueData && typeof queueData === 'object') {
                return {
                    queue_running: queueData.queue_running || [],
                    queue_pending: queueData.queue_pending || []
                } as QueueInfo;
            } else {
                 console.warn("Received invalid queue info data:", queueData);
                 return null;
            }
        } else {
            console.warn(`Failed to fetch queue info: Status ${response.status}`);
            return null; // Return null on non-200 status
        }
    } catch (error) {
        console.error("Error fetching queue info via requestUrl:", error);
        return null; // Return null on network error
    }
}

// --- Workflow Execution (Still uses SDK) ---

/**
 * Runs a workflow using the ComfyUI API (via SDK) and updates progress.
 * @param pluginInstance The instance of the Workbench plugin.
 * @param workflowData The workflow data object.
 */
export async function runWorkflow(pluginInstance: Workbench, workflowData: any): Promise<void> {
    // Check if the SDK instance exists and seems ready (basic check)
    // Note: SDK's isReady might not be reliable if init failed silently, but it's a start.
    // Polling status provides a better check for actual server readiness.
    if (!pluginInstance.comfyApi) { // Check if instance exists first
        updateStatusBar(pluginInstance, pluginInstance.currentComfyStatus, "ComfyUI SDK not available");
        throw new Error("ComfyUI SDK is not available. Cannot run workflow.");
    }
     // Add a check for polling status as well, as SDK might be instantiated but server unresponsive
     if (pluginInstance.currentComfyStatus !== 'Ready' && pluginInstance.currentComfyStatus !== 'Busy') {
         updateStatusBar(pluginInstance, pluginInstance.currentComfyStatus, `ComfyUI not ready (${pluginInstance.currentComfyStatus})`);
         throw new Error(`ComfyUI is not ready (Status: ${pluginInstance.currentComfyStatus}). Cannot run workflow.`);
     }


    try {
        // Reset progress before starting
        pluginInstance.currentRunningPromptId = null;
        pluginInstance.currentProgressValue = null;
        pluginInstance.currentProgressMax = null;

        console.log("Attempting to queue prompt via SDK...");
        const result = await pluginInstance.comfyApi.queuePrompt(workflowData, {});
        const promptId = result?.prompt_id;

        if (promptId) {
            console.log(`Workflow queued with Prompt ID: ${promptId}`);
            pluginInstance.currentRunningPromptId = promptId; // Store the running prompt ID
            // Status bar will update via polling or progress events
            new Notice(`Workflow started (ID: ${promptId})`);
            // Manually trigger a poll shortly after queuing? Optional.
            // setTimeout(() => pollStatus(pluginInstance), 500);
        } else {
            console.warn("queuePrompt did not return a prompt_id.", result);
            new Notice("Workflow queued, but failed to get Prompt ID.");
            // Update status bar to indicate potential issue or just let polling handle it
            updateStatusBar(pluginInstance, 'Ready', 'Workflow queued (no ID)');
        }
    } catch (error) {
        console.error("Error running workflow via SDK:", error);
        // Reset progress on error
        pluginInstance.currentRunningPromptId = null;
        pluginInstance.currentProgressValue = null;
        pluginInstance.currentProgressMax = null;
        updateStatusBar(pluginInstance, 'Error', 'Workflow execution failed');
        throw error; // Re-throw for the caller (e.g., main.ts) to handle
    }
}