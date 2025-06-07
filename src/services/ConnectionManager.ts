/**
 * Connection Manager
 * 
 * Handles all ComfyUI connection and system monitoring functionality including:
 * - Connection status management
 * - System statistics fetching
 * - Queue information retrieval
 * - Polling operations
 * - Connection establishment
 */

import { startPolling, stopPolling } from '../services/comfy/polling';
import { launchComfyUI } from '../services/comfy/launch';
import { checkComfyConnection } from '../services/comfy/api';
import { fetchSystemStats, fetchQueueInfo } from '../services/comfy/api';
import type { SystemStats, QueueInfo } from '../types/comfy';
import type Workbench from '../core/main';

export class ConnectionManager {
    constructor(private plugin: Workbench) {}

    /**
     * Fetch current system statistics from ComfyUI server including CPU, RAM, and GPU usage.
     * This method provides real-time hardware monitoring capabilities for performance tracking.
     * 
     * @returns Promise<SystemStats | null> - System statistics object or null if unavailable
     */
    async getSystemStats(): Promise<SystemStats | null> {
        if (!this.plugin.comfyApi || this.plugin.currentComfyStatus === 'Disconnected' || this.plugin.currentComfyStatus === 'Error') {
            console.log("Cannot fetch system stats, ComfyUI not connected.");
            return null;
        }
        try {
            console.log("1. Fetching system stats from ConnectionManager...", this.plugin.comfyApi);
            return await fetchSystemStats(this.plugin);
        } catch (error) {
            console.error("Error fetching system stats from ConnectionManager:", error);
            return null;
        }
    }

    /**
     * Fetch current queue information from ComfyUI server including pending and running jobs.
     * This method provides insight into workflow execution status and queue management.
     * 
     * @returns Promise<QueueInfo | null> - Queue information object or null if unavailable
     */
    async getQueueInfo(): Promise<QueueInfo | null> {
        if (!this.plugin.comfyApi || this.plugin.currentComfyStatus === 'Disconnected' || this.plugin.currentComfyStatus === 'Error') {
            console.log("Cannot fetch queue info, ComfyUI not connected.");
            return null;
        }
        try {
            return await fetchQueueInfo(this.plugin);
        } catch (error) {
            console.error("Error fetching queue info from ConnectionManager:", error);
            return null;
        }
    }

    /**
     * Start ComfyUI connection polling
     * This enables other modules to initiate polling through the connection manager
     */
    startPolling = (): void => {
        startPolling(this.plugin);
    };

    /**
     * Stop ComfyUI connection polling
     * This enables other modules to stop polling through the connection manager
     */
    stopPolling = (): void => {
        stopPolling(this.plugin);
    };

    /**
     * Launch ComfyUI application
     * This enables other modules to launch ComfyUI through the connection manager
     */
    launchComfyUI = (): Promise<void> => {
        return launchComfyUI(this.plugin);
    };

    /**
     * Check ComfyUI connection status
     * This enables other modules to test connectivity through the connection manager
     */
    checkConnection = (): Promise<boolean> => {
        return checkComfyConnection(this.plugin);
    };
}
