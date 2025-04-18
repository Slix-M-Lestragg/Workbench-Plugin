import { setIcon } from 'obsidian';
import type Workbench from '../main'; // Use 'type' for import as it's only used for type annotations
import type { ComfyStatus } from '../comfy/types';

/**
 * Updates the plugin's status bar item.
 * @param pluginInstance The instance of the Workbench plugin.
 * @param status The new status to display.
 * @param tooltip An optional tooltip message.
 */
export function updateStatusBar(pluginInstance: Workbench, status: ComfyStatus, tooltip: string = ''): void {
    const { statusBarItemEl } = pluginInstance;
    if (!statusBarItemEl) return;

    // Avoid unnecessary updates (optional optimization)
    // if (status === pluginInstance.currentComfyStatus && statusBarItemEl.ariaLabel === tooltip) {
    //     return;
    // }

    pluginInstance.currentComfyStatus = status; // Update the status on the plugin instance
    let icon = 'plug-zap';
    let text = 'ComfyUI: ';

    switch (status) {
        case 'Disconnected': icon = 'plug-zap'; text += 'Offline'; break;
        case 'Connecting': icon = 'refresh-cw'; text += 'Connecting...'; break;
        case 'Ready': icon = 'check-circle'; text += 'Ready'; break;
        case 'Busy': icon = 'loader'; text += 'Busy'; break; // Tooltip will provide details
        case 'Error': icon = 'alert-triangle'; text += 'Error'; break;
        case 'Launching': icon = 'rocket'; text += 'Launching...'; break;
    }

    statusBarItemEl.empty();
    const iconEl = statusBarItemEl.createSpan({ cls: 'status-bar-icon' });
    setIcon(iconEl, icon);
    statusBarItemEl.createSpan({ text: ` ${text}` });
    statusBarItemEl.ariaLabel = tooltip || `ComfyUI Status: ${status}`;
}

/**
 * Initializes the status bar item.
 * @param pluginInstance The instance of the Workbench plugin.
 */
export function setupStatusBar(pluginInstance: Workbench): void {
    pluginInstance.statusBarItemEl = pluginInstance.addStatusBarItem();
    updateStatusBar(pluginInstance, 'Disconnected', 'Click to check connection'); // Use the imported function
    pluginInstance.statusBarItemEl.onClickEvent(async () => {
        // Don't connect if already connecting or launching
        if (pluginInstance.currentComfyStatus !== 'Connecting' && pluginInstance.currentComfyStatus !== 'Launching') {
            // Need to import and call checkComfyConnection from api.ts
            // Assuming checkComfyConnection is imported into main.ts and available on pluginInstance or imported directly here
            await pluginInstance.checkComfyConnection(); // We'll adjust main.ts later
        }
    });
}