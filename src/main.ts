import { Plugin, TFile, Menu, Notice, WorkspaceLeaf, addIcon } from 'obsidian'; // Added WorkspaceLeaf and addIcon
import { WorkbenchSettings, DEFAULT_SETTINGS, SampleSettingTab } from './settings';
import { ComfyStatus } from './comfy/types';
import { ComfyApi } from '@saintno/comfyui-sdk';
import { setupStatusBar, updateStatusBar } from './ui/status_bar';
import { checkComfyConnection } from './comfy/api';
import { startPolling, stopPolling } from './comfy/polling';
import { launchComfyUiDesktopApp, launchComfyUiScript } from './comfy/launch';
import { registerCommands } from './commands';
import { runWorkflow } from './comfy/generation';
import { JsonView, JSON_VIEW_TYPE } from './ui/JsonViewer'; // <-- Import JsonView
import { JSON_CUSTOM_ICON_NAME, JSON_CUSTOM_ICON_SVG } from './ui/icons'; // <-- Import icon constants

export default class Workbench extends Plugin {
    settings: WorkbenchSettings;
    comfyApi: ComfyApi | null = null;
    statusBarItemEl: HTMLElement | null = null;
    currentComfyStatus: ComfyStatus = 'Disconnected';
    pollingIntervalId: number | null = null;
    pollingRetryCount: number = 0;
    pollingRetryTimeoutId: number | null = null;

    // --- Public methods for modules ---
    // Expose methods needed by other modules
    public startPolling = () => startPolling(this);
    public stopPolling = () => stopPolling(this);
    public launchComfyUiScript = () => launchComfyUiScript(this);
    public launchComfyUiDesktopApp = () => launchComfyUiDesktopApp(this);
    // checkComfyConnection is called internally or via status bar click
    // pollStatus is primarily used internally by polling.ts and api.ts
    // Make checkComfyConnection public if commands need to trigger it directly
    public checkComfyConnection = () => checkComfyConnection(this);


    /* Lifecycle Methods */
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new SampleSettingTab(this.app, this));

        // --- Register Custom JSON Icon ---
        addIcon(JSON_CUSTOM_ICON_NAME, JSON_CUSTOM_ICON_SVG);
        console.log("Registered custom JSON icon.");

        setupStatusBar(this); // Sets up the status bar element and click handler
        registerCommands(this);

        // --- Register JSON View ---
        this.registerView(
            JSON_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new JsonView(this.app, leaf) // Pass app instance
            // Icon is set in the JsonView class via getIcon()
        );
        this.registerExtensions(["json"], JSON_VIEW_TYPE);
        console.log(`Registered JSON view for '.json' files.`);

        // --- Register File Menu Event Handler ---
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file) => {
                if (file instanceof TFile && file.extension === 'json') {
                    // Check if the file might be a ComfyUI workflow
                    // This is a basic check; a more robust check might involve reading content
                    // For now, we add the item if it's a JSON file.
                    this.addWorkflowMenuItem(menu, file);

                    // Optional: Prevent default Obsidian opening if needed, though
                    // registerExtensions should handle opening in our view.
                    // menu.removeItem('open'); // Example if needed
                }
            })
        );

        // --- Initial Connection Check ---
        setTimeout(() => {
            console.log("Performing initial ComfyUI connection check...");
            if (this.currentComfyStatus === 'Disconnected') {
                 // Don't await, let it run in the background
                 this.checkComfyConnection().then(connected => {
                     if (connected) {
                         console.log("Initial connection successful.");
                         // Polling is started by checkComfyConnection/handleConnectionSuccess if enabled
                     } else {
                         console.log("Initial connection failed.");
                         // Status bar should reflect Error or Disconnected state
                     }
                 }).catch(error => {
                     // This catch is unlikely needed as the promise resolves true/false
                     console.error("Unexpected error during initial connection check:", error);
                 });
            } else {
                 console.log(`Skipping initial connection check, status is: ${this.currentComfyStatus}`);
                 // If already connected but polling is off, start it
                 if (this.settings.enablePolling && this.pollingIntervalId === null && (this.currentComfyStatus === 'Ready' || this.currentComfyStatus === 'Busy')) {
                     console.log("Restarting polling for existing connection.");
                     this.startPolling();
                 }
            }
        }, 1500);
    }

    // Helper function to add the menu item
    addWorkflowMenuItem(menu: Menu, file: TFile) {
        menu.addItem((item) => {
            item
                .setTitle("Run ComfyUI Workflow")
                .setIcon("play-circle")
                .onClick(async () => {
                    if (!this.comfyApi || (this.currentComfyStatus !== 'Ready' && this.currentComfyStatus !== 'Busy')) {
                        new Notice('ComfyUI is not connected or ready. Please check connection.');
                        // Optionally trigger a connection check here?
                        // await this.checkComfyConnection();
                        return;
                    }
                    try {
                        new Notice(`Loading workflow: ${file.name}`);
                        const workflowJson = await this.app.vault.read(file);
                        const workflowData = JSON.parse(workflowJson);

                        console.log(`Running workflow from file: ${file.path}`);
                        updateStatusBar(this, 'Busy', `Running workflow: ${file.name}`); // Update status
                        await runWorkflow(this, workflowData);
                        // Assuming runWorkflow doesn't update status on completion,
                        // pollStatus will eventually correct it, or update manually:
                        // updateStatusBar(this, 'Ready', 'Workflow finished.');

                    } catch (error) {
                        console.error(`Error running workflow from ${file.path}:`, error);
                        new Notice(`Failed to run workflow: ${error instanceof Error ? error.message : String(error)}`);
                        updateStatusBar(this, 'Error', 'Workflow execution failed.');
                    }
                });
        });
    }


    onunload() {
        console.log("Unloading Workbench plugin.");
        this.statusBarItemEl?.remove();
        this.stopPolling();
        // Clean up SDK instance
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

    /* Settings Methods */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
