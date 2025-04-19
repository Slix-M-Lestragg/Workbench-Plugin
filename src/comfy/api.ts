import { Notice, requestUrl } from 'obsidian';
import type Workbench from '../main';
import { updateStatusBar } from '../ui/status_bar';
import { startPolling, stopPolling, pollStatus } from './polling';
import { ComfyApi } from '@saintno/comfyui-sdk'; // Ensure ComfyApi is imported
import type { SystemStats, QueueInfo } from './types';

// Define the handler for system monitor events
function handleSystemMonitorEvent(pluginInstance: Workbench, data: any) {
    if (!data) return;
    // console.log("Received system_monitor data:", data); // Log to inspect structure if needed

    // Attempt to extract stats based on likely Crystools structure
    const systemInfo = data.system;
    const devices = data.devices;

    if (!systemInfo || !devices) {
        console.warn("System monitor data structure not recognized:", data);
        // Optionally clear stats or keep the last known good state
        // pluginInstance.latestSystemStats = null;
        return;
    }

    try {
        const ram_total = systemInfo?.ram_total ?? 0;
        const ram_free = systemInfo?.ram_free ?? 0;
        const ram_used = ram_total > 0 ? ram_total - ram_free : 0;
        const ram_utilization = ram_total > 0 ? (ram_used / ram_total) * 100 : undefined;
        const cpu_utilization = systemInfo?.cpu_usage ?? undefined; // <-- Extract CPU usage
        // console.log(`[Monitor Event] Raw cpu_usage: ${systemInfo?.cpu_usage}, Mapped cpu_utilization: ${cpu_utilization}`); // <-- REMOVE LOG

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
             cpu_utilization: cpu_utilization, // <-- Assign CPU usage
             ram_total: ram_total,
             ram_used: ram_used,
             ram_utilization: ram_utilization,
         };

        // Store the latest stats (Assumes latestSystemStats exists on Workbench class)
        pluginInstance.latestSystemStats = mappedStats;

        // console.log(`[Monitor Event] Updated latestSystemStats:`, pluginInstance.latestSystemStats); // <-- REMOVE LOG

        // If polling is disabled, we might need to manually trigger a status bar update here
        // This depends on how your UI updates are triggered. If they rely solely on polling,
        // you might need to call an update function here when polling is off.
        // Example: if (!pluginInstance.settings.enablePolling) { updateStatusBar(pluginInstance, pluginInstance.currentComfyStatus); }

    } catch (error) {
        console.error("Error processing system monitor event data:", error, data);
        // Avoid clearing stats on a single processing error, keep last known good state
    }
}

// Define the handler for progress events
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


export function checkComfyConnection(pluginInstance: Workbench): Promise<boolean> {
    return new Promise(async (resolve) => {
        let connectionTimeoutId: number | null = null;

        if (pluginInstance.currentComfyStatus === 'Connecting' || pluginInstance.currentComfyStatus === 'Launching') {
            console.log("Connection check skipped: Already connecting or launching.");
            resolve(false);
            return;
        }

        stopPolling(pluginInstance);

        if (pluginInstance.comfyApi) {
            try {
                // Use SDK's built-in cleanup if available, otherwise just nullify
                if (typeof (pluginInstance.comfyApi as any).removeAllListeners === 'function') {
                    (pluginInstance.comfyApi as any).removeAllListeners();
                }
                if (typeof (pluginInstance.comfyApi as any).close === 'function') {
                    (pluginInstance.comfyApi as any).close(); // Close WebSocket if open
                    console.log("Closed previous ComfyUI WebSocket connection.");
                }
            } catch (e) {
                console.warn("Error cleaning up previous ComfyApi instance:", e);
            } finally {
                pluginInstance.comfyApi = null;
                pluginInstance.systemMonitorListener = null; // Clear listeners too
                pluginInstance.progressListener = null;
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

        let httpUrl: string;
        try {
            const apiUrl = new URL(apiUrlString);
            httpUrl = apiUrl.origin; // SDK uses the base HTTP URL
            console.log(`Using HTTP URL for SDK: ${httpUrl}`);
        } catch (e) {
            new Notice('Invalid ComfyUI API URL format.');
            console.error('Invalid ComfyUI API URL format:', e);
            updateStatusBar(pluginInstance, 'Error', 'Invalid ComfyUI API URL');
            resolve(false);
            return;
        }

        pluginInstance.pollingRetryCount = 0;
        updateStatusBar(pluginInstance, 'Connecting', `Connecting to ${apiUrlString}...`);

        let initialCheckCompleted = false;

        const cleanupConnectionAttempt = () => {
            if (connectionTimeoutId) clearTimeout(connectionTimeoutId);
            connectionTimeoutId = null;
            // Remove listeners added during this attempt
            if (pluginInstance.comfyApi) {
                try {
                    // Use SDK's method if available, otherwise remove specific ones
                    if (typeof pluginInstance.comfyApi.removeAllListeners === 'function') {
                         pluginInstance.comfyApi.removeAllListeners();
                         console.log("Removed all SDK listeners during cleanup.");
                    } else {
                        // Fallback: remove specific known listeners if removeAllListeners isn't there
                        pluginInstance.comfyApi.removeEventListener('ready', onReady);
                        pluginInstance.comfyApi.removeEventListener('error', onError);
                        pluginInstance.comfyApi.removeEventListener('close', onClose);
                        // Manually remove feature listeners if they were added
                        if (pluginInstance.comfyApi.ext?.monitor?.isSupported && pluginInstance.systemMonitorListener) {
                             pluginInstance.comfyApi.ext.monitor.removeEventListener("system_monitor", pluginInstance.systemMonitorListener as any);
                        }
                        if (pluginInstance.progressListener) {
                             pluginInstance.comfyApi.removeEventListener("progress", pluginInstance.progressListener as any);
                        }
                    }
                } catch (listenerError) {
                    console.warn("Error removing SDK event listeners during cleanup:", listenerError);
                }
            }
             // Clear listener references on the plugin instance
             pluginInstance.systemMonitorListener = null;
             pluginInstance.progressListener = null;
        };

        const handleConnectionSuccess = async () => {
            if (initialCheckCompleted) return;
            initialCheckCompleted = true;
            cleanupConnectionAttempt(); // Cleans up timeout and init-specific listeners
            console.log('ComfyUI connection successful (SDK ready event).');
            new Notice('Successfully connected to ComfyUI API');

            // --- Setup persistent listeners ---
            // Monitor Listener
            if (pluginInstance.comfyApi?.ext?.monitor?.isSupported) {
                console.log("Crystools monitor extension detected. Subscribing to system_monitor events.");
                pluginInstance.systemMonitorListener = (ev: CustomEvent<any>) => handleSystemMonitorEvent(pluginInstance, ev.detail);
                pluginInstance.comfyApi.ext.monitor.on("system_monitor", pluginInstance.systemMonitorListener as any);
                console.log("Fetching initial monitor data...");
                handleSystemMonitorEvent(pluginInstance, pluginInstance.comfyApi.ext.monitor.monitorData);
            } else {
                console.log("Crystools monitor extension not supported.");
                pluginInstance.systemMonitorListener = null;
            }

            // Progress Listener
            console.log("Subscribing to progress events.");
            pluginInstance.progressListener = (ev: CustomEvent<any>) => handleProgressEvent(pluginInstance, ev.detail);
            pluginInstance.comfyApi?.addEventListener("progress", pluginInstance.progressListener as any);

            // Add the 'close' listener again for handling disconnections *after* successful init
            pluginInstance.comfyApi?.addEventListener('close', onClose);
            // --- End of persistent listeners ---


            try {
                await pollStatus(pluginInstance); // Determine Ready/Busy state
                pluginInstance.pollingRetryCount = 0;
                if (pluginInstance.settings.enablePolling) {
                    startPolling(pluginInstance);
                }
                resolve(true);
            } catch (pollError) {
                console.error("Initial status poll failed after connection was established:", pollError);
                // Resolve true because the connection succeeded, polling handles the error state.
                resolve(true);
            }
        };

        const handleConnectionFailure = (reason: string) => {
            if (initialCheckCompleted) return;
            initialCheckCompleted = true;
            const wasConnecting = pluginInstance.currentComfyStatus === 'Connecting';
            cleanupConnectionAttempt();
            console.error(`ComfyUI connection failed: ${reason}`);
            if (wasConnecting) { // Only show notice if it failed during initial connection
                 new Notice(`ComfyUI connection failed: ${reason}`);
            }
            updateStatusBar(pluginInstance, 'Error', `Connection failed: ${reason}`);

            if (pluginInstance.comfyApi) {
                try {
                    if (typeof (pluginInstance.comfyApi as any).close === 'function') {
                        (pluginInstance.comfyApi as any).close();
                    }
                } catch (e) { /* Ignore */ }
                pluginInstance.comfyApi = null; // Nullify the instance
            }
            // Clear progress state
            pluginInstance.currentRunningPromptId = null;
            pluginInstance.currentProgressValue = null;
            pluginInstance.currentProgressMax = null;
            resolve(false);
        };

        // --- SDK Event Handlers (for init process) ---
        const onReady = async () => {
            console.log(">>> SDK 'ready' event received!");
            await handleConnectionSuccess();
        };

        const onError = (errorEvent: Event | Error | any) => { // Make type more permissive
            console.error(">>> SDK 'error' event received!", errorEvent);
            // Attempt to get a meaningful message
            let errorMessage = 'WebSocket error';
            if (errorEvent instanceof Error) {
                errorMessage = errorEvent.message;
            } else if (typeof errorEvent === 'string') {
                errorMessage = errorEvent;
            } else if (errorEvent?.message) {
                errorMessage = errorEvent.message;
            } else if (errorEvent?.type) {
                 errorMessage = `WebSocket error type: ${errorEvent.type}`;
            }
            handleConnectionFailure(errorMessage);
        };

        // This onClose handles closures *during* the init phase or unexpected closures *after* init
        const onClose = (closeEvent?: any) => {
             console.log(">>> SDK 'close' event received!", closeEvent);

             // Clean up persistent listeners if they were added
             if (pluginInstance.comfyApi?.ext?.monitor?.isSupported && pluginInstance.systemMonitorListener) {
                 try {
                     pluginInstance.comfyApi.ext.monitor.removeEventListener("system_monitor", pluginInstance.systemMonitorListener as any);
                     console.log("Removed system_monitor listener on SDK close.");
                 } catch (e) { console.warn("Error removing system_monitor listener on SDK close:", e); }
                 pluginInstance.systemMonitorListener = null;
             }
             if (pluginInstance.comfyApi && pluginInstance.progressListener) {
                 try {
                     pluginInstance.comfyApi.removeEventListener("progress", pluginInstance.progressListener as any);
                     console.log("Removed progress listener on SDK close.");
                 } catch (e) { console.warn("Error removing progress listener on SDK close:", e); }
                 pluginInstance.progressListener = null;
             }
             // Clear progress state
             pluginInstance.currentRunningPromptId = null;
             pluginInstance.currentProgressValue = null;
             pluginInstance.currentProgressMax = null;

             // If the connection was never established ('ready' never fired)
             if (!initialCheckCompleted && pluginInstance.currentComfyStatus === 'Connecting') {
                const reason = closeEvent?.reason || 'WebSocket closed before ready';
                handleConnectionFailure(reason);
             }
             // If it closed *after* being ready/connected
             else if (initialCheckCompleted && pluginInstance.currentComfyStatus !== 'Disconnected' && pluginInstance.currentComfyStatus !== 'Error') {
                 console.log("ComfyUI SDK connection closed after successful connection.");
                 updateStatusBar(pluginInstance, 'Disconnected', 'Connection closed');
                 pluginInstance.currentComfyStatus = 'Disconnected';
                 pluginInstance.comfyApi = null; // Nullify the instance on disconnect
                 stopPolling(pluginInstance);
                 // Do not resolve the promise here, it was likely already resolved true.
             } else {
                 console.log("SDK 'close' event received in unexpected state or already handled.");
             }
        };


        try {
            console.log('Initializing ComfyUI SDK instance...');
            // Use a unique client ID for WebSocket robustness
            const clientId = `obsidian-workbench-${Date.now()}`;
            pluginInstance.comfyApi = new ComfyApi(httpUrl, clientId);

            console.log('ComfyUI SDK instance created. Adding event listeners for init...');
            pluginInstance.comfyApi.addEventListener('ready', onReady);
            pluginInstance.comfyApi.addEventListener('error', onError);
            // Add 'close' listener early to catch immediate closure issues during init
            pluginInstance.comfyApi.addEventListener('close', onClose);
            console.log('Event listeners added.');

            // Set connection timeout before calling init
            console.log('Setting connection timeout (30s)...');
            connectionTimeoutId = window.setTimeout(() => {
                if (!initialCheckCompleted) {
                     handleConnectionFailure('Connection timed out (30s)');
                }
            }, 30000); // 30-second timeout

            console.log('Calling ComfyApi.init()...');
            // Initiate the connection process using the SDK's method
            await pluginInstance.comfyApi.init(); // init() handles WebSocket connection internally
            console.log('ComfyApi.init() called. Waiting for SDK events or timeout...');

            // --- IMPORTANT ---
            // Do NOT put code here that assumes connection is ready.
            // The 'ready' event handler (onReady -> handleConnectionSuccess) will execute
            // when the connection is actually established.
            // The timeout or 'error'/'close' events will handle failures.

        } catch (error: any) {
            // Catch errors during ComfyApi instantiation or *synchronous* errors from init()
            // Note: Most connection errors are asynchronous and handled by 'error'/'close' listeners.
            handleConnectionFailure(error.message || 'SDK setup/init error');
        }
    }); // End of Promise constructor
}

/**
 * Fetches system stats from the ComfyUI API.
 * @param pluginInstance The instance of the Workbench plugin.
 * @returns A promise resolving to SystemStats or null if failed.
 */
export async function fetchSystemStats(pluginInstance: Workbench): Promise<SystemStats | null> {
    if (!pluginInstance.comfyApi || !pluginInstance.comfyApi.isReady) { // Add check for isReady
        // console.warn("fetchSystemStats called but comfyApi is not initialized or not ready.");
        // Don't clear stats if just temporarily not ready, only if api is null
        if (!pluginInstance.comfyApi) pluginInstance.latestSystemStats = null;
        return pluginInstance.latestSystemStats; // Return last known stats if temporarily unavailable
    }

    // Prioritize Crystools monitor data
    if (pluginInstance.comfyApi.ext?.monitor?.isSupported && pluginInstance.systemMonitorListener) {
        console.log("Crystools monitor extension is supported. Attempting to use monitor data.");
        try {
            const monitorData = pluginInstance.comfyApi.ext.monitor.monitorData;
            if (monitorData) {
                handleSystemMonitorEvent(pluginInstance, monitorData); // This already logs
                return pluginInstance.latestSystemStats;
            } else {
                 console.warn("Crystools monitor data was null or undefined.");
                 // Fall through to standard API call
            }
        } catch (monitorError) {
            console.error("Error processing Crystools monitor data:", monitorError);
            // Fall through to standard API call
        }
    }

    // Fallback to getSystemStats API
    try {
        const stats = await pluginInstance.comfyApi.getSystemStats();

        if (stats && typeof stats === 'object') {
             // Crystools structure from getSystemStats
             if (stats.hasOwnProperty('system') && stats.hasOwnProperty('devices') && Array.isArray(stats.devices)) {
                const systemInfo = (stats as any).system;
                const devices = stats.devices;

                // Calculate RAM stats from the system object
                const ram_total = systemInfo?.ram_total ?? 0;
                const ram_free = systemInfo?.ram_free ?? 0;
                const ram_used = ram_total > 0 ? ram_total - ram_free : 0;
                const ram_utilization = ram_total > 0 ? (ram_used / ram_total) * 100 : undefined;
                // *** ADD CPU EXTRACTION HERE TOO for consistency if monitor isn't active ***
                const cpu_utilization = systemInfo?.cpu_usage ?? undefined;
                // console.log(`[getSystemStats Fallback] Raw cpu_usage: ${systemInfo?.cpu_usage}, Mapped cpu_utilization: ${cpu_utilization}`); // <-- REMOVE LOG

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
                     cpu_utilization: cpu_utilization, // <-- Assign CPU usage
                     ram_total: ram_total,
                     ram_used: ram_used,
                     ram_utilization: ram_utilization,
                 };
                 pluginInstance.latestSystemStats = mappedStats; // Update latest stats
                 // console.log(`[getSystemStats Fallback] Updated latestSystemStats:`, pluginInstance.latestSystemStats); // <-- REMOVE LOG
                 return mappedStats;
             } else {
                 // Standard structure fallback
                 // console.log("Assuming standard stats structure (fallback)."); // <-- REMOVE LOG
                 const standardStats = stats as any;
                 // Calculate RAM usage/utilization if possible from standard structure
                 const ram_total = standardStats.ram_total ?? 0;
                 const ram_used = standardStats.ram_used ?? (ram_total > 0 && standardStats.ram_free ? ram_total - standardStats.ram_free : undefined);
                 const ram_utilization = standardStats.ram_utilization ?? (ram_total > 0 && ram_used !== undefined ? (ram_used / ram_total) * 100 : undefined);

                 const cpu_utilization = standardStats.cpu_utilization ?? undefined; // <-- Get CPU from standard structure
                 // console.log(`[getSystemStats Standard] Mapped cpu_utilization: ${cpu_utilization}`); // <-- REMOVE LOG

                 const mappedStats = {
                    cpu_utilization: cpu_utilization,
                    ram_utilization: ram_utilization,
                    ram_used: ram_used,
                    ram_total: ram_total,
                    gpus: standardStats.gpus?.map((gpu: any) => ({
                        name: gpu.name,
                        type: gpu.type ?? 'Unknown', // Added type if available
                        index: gpu.index ?? -1, // Added index if available
                        gpu_utilization: gpu.gpu_utilization ?? undefined,
                        vram_used: gpu.mem_used ?? gpu.vram_used ?? 0,
                        vram_total: gpu.mem_total ?? gpu.vram_total ?? 0,
                        vram_free: gpu.mem_free ?? gpu.vram_free ?? undefined, // Added free if available
                        memory_utilization: gpu.mem_utilization ?? gpu.vram_utilization ?? undefined // Added mem util if available
                    })) ?? []
                 } as SystemStats;
                 pluginInstance.latestSystemStats = mappedStats; // Update latest stats
                 // console.log(`[getSystemStats Standard] Updated latestSystemStats:`, pluginInstance.latestSystemStats); // <-- REMOVE LOG
                 return mappedStats;
             }
        } else {
             console.warn("Received invalid or non-object system stats via getSystemStats:", stats);
             pluginInstance.latestSystemStats = null; // Clear latest stats
             return null;
        }
    } catch (error) {
        console.error("Error fetching system stats via getSystemStats:", error);
        // Don't clear stats here, might be a temporary API error
        // Return the last known stats instead of null if available
        return pluginInstance.latestSystemStats;
        // return null; // Original behavior
    }
    // Should not be reached if logic is correct, but satisfy TS
    return null;
}

/**
 * Fetches queue information from the ComfyUI API.
 * @param pluginInstance The instance of the Workbench plugin.
 * @returns A promise resolving to QueueInfo or null if failed.
 */
export async function fetchQueueInfo(pluginInstance: Workbench): Promise<QueueInfo | null> {
    if (!pluginInstance.comfyApi || !pluginInstance.comfyApi.isReady) { // Add check for isReady
        // console.warn("fetchQueueInfo called but comfyApi is not initialized or not ready.");
        return null; // Return null if not ready
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

/**
 * Runs a workflow using the ComfyUI API and updates progress.
 * @param pluginInstance The instance of the Workbench plugin.
 * @param workflowData The workflow data object.
 */
export async function runWorkflow(pluginInstance: Workbench, workflowData: any): Promise<void> {
    if (!pluginInstance.comfyApi || !pluginInstance.comfyApi.isReady) { // Add check for isReady
        updateStatusBar(pluginInstance, pluginInstance.currentComfyStatus, "ComfyUI not ready"); // Update status bar
        throw new Error("ComfyUI API is not initialized or not ready.");
    }
    try {
        // Reset progress before starting
        pluginInstance.currentRunningPromptId = null;
        pluginInstance.currentProgressValue = null;
        pluginInstance.currentProgressMax = null;

        const result = await pluginInstance.comfyApi.queuePrompt(workflowData, {});
        const promptId = result?.prompt_id;

        if (promptId) {
            console.log(`Workflow queued with Prompt ID: ${promptId}`);
            pluginInstance.currentRunningPromptId = promptId; // Store the running prompt ID
            // Status bar will update via polling or progress events
            new Notice(`Workflow started (ID: ${promptId})`);
        } else {
            console.warn("queuePrompt did not return a prompt_id.", result);
            new Notice("Workflow queued, but failed to get Prompt ID.");
            // Update status bar to indicate potential issue or just let polling handle it
            updateStatusBar(pluginInstance, 'Ready', 'Workflow queued (no ID)');
        }
    } catch (error) {
        console.error("Error running workflow:", error);
        // Reset progress on error
        pluginInstance.currentRunningPromptId = null;
        pluginInstance.currentProgressValue = null;
        pluginInstance.currentProgressMax = null;
        updateStatusBar(pluginInstance, 'Error', 'Workflow execution failed');
        throw error; // Re-throw for the caller (e.g., main.ts) to handle
    }
}