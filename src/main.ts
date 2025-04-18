import { Plugin } from 'obsidian';
import { WorkbenchSettings, DEFAULT_SETTINGS, SampleSettingTab } from './settings';
import { ComfyApi, ComfyStatus } from './comfy/types';
import { setupStatusBar, updateStatusBar } from './ui/status_bar';
import { checkComfyConnection } from './comfy/api';
import { startPolling, stopPolling, pollStatus } from './comfy/polling';
import { launchComfyUiDesktopApp, launchComfyUiScript } from './comfy/launch';
import { registerCommands } from './commands';

export default class Workbench extends Plugin {
    settings: WorkbenchSettings;
    comfyApi: ComfyApi | null = null;
    statusBarItemEl: HTMLElement | null = null;
    currentComfyStatus: ComfyStatus = 'Disconnected';
    pollingIntervalId: number | null = null;
    pollingRetryCount: number = 0; // <-- Add retry counter
    pollingRetryTimeoutId: number | null = null; // <-- Add retry timeout ID

    // --- Public methods for modules ---
    public startPolling = () => startPolling(this);
    public stopPolling = () => stopPolling(this);
    public launchComfyUiScript = () => launchComfyUiScript(this);
    public launchComfyUiDesktopApp = () => launchComfyUiDesktopApp(this); // Added missing public method
    public checkComfyConnection = () => checkComfyConnection(this);
    // updateStatusBar is imported and used directly where needed, passing `this`
    public pollStatus = () => pollStatus(this); // Expose pollStatus if needed by retry logic

    /* Lifecycle Methods */
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new SampleSettingTab(this.app, this));

        setupStatusBar(this);
        registerCommands(this);

        setTimeout(() => {
            console.log("Performing initial ComfyUI connection check...");
            if (this.currentComfyStatus === 'Disconnected') {
                 this.checkComfyConnection();
            }
        }, 1500);
    }

    onunload() {
        this.statusBarItemEl?.remove();
        this.stopPolling(); // stopPolling will now also clear retry timeouts
    }

    /* Settings Methods */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Settings changes might affect polling/retries, handled in settings tab for now
    }
}
