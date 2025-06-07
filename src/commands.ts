/**
 * Command Registration for Workbench Plugin
 * 
 * This file defines and registers all available commands for the Workbench Plugin including:
 * - ComfyUI launch commands for different platforms and installation types
 * - Connection management commands (connect, disconnect, check status)
 * - Model management commands (open model browser, refresh metadata)
 * - System monitoring commands (log state, test integrations)
 * - UI navigation commands (open/close views, toggle polling)
 * - Workflow execution commands for JSON files
 * - Ribbon icon setup and status visualization
 */

// ===========================================================================
// IMPORTS AND DEPENDENCIES  
// ===========================================================================

    // Core Obsidian and Plugin Imports
    import type Workbench from './main';
    import { Notice, TFile } from 'obsidian';
    
    // ComfyUI Integration
    import { launchComfyUiDesktopApp, launchComfyUI } from './services/comfy/launch';
    import { testCivitAIIntegration } from './services/comfy/testIntegration';
    
    // UI Types and Constants
    import { MODEL_LIST_VIEW_TYPE } from './types/ui';

/**
 * Registers all Workbench plugin commands with the Obsidian command palette.
 * 
 * This function is the central command registration hub that sets up:
 * - Platform-specific ComfyUI launch commands
 * - Connection management and status monitoring commands  
 * - Model management and metadata commands
 * - UI view management commands
 * - System integration testing commands
 * - Ribbon icon setup for visual status feedback
 * 
 * @param pluginInstance - The main Workbench plugin instance
 */
export function registerCommands(pluginInstance: Workbench): void {
    
    // ===========================================================================
    // COMFYUI LAUNCH COMMANDS
    // ===========================================================================
    
    /*
     * Command: Launch ComfyUI Desktop App (macOS)
     * 
     * Launches the native ComfyUI desktop application specifically for macOS systems.
     * This command is optimized for macOS and provides the most stable ComfyUI experience
     * on Apple platforms.
     */
    pluginInstance.addCommand({
        id: 'launch-comfyui-desktop-app',
        name: 'Launch ComfyUI App (macOS)',
        callback: () => {
            launchComfyUiDesktopApp(pluginInstance);
        },
    });

    /*
     * Command: Launch ComfyUI Script
     * 
     * Launches ComfyUI via the configured script or portable installation.
     * Works across platforms with proper device-specific path configuration.
     */
    pluginInstance.addCommand({
        id: 'launch-comfyui-script',
        name: 'Launch ComfyUI Script',
        callback: () => {
            launchComfyUI(pluginInstance);
        },
    });
    
    // ===========================================================================
    // SYSTEM MONITORING AND DEBUG COMMANDS
    // ===========================================================================

    /*
     * Command: Log ComfyUI State
     * 
     * Outputs comprehensive ComfyUI connection status and API state to console.
     * Useful for debugging connection issues and monitoring plugin state.
     */
    pluginInstance.addCommand({
        id: 'log-comfyui-state',
        name: 'Log ComfyUI State to Console',
        callback: () => {
            console.log('Current ComfyUI Status:', pluginInstance.currentComfyStatus);
            console.log('ComfyUI API State:', pluginInstance.comfyApi);
            new Notice('ComfyUI state logged to console');
        },
    });

    // ===========================================================================
    // WORKFLOW EXECUTION COMMANDS
    // ===========================================================================

    /*
     * Command: Run Workflow from Active File
     * 
     * Executes a ComfyUI workflow from the currently active JSON file.
     * Only available when ComfyUI is connected and a JSON workflow file is open.
     */
    pluginInstance.addCommand({
        id: 'run-comfyui-workflow-from-active-file',
        name: 'Run ComfyUI Workflow from Active File',
        checkCallback: (checking: boolean) => {
            const isComfyReady = ['Ready','Busy'].includes(pluginInstance.currentComfyStatus);
            if (!isComfyReady) return false;

            const file = pluginInstance.app.workspace.getActiveFile();
            if (!(file instanceof TFile) || file.extension !== 'json') return false;

            if (!checking) {
                console.log(`Executing workflow for: ${file.path}`);
                pluginInstance.runWorkflowFromFile(file).catch(err => {
                    console.error('Error executing workflow:', err);
                    new Notice('Failed to start workflow execution.');
                });
            }
            return true;
        },
    });
    
    // ===========================================================================
    // MODEL MANAGEMENT COMMANDS
    // ===========================================================================

    /*
     * Command: Show ComfyUI Models
     * 
     * Opens the model browser view for managing and exploring available AI models.
     * Provides access to model metadata, provider information, and note management.
     */
    pluginInstance.addCommand({
        id: 'show-comfyui-models',
        name: 'Show ComfyUI Models',
        callback: async () => {
            // Check if view is already open, if so, just reveal it
            const existingLeaves = pluginInstance.app.workspace.getLeavesOfType(MODEL_LIST_VIEW_TYPE);
            if (existingLeaves.length > 0) {
                pluginInstance.app.workspace.revealLeaf(existingLeaves[0]);
                return;
            }

            // Otherwise, open in a new leaf
            await pluginInstance.app.workspace.getLeaf(true).setViewState({
                type: MODEL_LIST_VIEW_TYPE,
                active: true,
            });
            // Ensure the new leaf is revealed
            pluginInstance.app.workspace.revealLeaf(
                pluginInstance.app.workspace.getLeavesOfType(MODEL_LIST_VIEW_TYPE)[0]
            );
        },
    });
    
    // ===========================================================================
    // INTEGRATION TESTING COMMANDS
    // ===========================================================================

    /*
     * Command: Test CivitAI Integration
     * 
     * Performs comprehensive testing of CivitAI API integration and connectivity.
     * Useful for debugging provider integration issues and validating API keys.
     */
    pluginInstance.addCommand({
        id: 'test-civitai-integration',
        name: 'Test CivitAI Integration',
        callback: async () => {
            await testCivitAIIntegration(pluginInstance.settings.civitaiApiKey);
        },
    });

    /*
     * Command: Refresh CivitAI Metadata
     * 
     * Forces a refresh of all CivitAI metadata for models in the current collection.
     * Only available when CivitAI integration is enabled in settings.
     */
    pluginInstance.addCommand({
        id: 'refresh-civitai-metadata',
        name: 'Refresh CivitAI Metadata',
        checkCallback: (checking: boolean) => {
            if (!pluginInstance.settings.enableCivitaiIntegration) return false;
            
            if (!checking) {
                // Find the model list view and refresh it with metadata
                const modelListLeaves = pluginInstance.app.workspace.getLeavesOfType(MODEL_LIST_VIEW_TYPE);
                if (modelListLeaves.length > 0) {
                    const modelListView = modelListLeaves[0].view;
                    if ('refreshWithMetadata' in modelListView && typeof modelListView.refreshWithMetadata === 'function') {
                        (modelListView as { refreshWithMetadata: () => Promise<void> }).refreshWithMetadata();
                        new Notice('Refreshing CivitAI metadata...');
                    }
                } else {
                    new Notice('No model list view open. Please open ComfyUI Models first.');
                }
            }
            return true;
        },
    });
    
    // ===========================================================================
    // RIBBON ICON SETUP
    // ===========================================================================

    /**
     * Ribbon Icon: Launch or Open ComfyUI
     * Creates a dynamic toolbar icon that provides contextual actions based on ComfyUI connection status:
     * 
     * - Disconnected/Error states: Attempts to launch ComfyUI
     * - Ready/Busy states: Opens ComfyUI web interface in browser
     * - Icon and tooltip update automatically based on current status
     * - Provides immediate visual feedback about ComfyUI availability
     */
    // Use a placeholder icon initially, it will be updated immediately by updateRibbonIcon
    const initialIcon = 'image'; // Default launch icon
    const initialTooltip = 'Loading ComfyUI Status...'; // Placeholder tooltip
    pluginInstance.ribbonIconEl = pluginInstance.addRibbonIcon(initialIcon, initialTooltip, (evt: MouseEvent) => {
        const status = pluginInstance.currentComfyStatus;
        const apiUrl = pluginInstance.settings.comfyApiUrl?.trim();

        if (status === 'Ready' || status === 'Busy') {
            // If connected, open the web UI in browser
            if (apiUrl) {
                window.open(apiUrl, '_blank');
            } else {
                new Notice("ComfyUI API URL is not set in settings.");
            }
            // Icon and tooltip updates are handled centrally by updateStatusBar -> updateRibbonIcon
        } else {
            // If disconnected, launching, connecting, or error state, attempt to launch ComfyUI
            launchComfyUI(pluginInstance);
            // Icon and tooltip updates are handled centrally by updateStatusBar -> updateRibbonIcon
        }
    });

    // Note: Icon and tooltip are updated immediately after registration in main.ts onload()
    // via updateRibbonIcon() call, so no manual initial setup is needed here
}