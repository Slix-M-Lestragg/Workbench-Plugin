/* eslint-disable @typescript-eslint/no-inferrable-types */
import { setIcon } from 'obsidian';
import type Workbench from '../../core/main'; // Use 'type' for import as it's only used for type annotations
import type { ComfyStatus } from './../../types/comfy';
import { showStatusPopover } from './StatusBarPopover'; // Import the new popover function

/**
 * Updates the plugin's status bar item AND the ribbon icon.
 * @param pluginInstance The instance of the Workbench plugin.
 * @param status The new status to display.
 * @param tooltip An optional tooltip message for the status bar.
 */
export function updateStatusBar(pluginInstance: Workbench, status: ComfyStatus, tooltip: string = ''): void {
    const { statusBarItemEl } = pluginInstance;

    // Update status on the plugin instance FIRST
    pluginInstance.currentComfyStatus = status;

    // Update Ribbon Icon (call the new method on the plugin instance)
    pluginInstance.updateRibbonIcon(status);

    // --- Update Status Bar ---
    if (!statusBarItemEl) return; // Check if status bar element exists

    let icon = 'plug-zap';
    let text = 'ComfyUI: '; // Base text for tooltip generation

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

    // Use the full text for the tooltip, prioritizing the explicit tooltip if provided
    statusBarItemEl.ariaLabel = tooltip || text;
}

/**
 * Initializes the status bar item.
 * @param pluginInstance The instance of the Workbench plugin.
 */
export function setupStatusBar(pluginInstance: Workbench): void {
    pluginInstance.statusBarItemEl = pluginInstance.addStatusBarItem();
    // Initial status bar update (will also call updateRibbonIcon indirectly if needed, though ribbon isn't created yet)
    updateStatusBar(pluginInstance, 'Disconnected', 'ComfyUI: Offline. Click for status & options.');
    pluginInstance.statusBarItemEl.onClickEvent((event: MouseEvent) => {
        showStatusPopover(pluginInstance, event, pluginInstance.statusBarItemEl || undefined);
    });
}