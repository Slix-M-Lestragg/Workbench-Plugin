/**
 * UI State Manager
 * 
 * Handles all UI state management including:
 * - Ribbon icon updates based on connection status
 * - Model list view settings synchronization
 * - Visual feedback for users about ComfyUI integration state
 */

import { setIcon } from 'obsidian';
import type { ComfyStatus } from '../types/comfy';
import type Workbench from '../core/main';

// View type constants
const MODEL_LIST_VIEW_TYPE = 'workbench-model-list-view';

export class UIStateManager {
    constructor(private plugin: Workbench) {}

    /**
     * Updates the ribbon icon based on the current ComfyUI connection status.
     * This method provides visual feedback to users about the current state of ComfyUI integration.
     * 
     * The icon changes dynamically to reflect different states:
     * - 'image': Default launch state (Disconnected)
     * - 'app-window': Ready/Busy states (can open web interface)
     * - 'loader-2': Transitional states (Connecting/Launching)
     * - 'alert-circle': Error state (needs attention)
     * 
     * @param status - The current ComfyUI connection status
     */
    updateRibbonIcon(status: ComfyStatus): void {
        if (!this.plugin.ribbonIconEl) {
            // Add a warning if the element doesn't exist when this is called
            console.warn("Workbench: updateRibbonIcon called but this.ribbonIconEl is not set.");
            return;
        }

        // Log the attempt to update
        console.log(`Workbench: Attempting to update ribbon icon. Status: ${status}, Element:`, this.plugin.ribbonIconEl);

        let iconName = 'image'; // Default icon (e.g., launch)
        let tooltip = 'Launch ComfyUI';

        if (status === 'Ready' || status === 'Busy') {
            iconName = 'app-window'; // Icon for opening the web UI
            tooltip = 'Open ComfyUI Web Interface';
            if (!this.plugin.settings.comfyApiUrl?.trim()) {
                tooltip = 'Cannot Open ComfyUI (URL not set)';
            }
        } else if (status === 'Connecting' || status === 'Launching') {
            iconName = 'loader-2'; // Icon for intermediate states
            tooltip = `ComfyUI: ${status}...`;
        } else if (status === 'Error') {
            iconName = 'alert-circle'; // Icon for error state
            tooltip = 'ComfyUI Error - Click to attempt launch';
        }
        // 'Disconnected' uses the default 'image' icon and 'Launch ComfyUI' tooltip

        // Log the icon and tooltip being set
        console.log(`Workbench: Setting ribbon icon to '${iconName}' with tooltip '${tooltip}'`);
        setIcon(this.plugin.ribbonIconEl, iconName);
        this.plugin.ribbonIconEl.ariaLabel = tooltip;
    }

    /**
     * Update all open ModelListView instances with current CivitAI settings.
     * This ensures that provider configuration changes are immediately reflected
     * in all active model browser instances without requiring a restart.
     */
    updateModelListViewSettings(): void {
        const modelListLeaves = this.plugin.app.workspace.getLeavesOfType(MODEL_LIST_VIEW_TYPE);
        modelListLeaves.forEach(leaf => {
            const view = leaf.view;
            if ('updateCivitAISettings' in view && typeof view.updateCivitAISettings === 'function') {
                (view as { updateCivitAISettings: () => void }).updateCivitAISettings();
            }
        });
    }
}
