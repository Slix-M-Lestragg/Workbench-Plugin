import { Plugin, TFile, Menu, Notice, WorkspaceLeaf, addIcon, App } from 'obsidian'; // Added App
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
    app: App; // Ensure app is accessible if not already

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
    public runWorkflowFromFile = (file: TFile) => this.executeWorkflowFromFile(file); // Expose the execution method


    /* Lifecycle Methods */
    async onload() {
        this.app = this.app; // Ensure app is assigned if needed elsewhere, Obsidian usually handles this
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
                    // Add the "Copy Workflow & Open ComfyUI" menu item
                    this.addCopyAndOpenComfyMenuItem(menu, file); // Renamed function
                    // Add the "Run Workflow" menu item (conditionally)
                    this.addRunWorkflowMenuItem(menu, file);
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

    // Helper function to add the "Copy Workflow & Open ComfyUI" menu item
    addCopyAndOpenComfyMenuItem(menu: Menu, file: TFile) { // Renamed function
        const apiUrlString = this.settings.comfyApiUrl?.trim();
        if (apiUrlString) {
            menu.addItem((item) => {
                item
                    .setTitle("Copy Workflow & Open ComfyUI") // Updated title
                    .setIcon("copy-plus") // Changed icon to reflect copy action
                    .onClick(async () => { // Make async to read file
                        if (this.settings.comfyApiUrl) {
                            try {
                                // 1. Read the workflow file content
                                const workflowJson = await this.app.vault.read(file);

                                // 2. Copy to clipboard
                                await navigator.clipboard.writeText(workflowJson);

                                // 3. Open the base ComfyUI URL in a new tab
                                window.open(this.settings.comfyApiUrl, '_blank');

                                // 4. Notify user
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


    // Renamed the original function to clarify its purpose
    addRunWorkflowMenuItem(menu: Menu, file: TFile) {
        // Only add the "Run" option if ComfyUI is Ready or Busy
        if (this.currentComfyStatus === 'Ready' || this.currentComfyStatus === 'Busy') {
            menu.addItem((item) => {
                item
                    .setTitle("Run ComfyUI Workflow")
                    .setIcon("play-circle") // Keep the play icon for execution
                    .onClick(async () => {
                        // Call the execution method
                        await this.executeWorkflowFromFile(file);
                    });
            });
        } else if (this.currentComfyStatus !== 'Disconnected' && this.currentComfyStatus !== 'Error') {
            // Add a disabled "Run" option if connecting/launching
             menu.addItem((item) => {
                item
                    .setTitle("Run ComfyUI Workflow (ComfyUI not ready)")
                    .setIcon("play-circle")
                    .setDisabled(true);
             });
        }
    }

    // Method to execute a workflow from a file (used by command and Run menu item)
    async executeWorkflowFromFile(file: TFile) {
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
            // pollStatus will eventually correct it, or update manually if needed.
            // Consider adding a success notice here if runWorkflow doesn't provide one.
            // new Notice(`Workflow ${file.name} execution started.`);

        } catch (error) {
            console.error(`Error running workflow from ${file.path}:`, error);
            new Notice(`Failed to run workflow: ${error instanceof Error ? error.message : String(error)}`);
            updateStatusBar(this, 'Error', 'Workflow execution failed.');
        }
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
