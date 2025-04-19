import { setIcon } from 'obsidian';
import type Workbench from '../main'; // Use 'type' for import as it's only used for type annotations
import type { ComfyStatus } from '../comfy/types';
import { showStatusPopover } from './StatusBarPopover'; // Import the new popover function

/**
 * Updates the plugin's status bar item.
 * @param pluginInstance The instance of the Workbench plugin.
 * @param status The new status to display.
 * @param tooltip An optional tooltip message.
 */
export function updateStatusBar(pluginInstance: Workbench, status: ComfyStatus, tooltip: string = ''): void {
    const { statusBarItemEl } = pluginInstance;
    if (!statusBarItemEl) return;

    pluginInstance.currentComfyStatus = status; // Update the status on the plugin instance
    let icon = 'plug-zap';
    let text = 'ComfyUI: '; // Keep text for tooltip generation

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

    // Add animation class if busy
    if (status === 'Busy') {
        iconEl.addClass('comfy-busy-icon');
    } else {
        iconEl.removeClass('comfy-busy-icon'); // Ensure class is removed for other states
    }

    // Remove the text span creation
    // statusBarItemEl.createSpan({ text: ` ${text}` });

    // Use the full text for the tooltip
    statusBarItemEl.ariaLabel = tooltip || text;
}

/**
 * Initializes the status bar item.
 * @param pluginInstance The instance of the Workbench plugin.
 */
export function setupStatusBar(pluginInstance: Workbench): void {
    pluginInstance.statusBarItemEl = pluginInstance.addStatusBarItem();
    // Initial tooltip reflects the action
    updateStatusBar(pluginInstance, 'Disconnected', 'ComfyUI: Offline. Click for status & options.'); // Keep tooltip
    pluginInstance.statusBarItemEl.onClickEvent((event) => { // Keep event for stopPropagation
        // Pass the status bar element itself for positioning
        showStatusPopover(pluginInstance, event, pluginInstance.statusBarItemEl || undefined);
    });
}