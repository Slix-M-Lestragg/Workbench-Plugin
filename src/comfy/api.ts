import { Notice, requestUrl } from 'obsidian';
import type Workbench from '../main';
import { updateStatusBar } from '../ui/status_bar';
import { startPolling, stopPolling, pollStatus } from './polling';
import type { ComfyApi } from './types';

export async function checkComfyConnection(pluginInstance: Workbench): Promise<boolean> {
    // Prevent multiple simultaneous checks if already connecting/launching
    if (pluginInstance.currentComfyStatus === 'Connecting' || pluginInstance.currentComfyStatus === 'Launching') {
        console.log("Connection check skipped: Already connecting or launching.");
        return false;
    }

    stopPolling(pluginInstance); // Stop any existing polling
    pluginInstance.comfyApi = null; // Reset API instance
    const apiUrl = pluginInstance.settings.comfyApiUrl?.trim();

    if (!apiUrl) {
        new Notice('ComfyUI API URL is empty. Please configure it.');
        console.error('ComfyUI API URL is empty');
        updateStatusBar(pluginInstance, 'Error', 'ComfyUI API URL is empty');
        return false;
    }

    // Validate URL format before attempting connection
    try {
        new URL(apiUrl);
    } catch (e) {
        new Notice('Invalid ComfyUI API URL format.');
        console.error('Invalid ComfyUI API URL format:', e);
        updateStatusBar(pluginInstance, 'Error', 'Invalid ComfyUI API URL');
        return false;
    }

    // Reset retry count at the beginning of a connection attempt
    pluginInstance.pollingRetryCount = 0;
    if (pluginInstance.pollingRetryTimeoutId) {
        clearTimeout(pluginInstance.pollingRetryTimeoutId);
        pluginInstance.pollingRetryTimeoutId = null;
    }

    updateStatusBar(pluginInstance, 'Connecting', `Connecting to ${apiUrl}...`);

    try {
        console.log(`Attempting connection to ${apiUrl}/system_stats`);
        const response = await requestUrl({
            url: `${apiUrl}/system_stats`,
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            throw: false // Prevent requestUrl from throwing on non-200 status
        });
        console.log(`Connection attempt status: ${response.status}`);

        if (response.status !== 200) {
            // Handle non-200 responses explicitly
            throw new Error(`Connection failed. Status: ${response.status}. Is ComfyUI running at ${apiUrl}?`);
        }

        // --- Connection Successful ---
        console.log('ComfyUI connection successful');
        new Notice('Successfully connected to ComfyUI API');
        pluginInstance.comfyApi = createComfyApiWrapper(apiUrl);

        // Reset retry count again after successful pollStatus confirms API is responsive
        await pollStatus(pluginInstance);
        pluginInstance.pollingRetryCount = 0; // Ensure reset after initial poll

        // Start polling only if enabled and connection was successful
        if (pluginInstance.settings.enablePolling) {
            startPolling(pluginInstance); // startPolling also resets count
        }

        return true;

    } catch (error: any) { // Catch any error during the process
        // --- Connection Failed ---
        const errorMessage = error.message || 'Unknown connection error';
        new Notice(`Failed to connect to ComfyUI API: ${errorMessage}`);
        console.error('ComfyUI connection error:', error);

        pluginInstance.comfyApi = null; // Ensure API is null on failure
        // Update status bar to Error, moving away from 'Connecting'
        updateStatusBar(pluginInstance, 'Error', `Connection failed: ${errorMessage}`);
        stopPolling(pluginInstance); // Ensure polling is stopped on error

        return false;
    }
    // No finally block needed as try/catch covers success and failure paths for status updates
}

/**
 * Creates a minimal wrapper around the ComfyUI API using requestUrl.
 * @param apiUrl The base URL of the ComfyUI API.
 * @returns An object conforming to the ComfyApi interface.
 */
function createComfyApiWrapper(apiUrl: string): ComfyApi {
    return {
        baseUrl: apiUrl,

        async getObjectInfo() {
            try {
                const response = await requestUrl({
                    url: `${apiUrl}/object_info`,
                    method: 'GET',
                    headers: {'Accept': 'application/json'},
                });
                return response.json;
            } catch (e) {
                console.warn('Failed to fetch object info:', e);
                return null;
            }
        },

        async getPromptHistory() {
            try {
                const response = await requestUrl({
                    url: `${apiUrl}/history`,
                    method: 'GET',
                    headers: {'Accept': 'application/json'},
                });
                return response.json;
            } catch (e) {
                console.warn('Failed to fetch prompt history:', e);
                return null;
            }
        },

        async getQueue() {
            // Add error handling for queue request within pollStatus or here if needed
            const response = await requestUrl({ url: `${apiUrl}/queue`, method: 'GET', headers: {'Accept': 'application/json'} });
            return response.json;
        },

        async getSystemStats() {
            // Add error handling for system_stats request if needed elsewhere
            const response = await requestUrl({ url: `${apiUrl}/system_stats`, method: 'GET', headers: {'Accept': 'application/json'} });
            return response.json;
        }
    };
}