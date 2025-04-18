import { App, PluginSettingTab, Setting } from 'obsidian';
import type Workbench from './main';

export interface WorkbenchSettings {
    comfyApiUrl: string;
    comfyUiPath: string;
    comfyLaunchFile: {
        windows: string;
        mac: string;
    };
    enablePolling: boolean;
    pollingIntervalSeconds: number;
    launchCheckDelaySeconds: number;
    enablePollingRetry: boolean; // <-- Add this
    pollingRetryAttempts: number; // <-- Add this
    pollingRetryDelaySeconds: number; // <-- Add this
}

export const DEFAULT_SETTINGS: WorkbenchSettings = {
    comfyApiUrl: 'http://127.0.0.1:8188',
    comfyUiPath: '',
    comfyLaunchFile: {
        windows: 'run_nvidia_gpu.bat',
        mac: 'run_mac.sh'
    },
    enablePolling: true,
    pollingIntervalSeconds: 5,
    launchCheckDelaySeconds: 5,
    enablePollingRetry: true, // <-- Add default
    pollingRetryAttempts: 3, // <-- Add default
    pollingRetryDelaySeconds: 10, // <-- Add default
}

export class SampleSettingTab extends PluginSettingTab {
    plugin: Workbench;

    constructor(app: App, plugin: Workbench) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();
        containerEl.createEl('h2', {text: 'Workbench Settings'});

        // Add the general settings
        new Setting(containerEl)
            .setName('ComfyUI Base Directory')
            .setDesc('Path to the root ComfyUI directory')
            .addText(text => text
                .setPlaceholder('e.g., K:\\programs\\ComfyUI')
                .setValue(this.plugin.settings.comfyUiPath)
                .onChange(async (value) => {
                    this.plugin.settings.comfyUiPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('ComfyUI API URL')
            .setDesc('URL for the ComfyUI web interface')
            .addText(text => text
                .setPlaceholder('http://localhost:8188')
                .setValue(this.plugin.settings.comfyApiUrl)
                .onChange(async (value) => {
                    this.plugin.settings.comfyApiUrl = value;
                    await this.plugin.saveSettings();
                    // Optionally trigger a connection check if the URL changes
                    // await this.plugin.checkComfyConnection(); // Consider UX implications
                }));

        // Platform-specific launch file setting
        const platform = window.navigator.platform.toLowerCase();
        if (platform.includes('win')) {
            new Setting(containerEl)
                .setName('Windows Launch File')
                .setDesc('Name of the batch file to launch ComfyUI (relative to base directory)')
                .addText(text => text
                    .setPlaceholder('run_nvidia_gpu.bat') // Example placeholder
                    .setValue(this.plugin.settings.comfyLaunchFile.windows)
                    .onChange(async (value) => {
                        this.plugin.settings.comfyLaunchFile.windows = value;
                        await this.plugin.saveSettings();
                    }));
        } else { // Assume Mac or Linux-like default
            new Setting(containerEl)
                .setName('Mac/Linux Launch File')
                .setDesc('Name of the shell script to launch ComfyUI (relative to base directory)')
                .addText(text => text
                    .setPlaceholder('run_mac.sh') // Example placeholder
                    .setValue(this.plugin.settings.comfyLaunchFile.mac)
                    .onChange(async (value) => {
                        this.plugin.settings.comfyLaunchFile.mac = value;
                        await this.plugin.saveSettings();
                    }));
        }

        new Setting(containerEl)
            .setName('Launch ComfyUI')
            .setDesc('Start ComfyUI using the configured script')
            .addButton(button => button
                .setButtonText('Launch Script')
                .setCta()
                .onClick(() => {
                    // Call the method on the plugin instance
                    this.plugin.launchComfyUiScript();
                }));

        // Add setting for launch delay
        new Setting(containerEl)
            .setName('Launch Connection Check Delay (seconds)')
            .setDesc('How long to wait after launching ComfyUI before checking the API connection.')
            .addText(text => text
                .setPlaceholder('e.g., 5')
                .setValue(this.plugin.settings.launchCheckDelaySeconds.toString())
                .onChange(async (value) => {
                    let delay = parseInt(value || '5', 10);
                    if (isNaN(delay) || delay < 1) {
                        delay = 5; // Ensure a minimum delay
                    }
                    this.plugin.settings.launchCheckDelaySeconds = delay;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Status Polling' });

        new Setting(containerEl)
            .setName('Enable Status Polling')
            .setDesc('Periodically check ComfyUI status via API calls.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enablePolling)
                .onChange(async (value) => {
                    this.plugin.settings.enablePolling = value;
                    await this.plugin.saveSettings();
                    // Use plugin instance methods
                    if (value && this.plugin.currentComfyStatus === 'Ready') {
                        this.plugin.startPolling();
                    } else {
                        this.plugin.stopPolling();
                    }
                }));

        new Setting(containerEl)
            .setName('Polling Interval (seconds)')
            .setDesc('How often to check the ComfyUI status (minimum 2 seconds).')
            .addText(text => text
                .setPlaceholder('e.g., 5')
                .setValue(this.plugin.settings.pollingIntervalSeconds.toString())
                .onChange(async (value) => {
                    let interval = parseInt(value || '5', 10);
                    if (isNaN(interval) || interval < 2) {
                        interval = 2;
                    }
                    this.plugin.settings.pollingIntervalSeconds = interval;
                    await this.plugin.saveSettings();
                    // Restart polling with the new interval if it's currently active and enabled
                    if (this.plugin.settings.enablePolling && (this.plugin.currentComfyStatus === 'Ready' || this.plugin.currentComfyStatus === 'Busy')) {
                         this.plugin.startPolling(); // Restart polling
                    }
                }));

        // --- Add Polling Retry Settings ---
        new Setting(containerEl)
            .setName('Enable Polling Retry on Error')
            .setDesc('If polling fails (e.g., server temporarily unavailable), automatically retry a few times before stopping.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enablePollingRetry)
                .onChange(async (value) => {
                    this.plugin.settings.enablePollingRetry = value;
                    await this.plugin.saveSettings();
                    // Reset retry count if retries are disabled
                    if (!value) {
                        this.plugin.pollingRetryCount = 0;
                        if (this.plugin.pollingRetryTimeoutId) {
                            clearTimeout(this.plugin.pollingRetryTimeoutId);
                            this.plugin.pollingRetryTimeoutId = null;
                        }
                    }
                    this.display(); // Refresh display to show/hide dependent settings
                }));

        // Only show retry attempts/delay if retry is enabled
        if (this.plugin.settings.enablePollingRetry) {
            new Setting(containerEl)
                .setName('Polling Retry Attempts')
                .setDesc('How many times to retry polling after an error.')
                .addText(text => text
                    .setPlaceholder('e.g., 3')
                    .setValue(this.plugin.settings.pollingRetryAttempts.toString())
                    .onChange(async (value) => {
                        let attempts = parseInt(value || '3', 10);
                        if (isNaN(attempts) || attempts < 0) {
                            attempts = 0; // Allow 0 retries
                        }
                        this.plugin.settings.pollingRetryAttempts = attempts;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Polling Retry Delay (seconds)')
                .setDesc('How long to wait between polling retry attempts.')
                .addText(text => text
                    .setPlaceholder('e.g., 10')
                    .setValue(this.plugin.settings.pollingRetryDelaySeconds.toString())
                    .onChange(async (value) => {
                        let delay = parseInt(value || '10', 10);
                        if (isNaN(delay) || delay < 1) {
                            delay = 1; // Minimum 1 second delay
                        }
                        this.plugin.settings.pollingRetryDelaySeconds = delay;
                        await this.plugin.saveSettings();
                    }));
        }
    }
}