// Imports
// -------------------------
import { Plugin, TFile, Menu, Notice, WorkspaceLeaf, addIcon, App } from 'obsidian'; // [obsidian](https://help.obsidian.md)
import {
    WorkbenchSettings,
    DEFAULT_SETTINGS,
    SampleSettingTab,
    OperatingSystem,
    DeviceSpecificSettings,
    DEFAULT_DEVICE_SETTINGS,
    getCurrentOS, // from [src/settings.ts](src/settings.ts)
    ComfyInstallType
} from './settings';
import { ComfyStatus, SystemStats, QueueInfo } from './comfy/types'; // from [src/comfy/types.ts](src/comfy/types.ts)
import { ComfyApi } from '@saintno/comfyui-sdk';
import { setupStatusBar, updateStatusBar } from './ui/status_bar'; // from [src/ui/status_bar.ts](src/ui/status_bar.ts)
import { checkComfyConnection, fetchSystemStats, fetchQueueInfo } from './comfy/api'; // from [src/comfy/api.ts](src/comfy/api.ts)
import { startPolling, stopPolling } from './comfy/polling'; // from [src/comfy/polling.ts](src/comfy/polling.ts)
import { launchComfyUI } from './comfy/launch'; // from [src/comfy/launch.ts](src/comfy/launch.ts)
import { registerCommands } from './commands'; // from [src/commands.ts](src/commands.ts)
import { runWorkflow } from './comfy/generation'; // from [src/comfy/generation.ts](src/comfy/generation.ts)
import { JsonView, JSON_VIEW_TYPE } from './ui/JsonViewer'; // from [src/ui/JsonViewer.ts](src/ui/JsonViewer.ts)
import { JSON_CUSTOM_ICON_NAME, JSON_CUSTOM_ICON_SVG } from './ui/icons'; // from [src/ui/icons.ts](src/ui/icons.ts)

// Main Plugin Class: Workbench
// -------------------------
export default class Workbench extends Plugin {
    // Plugin settings and connection state
    settings: WorkbenchSettings;
    comfyApi: ComfyApi | null = null;
    statusBarItemEl: HTMLElement | null = null;
    currentComfyStatus: ComfyStatus = 'Disconnected';
    pollingIntervalId: number | null = null;
    pollingRetryCount: number = 0;
    pollingRetryTimeoutId: number | null = null;
    app: App; // Provided by obsidian
    currentOS: OperatingSystem; // Determined on load

    // Crystools / System monitoring properties
    latestSystemStats: SystemStats | null = null;
    systemMonitorListener: ((ev: CustomEvent<any>) => void) | null = null;

    // Workflow execution progress properties
    currentRunningPromptId: string | null = null;
    currentProgressValue: number | null = null;
    currentProgressMax: number | null = null;
    progressListener: ((ev: CustomEvent<any>) => void) | null = null;

    
// Public Methods Exposed to Other Modules
// -------------------------
    public startPolling = () => startPolling(this);
    public stopPolling = () => stopPolling(this);
    public launchComfyUI = () => launchComfyUI(this);
    public checkComfyConnection = () => checkComfyConnection(this);
    public runWorkflowFromFile = (file: TFile) => this.executeWorkflowFromFile(file);


// Helper Methods
// -------------------------
    /** Merges device-specific settings with default values.
     * @returns A DeviceSpecificSettings object for the current OS.
     */
    public getCurrentDeviceSettings(): DeviceSpecificSettings {
        const osSettings = this.settings.deviceSettings?.[this.currentOS] ?? {};
        return {
            ...DEFAULT_DEVICE_SETTINGS,
            ...osSettings
        };
    }

    /** Fetch system statistics using the API.
     */
    public async getSystemStats(): Promise<SystemStats | null> {
        if (!this.comfyApi || this.currentComfyStatus === 'Disconnected' || this.currentComfyStatus === 'Error') {
            console.log("Cannot fetch system stats, ComfyUI not connected.");
            return null;
        }
        try {
            console.log("1. Fetching system stats from main...", this.comfyApi);
            return await fetchSystemStats(this);
        } catch (error) {
            console.error("Error fetching system stats from main:", error);
            return null;
        }
    }

    /** Fetch the current queue information from the API.
     */
    public async getQueueInfo(): Promise<QueueInfo | null> {
        if (!this.comfyApi || this.currentComfyStatus === 'Disconnected' || this.currentComfyStatus === 'Error') {
            console.log("Cannot fetch queue info, ComfyUI not connected.");
            return null;
        }
        try {
            return await fetchQueueInfo(this);
        } catch (error) {
            console.error("Error fetching queue info from main:", error);
            return null;
        }
    }

    // Lifecycle Methods
    // -------------------------
    async onload() {
        // Initialize OS and settings
        this.app = this.app;
        this.currentOS = getCurrentOS();
        await this.loadSettings();
        this.addSettingTab(new SampleSettingTab(this.app, this));

        // Register custom JSON icon
        addIcon(JSON_CUSTOM_ICON_NAME, JSON_CUSTOM_ICON_SVG);
        console.log("Registered custom JSON icon.");

        // Initialize status bar and commands
        setupStatusBar(this);
        registerCommands(this);

        // Register the custom JSON view for .json files
        this.registerView(JSON_VIEW_TYPE, (leaf: WorkspaceLeaf) => new JsonView(this.app, leaf));
        this.registerExtensions(["json"], JSON_VIEW_TYPE);
        console.log(`Registered JSON view for '.json' files.`);

        // Register file-menu items for JSON files
        this.registerEvent(this.app.workspace.on('file-menu', (menu: Menu, file) => {
            if (file instanceof TFile && file.extension === 'json') {
                this.addCopyAndOpenComfyMenuItem(menu, file);
                this.addRunWorkflowMenuItem(menu, file);
            }
        }));

        // Initial connection check after a delay
        setTimeout(() => {
            console.log("Performing initial ComfyUI connection check...");
            if (this.currentComfyStatus === 'Disconnected') {
                // Pass true to indicate this is the initial check
                this.checkComfyConnection().then(connected => {
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
                    updateStatusBar(this, 'Error', 'Initial check failed unexpectedly');
                    this.currentComfyStatus = 'Error';
                });
            } else {
                console.log(`Skipping initial connection check, status is: ${this.currentComfyStatus}`);
                if (this.settings.enablePolling && this.pollingIntervalId === null &&
                    (this.currentComfyStatus === 'Ready' || this.currentComfyStatus === 'Busy')) {
                    console.log("Restarting polling for existing connection.");
                    this.startPolling();
                }
            }
        }, 1000);
    }

    
// File Menu Helpers
// -------------------------
    /** Add "Copy Workflow & Open ComfyUI" item to the file menu.
     * @param menu The current file menu reference.
     * @param file The JSON file.
     */
    addCopyAndOpenComfyMenuItem(menu: Menu, file: TFile) {
        const apiUrlString = this.settings.comfyApiUrl?.trim();
        if (apiUrlString) {
            menu.addItem((item) => {
                item.setTitle("Copy Workflow & Open ComfyUI")
                    .setIcon("copy-plus")
                    .onClick(async () => {
                        if (this.settings.comfyApiUrl) {
                            try {
                                const workflowJson = await this.app.vault.read(file);
                                await navigator.clipboard.writeText(workflowJson);
                                window.open(this.settings.comfyApiUrl, '_blank');
                                new Notice(`Workflow '${file.name}' copied! Paste it into ComfyUI (Cmd/Ctrl+V).`);
                            } catch (error) {
                                console.error("Error copying workflow or opening ComfyUI:", error);
                                new Notice(`Failed to copy workflow: ${error instanceof Error ? error.message : String(error)}`);
                            }
                        } else {
                            new Notice("ComfyUI API URL is not set in settings.");
                        }
                    });
            });
        }
    }

    /** Add "Run ComfyUI Workflow" item to the file menu.
     * @param menu The current file menu reference.
     * @param file The JSON file.
     */
    addRunWorkflowMenuItem(menu: Menu, file: TFile) {
        if (this.currentComfyStatus === 'Ready' || this.currentComfyStatus === 'Busy') {
            menu.addItem((item) => {
                item.setTitle("Run ComfyUI Workflow")
                    .setIcon("play-circle")
                    .onClick(async () => {
                        await this.executeWorkflowFromFile(file);
                    });
            });
        } else if (this.currentComfyStatus !== 'Disconnected' && this.currentComfyStatus !== 'Error') {
            menu.addItem((item) => {
                item.setTitle("Run ComfyUI Workflow (ComfyUI not ready)")
                    .setIcon("play-circle")
                    .setDisabled(true);
            });
        }
    }

    /** Execute a ComfyUI workflow from a JSON file.
     * @param file The JSON file.
     */
    async executeWorkflowFromFile(file: TFile) {
        if (!this.comfyApi || (this.currentComfyStatus !== 'Ready' && this.currentComfyStatus !== 'Busy')) {
            new Notice('ComfyUI is not connected or ready. Please check connection.');
            return;
        }
        try {
            new Notice(`Loading workflow: ${file.name}`);
            const workflowJson = await this.app.vault.read(file);
            const workflowData = JSON.parse(workflowJson);
            console.log(`Running workflow from file: ${file.path}`);
            updateStatusBar(this, 'Busy', `Running workflow: ${file.name}`);
            await runWorkflow(this, workflowData);
        } catch (error) {
            console.error(`Error running workflow from ${file.path}:`, error);
            new Notice(`Failed to run workflow: ${error instanceof Error ? error.message : String(error)}`);
            updateStatusBar(this, 'Error', 'Workflow execution failed.');
        }
    }


// Unload and Cleanup
// -------------------------
    onunload() {
        console.log("Unloading Workbench plugin.");
        this.statusBarItemEl?.remove();
        this.stopPolling();
        if (this.comfyApi) {
            try {
                if (typeof (this.comfyApi as any).close === 'function') {
                    (this.comfyApi as any).close();
                    console.log("Closed ComfyUI WebSocket connection on unload.");
                }
            } catch (e) {
                console.warn("Error closing ComfyUI connection on unload:", e);
            }
            this.comfyApi = null;
        }
    }


// Settings Methods
// -------------------------
    /** Loads settings from disk, merging saved data with defaults.
     */
    async loadSettings() {
        const loadedData = await this.loadData();
        const mergedSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

        // Merge top-level settings
        for (const key in mergedSettings) {
            if (key !== 'deviceSettings' && loadedData && loadedData.hasOwnProperty(key)) {
                (mergedSettings as any)[key] = loadedData[key];
            }
        }

        // Merge device-specific settings
        mergedSettings.deviceSettings = mergedSettings.deviceSettings || {};
        for (const osKey of Object.keys(DEFAULT_SETTINGS.deviceSettings) as OperatingSystem[]) {
            const defaultOsSettings = DEFAULT_SETTINGS.deviceSettings[osKey] || {};
            const savedOsSettings = loadedData?.deviceSettings?.[osKey] ?? {};
            mergedSettings.deviceSettings[osKey] = { ...defaultOsSettings, ...savedOsSettings };
        }

        this.settings = mergedSettings;

        // Migrate old top-level comfyUiPath if present
        if (loadedData && loadedData.hasOwnProperty('comfyUiPath') && typeof loadedData.comfyUiPath === 'string') {
            console.log(`Migrating old top-level 'comfyUiPath' setting for OS: ${this.currentOS}`);
            if (!this.settings.deviceSettings[this.currentOS]) {
                this.settings.deviceSettings[this.currentOS] = {};
            }
            if (!this.settings.deviceSettings[this.currentOS].comfyUiPath) {
                this.settings.deviceSettings[this.currentOS].comfyUiPath = loadedData.comfyUiPath;
            }
        }
        if (loadedData && loadedData.hasOwnProperty('comfyInstallType') && typeof loadedData.comfyInstallType === 'string') {
            console.log(`Migrating old top-level 'comfyInstallType' setting for OS: ${this.currentOS}`);
            if (!this.settings.deviceSettings[this.currentOS]) {
                this.settings.deviceSettings[this.currentOS] = {};
            }
            if (!this.settings.deviceSettings[this.currentOS].comfyInstallType) {
                this.settings.deviceSettings[this.currentOS].comfyInstallType = loadedData.comfyInstallType as ComfyInstallType;
            }
        }
    }

    /** Saves settings back to disk.
     */
    async saveSettings() {
        const settingsToSave = { ...this.settings };
        if (settingsToSave.hasOwnProperty('comfyUiPath')) {
            delete (settingsToSave as any).comfyUiPath;
        }
        if (settingsToSave.hasOwnProperty('comfyInstallType')) {
            delete (settingsToSave as any).comfyInstallType;
        }
        await this.saveData(settingsToSave);
    }
}
