import { Notice, requestUrl } from 'obsidian';
import type Workbench from './../main';
import { updateStatusBar } from '../ui/status_bar';
import { startPolling, stopPolling, pollStatus } from './polling'; // Import polling functions
import type { ComfyApi } from './types'; // Import the interface

/**
 * Checks the connection to the ComfyUI API and updates the status.
 * @param pluginInstance The instance of the Workbench plugin.
 * @returns True if connection is successful, false otherwise.
 */
export async function checkComfyConnection(pluginInstance: Workbench): Promise<boolean> {
    stopPolling(pluginInstance); // Stop any existing polling
    pluginInstance.comfyApi = null; // Reset API instance
    const apiUrl = pluginInstance.settings.comfyApiUrl?.trim();

    if (!apiUrl) {
        new Notice('ComfyUI API URL is empty. Please provide a valid URL.');
        console.error('ComfyUI API URL is empty');
        updateStatusBar(pluginInstance, 'Error', 'ComfyUI API URL is empty');
        return false;
    }

    try {
        new URL(apiUrl); // Validate URL format
    } catch (e) {
        new Notice('Invalid ComfyUI API URL format');
        console.error('Invalid ComfyUI API URL format:', e);
        updateStatusBar(pluginInstance, 'Error', 'Invalid ComfyUI API URL format');
        return false;
    }

    updateStatusBar(pluginInstance, 'Connecting', `Connecting to ${apiUrl}...`);

    try {
        const response = await requestUrl({
            url: `${apiUrl}/system_stats`,
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            throw: false
        });

        if (response.status !== 200) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        console.log('ComfyUI connection successful');
        new Notice('Successfully connected to ComfyUI API');

        // Create the minimal API wrapper instance
        pluginInstance.comfyApi = createComfyApiWrapper(apiUrl);

        await pollStatus(pluginInstance); // Perform an immediate status check

        if (pluginInstance.settings.enablePolling) {
            startPolling(pluginInstance); // Start polling if enabled
        }

        return true;

    } catch (error) {
        new Notice(`Failed to connect to ComfyUI API: ${error.message}`);
        console.error('ComfyUI connection error:', error);
        pluginInstance.comfyApi = null;
        updateStatusBar(pluginInstance, 'Error', `Connection failed: ${error.message}`);
        stopPolling(pluginInstance); // Ensure polling is stopped on error
        return false;
    }
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
            const response = await requestUrl({ url: `${apiUrl}/queue`, method: 'GET', headers: {'Accept': 'application/json'} });
            return response.json;
        },

        async getSystemStats() {
            const response = await requestUrl({ url: `${apiUrl}/system_stats`, method: 'GET', headers: {'Accept': 'application/json'} });
            return response.json;
        }
    };
}