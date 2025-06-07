/** 
 * Main entry point for the Workbench Plugin
 * 
 * This file contains the core plugin class that manages:
 * - ComfyUI connection and API integration
 * - Model management and metadata enrichment
 * - UI components (status bar, ribbon, views)
 * - Cross-platform device settings
 * - File menu integration and workflow execution
 */


// ===========================================================================
// IMPORTS
// ===========================================================================
// Core Obsidian imports for plugin functionality
    import { Plugin, TFile } from 'obsidian';

// Configuration management
    import { ConfigManager } from './ConfigManager';

// Settings and configuration management
    import {
        WorkbenchSettings,
        SampleSettingTab,
        OperatingSystem,
        DeviceSpecificSettings,
        getCurrentOS
    } from './settings';

// Type definitions for ComfyUI integration
    import { ComfyStatus, SystemStats, QueueInfo } from '../types/comfy';
    import { ComfyApi } from '@saintno/comfyui-sdk';

// Manager classes for organized functionality
    import { PluginLifecycleManager } from './PluginLifecycleManager';
    import { ConnectionManager } from '../services/ConnectionManager';
    import { UIStateManager } from '../ui/UIStateManager';
    import { FileMenuManager } from '../ui/FileMenuManager';
    import { ModelNoteHandler } from '../services/ModelNoteHandler';



// ===========================================================================
// MAIN PLUGIN CLASS
// ===========================================================================

/* Workbench Plugin - Main class that orchestrates all plugin functionality
 * 
 * This class serves as the central coordinator for:
 * - ComfyUI integration and connection management
 * - Model metadata enrichment and provider integration  
 * - Cross-platform settings and device-specific configurations
 * - UI components including status bar, ribbon icon, and custom views
 * - File menu integration for workflow execution
 * - System monitoring and real-time status updates
 */
export default class Workbench extends Plugin {
// ===========================================================================
// CORE PLUGIN STATE
// ===========================================================================
    
    /** Configuration manager for centralized settings handling */
    configManager: ConfigManager;
    
    /** Plugin configuration and user settings */
    settings: WorkbenchSettings;
    
    /** ComfyUI API client instance for communication */
    comfyApi: ComfyApi | null = null;
    
    /** Reference to the status bar element for updates */
    statusBarItemEl: HTMLElement | null = null;
    
    /** Reference to the ribbon icon element for dynamic updates */
    ribbonIconEl: HTMLElement | null = null;
    
    /** Current connection status with ComfyUI server */
    currentComfyStatus: ComfyStatus = 'Disconnected';
    
    /** Operating system detected at plugin load time */
    currentOS: OperatingSystem;

    // Manager instances for organized functionality
    public lifecycleManager: PluginLifecycleManager;
    public connectionManager: ConnectionManager;
    public uiStateManager: UIStateManager;
    public fileMenuManager: FileMenuManager;
    public modelNoteHandler: ModelNoteHandler;


// ===========================================================================
// POLLING AND MONITORING STATE
// ===========================================================================
    
    /** Interval ID for periodic connection polling */
    pollingIntervalId: number | null = null;
    
    /** Counter for consecutive polling failures */
    pollingRetryCount = 0;
    
    /** Timeout ID for delayed polling retry attempts */
    pollingRetryTimeoutId: number | null = null;
    

// ===========================================================================
// SYSTEM MONITORING STATE
// ===========================================================================
    
    /** Latest system statistics from ComfyUI (CPU, RAM, GPU) */
    latestSystemStats: SystemStats | null = null;
    
    /** Event listener for system monitoring updates */
    systemMonitorListener: ((ev: CustomEvent<unknown>) => void) | null = null;


// ===========================================================================
// WORKFLOW EXECUTION STATE
// ===========================================================================
    
    /** Currently executing workflow prompt ID */
    currentRunningPromptId: string | null = null;
    
    /** Current progress value for workflow execution */
    currentProgressValue: number | null = null;
    
    /** Maximum progress value for current workflow */
    currentProgressMax: number | null = null;
    
    /** Event listener for workflow progress updates */
    progressListener: ((ev: CustomEvent<unknown>) => void) | null = null;


// ===========================================================================
// PUBLIC API METHODS (Delegated to Managers)
// ===========================================================================
    
    /* Delegated method for starting ComfyUI connection polling */
    public startPolling = () => this.connectionManager.startPolling();
    
    /* Delegated method for stopping ComfyUI connection polling */
    public stopPolling = () => this.connectionManager.stopPolling();
    
    /* Delegated method for launching ComfyUI application */
    public launchComfyUI = () => this.connectionManager.launchComfyUI();
    
    /* Delegated method for checking ComfyUI connection status */
    public checkComfyConnection = () => this.connectionManager.checkConnection();
    
    /* Delegated method for executing workflows from files */
    public runWorkflowFromFile = (file: TFile) => this.fileMenuManager.executeWorkflowFromFile(file);

    /* Updates the ribbon icon based on the current ComfyUI connection status */
    public updateRibbonIcon = (status: ComfyStatus) => this.uiStateManager.updateRibbonIcon(status);


// ===========================================================================
// DEVICE AND SYSTEM CONFIGURATION METHODS  
// ===========================================================================
    
    /* Merges device-specific settings with default values for the current operating system */
    public getCurrentDeviceSettings(): DeviceSpecificSettings {
        return this.configManager.getCurrentDeviceSettings();
    }


// ===========================================================================
// SYSTEM MONITORING AND API METHODS (Delegated to ConnectionManager)
// ===========================================================================
    
    /* Fetch current system statistics from ComfyUI server */
    public async getSystemStats(): Promise<SystemStats | null> {
        return this.connectionManager.getSystemStats();
    }

    /* Fetch current queue information from ComfyUI server */
    public async getQueueInfo(): Promise<QueueInfo | null> {
        return this.connectionManager.getQueueInfo();
    }


// ===========================================================================
// PLUGIN LIFECYCLE METHODS
// ===========================================================================
    
    /* Plugin initialization method called when the plugin is loaded */
    async onload() {
        // Initialize core plugin state
        this.currentOS = getCurrentOS();
        this.configManager = new ConfigManager(this);
        await this.configManager.initialize();
        this.settings = this.configManager.getSettings();
        this.addSettingTab(new SampleSettingTab(this.app, this));

        // Initialize managers
        this.lifecycleManager = new PluginLifecycleManager(this);
        this.connectionManager = new ConnectionManager(this);
        this.uiStateManager = new UIStateManager(this);
        this.fileMenuManager = new FileMenuManager(this);
        this.modelNoteHandler = new ModelNoteHandler(this);

        // Delegate initialization to lifecycle manager
        await this.lifecycleManager.initialize();
    }

    /* Plugin cleanup method called when the plugin is unloaded */
    onunload() {
        this.lifecycleManager?.cleanup();
        this.connectionManager?.stopPolling();
    }


// ===========================================================================
// SETTINGS PERSISTENCE METHODS
// ===========================================================================
    
    /* Load user settings using ConfigManager */
    async loadSettings() {
        await this.configManager.loadSettings();
        this.settings = this.configManager.getSettings();
    }

    /* Save current settings using ConfigManager */
    async saveSettings() {
        await this.configManager.saveSettings();
        this.settings = this.configManager.getSettings();
        
        // Update model list views when settings change
        this.uiStateManager.updateModelListViewSettings();
    }
}
