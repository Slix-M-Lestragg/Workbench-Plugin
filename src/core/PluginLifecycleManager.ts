/**
 * Plugin Lifecycle Manager
 * 
 * Handles all plugin initialization and cleanup operations including:
 * - Configuration management setup
 * - Icon registration
 * - UI component initialization
 * - View registration
 * - Event listener setup
 * - Initial connection checks
 */

import { WorkspaceLeaf, addIcon, Menu, TFile } from 'obsidian';
import { ComfyApi } from '@saintno/comfyui-sdk';
import { setupStatusBar, updateStatusBar } from '../ui/components/status_bar';
import { registerCommands } from '../core/CommandManager';
import { JsonView } from '../ui/views/JsonViewer';
import { ModelListView } from '../ui/views/ModelListView';
import { JSON_VIEW_TYPE, MODEL_LIST_VIEW_TYPE } from '../types/ui';
import { 
    JSON_CUSTOM_ICON_NAME, 
    JSON_CUSTOM_ICON_SVG,
    CIVITAI_ICON_NAME,
    CIVITAI_ICON_SVG,
    HUGGINGFACE_ICON_NAME,
    HUGGINGFACE_ICON_SVG,
    UNKNOWN_PROVIDER_ICON_NAME,
    UNKNOWN_PROVIDER_ICON_SVG
} from '../ui/utilities/icons';

import type Workbench from './main';

export class PluginLifecycleManager {
    constructor(private plugin: Workbench) {}

    /**
     * Initialize all plugin components in the correct order
     */
    async initialize(): Promise<void> {
        this.registerCustomIcons();
        this.setupUIComponents();
        this.registerViews();
        this.registerEventListeners();
        await this.performInitialConnectionCheck();
    }

    /**
     * Register custom icons for model providers and UI elements
     */
    private registerCustomIcons(): void {
        addIcon(JSON_CUSTOM_ICON_NAME, JSON_CUSTOM_ICON_SVG);
        addIcon(CIVITAI_ICON_NAME, CIVITAI_ICON_SVG);
        addIcon(HUGGINGFACE_ICON_NAME, HUGGINGFACE_ICON_SVG);
        addIcon(UNKNOWN_PROVIDER_ICON_NAME, UNKNOWN_PROVIDER_ICON_SVG);
        console.log("Registered custom icons.");
    }

    /**
     * Setup UI components including status bar and commands
     */
    private setupUIComponents(): void {
        setupStatusBar(this.plugin);
        registerCommands(this.plugin); // This sets this.plugin.ribbonIconEl
        
        // Update ribbon icon to reflect current status after commands are registered
        // Only if ribbonIconEl was actually created
        if (this.plugin.ribbonIconEl) {
            this.plugin.updateRibbonIcon(this.plugin.currentComfyStatus);
        }
    }

    /**
     * Register custom views for JSON files and model management
     */
    private registerViews(): void {
        // Register custom view for JSON workflow files with syntax highlighting
        this.plugin.registerView(JSON_VIEW_TYPE, (leaf: WorkspaceLeaf) => new JsonView(this.plugin.app, leaf));
        this.plugin.registerExtensions(["json"], JSON_VIEW_TYPE);
        console.log(`Registered JSON view for '.json' files.`);

        // Register Model List view for browsing and managing AI models
        this.plugin.registerView(
            MODEL_LIST_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new ModelListView(leaf, this.plugin.app, this.plugin)
        );
        console.log(`Registered ComfyUI Model List view.`);
    }

    /**
     * Register event listeners for file operations
     */
    private registerEventListeners(): void {
        // Register context menu items for JSON workflow files
        this.plugin.registerEvent(this.plugin.app.workspace.on('file-menu', (menu: Menu, file) => {
            if (file instanceof TFile && file.extension === 'json') {
                this.plugin.fileMenuManager.addCopyAndOpenComfyMenuItem(menu, file);
                this.plugin.fileMenuManager.addRunWorkflowMenuItem(menu, file);
            }
        }));

        // Register file modification listener for automatic model note processing
        this.plugin.registerEvent(this.plugin.app.vault.on('modify', async (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                await this.plugin.modelNoteHandler.handleModelNoteModification(file);
            }
        }));
    }

    /**
     * Perform initial connection check with retry logic
     */
    private async performInitialConnectionCheck(): Promise<void> {
        // Perform initial connection check with retry logic after a brief delay
        setTimeout(() => {
            console.log("Performing initial ComfyUI connection check...");
            if (this.plugin.currentComfyStatus === 'Disconnected') {
                // Pass true to indicate this is the initial check
                this.plugin.checkComfyConnection().then(connected => {
                    if (connected) {
                        console.log("Initial connection successful.");
                    } else {
                        // Failure is handled within checkComfyConnection/handleConnectionFailure
                        // It will set status to Disconnected if it was a typical server offline error
                        console.log("Initial connection check indicated server is not reachable.");
                    }
                }).catch(error => {
                    // Catch unexpected errors during the check itself
                    console.error("Unexpected error during initial connection check:", error);
                    // Ensure status reflects an error in this case
                    updateStatusBar(this.plugin, 'Error', 'Initial check failed unexpectedly');
                    this.plugin.currentComfyStatus = 'Error';
                });
            } else {
                console.log(`Skipping initial connection check, status is: ${this.plugin.currentComfyStatus}`);
                if (this.plugin.settings.enablePolling && this.plugin.pollingIntervalId === null &&
                    (this.plugin.currentComfyStatus === 'Ready' || this.plugin.currentComfyStatus === 'Busy')) {
                    console.log("Restarting polling for existing connection.");
                    this.plugin.startPolling();
                }
            }
        }, 1000);
    }

    /**
     * Cleanup plugin resources
     */
    cleanup(): void {
        console.log("Unloading Workbench plugin.");
        this.plugin.statusBarItemEl?.remove();
        this.plugin.stopPolling();
        
        if (this.plugin.comfyApi) {
            try {
                const comfyApiWithClose = this.plugin.comfyApi as ComfyApi & { close?: () => void };
                if (typeof comfyApiWithClose.close === 'function') {
                    comfyApiWithClose.close();
                    console.log("Closed ComfyUI WebSocket connection on unload.");
                }
            } catch (e) {
                console.warn("Error closing ComfyUI connection on unload:", e);
            }
            this.plugin.comfyApi = null;
        }
    }
}
