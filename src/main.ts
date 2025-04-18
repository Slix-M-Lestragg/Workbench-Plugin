import { Plugin } from 'obsidian';
import { WorkbenchSettings, DEFAULT_SETTINGS, SampleSettingTab } from './settings';
import { ComfyApi, ComfyStatus } from './comfy/types'; // Import types
import { setupStatusBar, updateStatusBar } from './ui/status_bar'; // Import status bar functions
import { checkComfyConnection } from './comfy/api'; // Import API functions
import { startPolling, stopPolling, pollStatus } from './comfy/polling'; // Import polling functions
import { launchComfyUiDesktopApp, launchComfyUiScript } from './comfy/launch'; // Import launch functions
import { registerCommands } from './commands'; // Import command registration

export default class Workbench extends Plugin {
    settings: WorkbenchSettings;
    comfyApi: ComfyApi | null = null;
    statusBarItemEl: HTMLElement | null = null;
    currentComfyStatus: ComfyStatus = 'Disconnected';
    pollingIntervalId: number | null = null;

    // --- Make methods needed by other modules public or pass `this` ---
    // We will pass `this` (pluginInstance) to the imported functions

    // Expose necessary methods for external modules (if needed, otherwise pass `this`)
    // Example: If settings tab needs direct access beyond passing `this`
    public startPolling = () => startPolling(this);
    public stopPolling = () => stopPolling(this);
    public launchComfyUiScript = () => launchComfyUiScript(this);
    public checkComfyConnection = () => checkComfyConnection(this);
    // updateStatusBar is imported and used directly where needed, passing `this`

    /* Lifecycle Methods */
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new SampleSettingTab(this.app, this));

        // Setup UI elements and commands by calling imported functions
        setupStatusBar(this);
        registerCommands(this);

        // Optional: Initial connection check on load (consider if needed)
        // setTimeout(() => this.checkComfyConnection(), 500);
    }

    onunload() {
        this.statusBarItemEl?.remove();
        this.stopPolling(); // Call the instance method which calls the imported function
    }

    /* Settings Methods */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Settings tab logic might call start/stopPolling directly now
    }
}
