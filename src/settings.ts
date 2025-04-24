// Imports
// -------------------------
import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type Workbench from './main';


// Type Definitions & Interfaces
// -------------------------
    export type ComfyInstallType = 'script' | 'portable' | 'desktop'; // Possible installation types for ComfyUI.
    export type OperatingSystem = 'macos' | 'windows' | 'linux' | 'unknown'; // Supported Operating Systems.
    export interface DeviceSpecificSettings { // Interface for settings that may vary per device/OS.
        comfyUiPath: string;
        comfyInstallType: ComfyInstallType;
        modelNotesFolderPath: string; // <--- Add this line
    }

    // Main settings interface for the Workbench plugin.
    export interface WorkbenchSettings {
        // Non-device-specific settings
        comfyApiUrl: string;
        enablePolling: boolean;
        pollingIntervalSeconds: number;
        launchCheckDelaySeconds: number;
        enablePollingRetry: boolean;
        pollingRetryAttempts: number;
        pollingRetryDelaySeconds: number;

        // Device-specific settings keyed by operating system
        deviceSettings: Record<OperatingSystem, Partial<DeviceSpecificSettings>>;
    }


// Default Settings
// -------------------------
    export const DEFAULT_DEVICE_SETTINGS: DeviceSpecificSettings = { // Default device-specific settings used as fallback.
        comfyUiPath: '',
        comfyInstallType: 'script',
        modelNotesFolderPath: 'Workbench/Models', // <--- Add default value
    };
    export const DEFAULT_SETTINGS: WorkbenchSettings = { // Default global settings for the Workbench plugin.
        comfyApiUrl: 'http://127.0.0.1:8188',
        enablePolling: true,
        pollingIntervalSeconds: 5,
        launchCheckDelaySeconds: 5,
        enablePollingRetry: true,
        pollingRetryAttempts: 3,
        pollingRetryDelaySeconds: 10,
        deviceSettings: {
            macos: {},
            windows: {},
            linux: {},
            unknown: {},
        },
    };


// OS Helper Function
// -------------------------
    /** Detects the current operating system.
    * @returns The detected OperatingSystem.
    */
    export function getCurrentOS(): OperatingSystem {
        const platform = window.navigator.platform.toLowerCase();
        if (platform.includes('mac') || platform.includes('darwin')) {
            return 'macos';
        } else if (platform.includes('win')) {
            return 'windows';
        } else if (platform.includes('linux')) {
            return 'linux';
        }
        return 'unknown';
    }


// SampleSettingTab Class
// -------------------------
/** A settings tab for the Workbench plugin which organizes
* both global (non-device-specific) and device-specific settings.
*/
export class SampleSettingTab extends PluginSettingTab {
    plugin: Workbench;
    activeTab: string = 'general'; // Track the current active tab
    currentOS: OperatingSystem; // Detected operating system for this device

    /** Constructor. Detects current OS and initializes the tab.
     * @param app The current Obsidian App instance.
     * @param plugin The instance of the Workbench plugin.
     */
    constructor(app: App, plugin: Workbench) {
        super(app, plugin);
        this.plugin = plugin;
        this.currentOS = getCurrentOS();
    }


// Display Method (UI Setup)
// -------------------------
        /** Constructs the settings UI including tab headers and content.
         */
        display(): void {
            const { containerEl } = this;
            containerEl.empty();
            containerEl.createEl('h2', { text: 'Workbench Settings' });
            // Notify the user which OS settings are being edited.
            new Notice(`Editing settings for: ${this.currentOS.toUpperCase()}`, 3000);

            // Get the current device-specific settings.
            const currentDeviceSettings = this.getCurrentDeviceSettings();

            // Create containers for tab headers and content.
            const tabHeaderContainer = containerEl.createDiv('wb-settings-tab-header-container');
            const tabContentContainer = containerEl.createDiv('wb-settings-tab-content-container');

            // Define tabs for "General", "Launch", and "Polling" settings.
            type TabKey = 'general' | 'launch' | 'polling';
            const tabs: Record<TabKey, { title: string; contentEl: HTMLDivElement }> = {
                general: { title: 'General', contentEl: tabContentContainer.createDiv('wb-settings-tab-content') },
                launch: { title: `Launch (${this.currentOS.toUpperCase()})`, contentEl: tabContentContainer.createDiv('wb-settings-tab-content') },
                polling: { title: 'Status Polling', contentEl: tabContentContainer.createDiv('wb-settings-tab-content') },
            };

            // Create and set up tab headers.
            Object.entries(tabs).forEach(([keyStr, tab]) => {
                const key = keyStr as TabKey;
                const headerEl = tabHeaderContainer.createDiv('wb-settings-tab-header');
                headerEl.setText(tab.title);
                headerEl.dataset.tabKey = key;

                // Mark the active tab header and content.
                if (key === this.activeTab) {
                    headerEl.addClass('wb-active');
                    tab.contentEl.addClass('wb-active');
                }

                headerEl.addEventListener('click', () => {
                    const clickedKey = headerEl.dataset.tabKey as TabKey;
                    if (!clickedKey) return;

                    // Deactivate currently active tab header and content.
                    const currentActiveHeader = tabHeaderContainer.querySelector('.wb-settings-tab-header.wb-active');
                    const currentActiveContent = tabContentContainer.querySelector('.wb-settings-tab-content.wb-active') as HTMLElement | null;
                    if (currentActiveHeader) currentActiveHeader.removeClass('wb-active');
                    if (currentActiveContent) {
                        currentActiveContent.removeClass('wb-active');
                        currentActiveContent.style.display = 'none';
                    }

                    // Activate the clicked tab.
                    headerEl.addClass('wb-active');
                    const newActiveContent = tabs[clickedKey].contentEl as HTMLElement;
                    newActiveContent.addClass('wb-active');
                    newActiveContent.style.display = '';
                    this.activeTab = clickedKey;
                });
            });

            // -------------------------
            // Populate General Tab (Global Settings)
            // -------------------------
            const generalTabContent = tabs.general.contentEl;

            new Setting(generalTabContent)
                .setName('ComfyUI API URL')
                .setDesc('URL for the ComfyUI web interface (shared across devices)')
                .addText(text => text
                    .setPlaceholder('http://localhost:8188')
                    .setValue(this.plugin.settings.comfyApiUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.comfyApiUrl = value;
                        await this.plugin.saveSettings();
                    }));

            // Add setting for Model Notes Folder Path (Device Specific)
            new Setting(generalTabContent) // Or place in 'Launch' tab if preferred
                .setName(`Model Notes Folder (${this.currentOS.toUpperCase()})`)
                .setDesc('Vault folder to store generated Markdown notes for models (relative to vault root).')
                .addText(text => text
                    .setPlaceholder('e.g., Workbench/Models')
                    .setValue(currentDeviceSettings.modelNotesFolderPath)
                    .onChange(async (value) => {
                        // Basic validation: remove leading/trailing slashes and whitespace
                        const cleanedPath = value.trim().replace(/^\/+|\/$/g, '');
                        await this.saveCurrentDeviceSetting('modelNotesFolderPath', cleanedPath);
                    }));

            // -------------------------
            // Populate Launch Tab (Device-Specific Settings)
            // -------------------------
            const launchTabContent = tabs.launch.contentEl;
            launchTabContent.createEl('p', { text: `These settings apply specifically to your ${this.currentOS.toUpperCase()} system.` });

            new Setting(launchTabContent)
                .setName(`ComfyUI Base Directory (${this.currentOS.toUpperCase()})`)
                .setDesc('Path to the root ComfyUI directory for this device.')
                .addText(text => text
                    .setPlaceholder(this.currentOS === 'windows' ? 'e.g., C:\\ComfyUI' : 'e.g., /path/to/ComfyUI')
                    .setValue(currentDeviceSettings.comfyUiPath)
                    .onChange(async (value) => {
                        await this.saveCurrentDeviceSetting('comfyUiPath', value);
                    }));

            new Setting(launchTabContent)
                .setName(`ComfyUI Installation Type (${this.currentOS.toUpperCase()})`)
                .setDesc('Select how ComfyUI is installed on this device.')
                .addDropdown(dropdown => dropdown
                    .addOption('script', 'Script-based (run_*.bat or run_*.sh)')
                    .addOption('portable', 'Portable Version')
                    .addOption('desktop', 'Desktop Application (Experimental)')
                    .setValue(currentDeviceSettings.comfyInstallType)
                    .onChange(async (value: ComfyInstallType) => {
                        await this.saveCurrentDeviceSetting('comfyInstallType', value);
                    }));

            new Setting(launchTabContent)
                .setName('Launch ComfyUI')
                .setDesc('Start ComfyUI using the settings for this device.')
                .addButton(button => button
                    .setButtonText('Launch ComfyUI')
                    .setCta()
                    .onClick(() => {
                        this.plugin.launchComfyUI();
                    }));

            new Setting(launchTabContent)
                .setName('Launch Connection Check Delay (seconds)')
                .setDesc('How long to wait after launching ComfyUI before checking the API connection (shared across devices).')
                .addText(text => text
                    .setPlaceholder('e.g., 5')
                    .setValue(this.plugin.settings.launchCheckDelaySeconds.toString())
                    .onChange(async (value) => {
                        let delay = parseInt(value || '5', 10);
                        if (isNaN(delay) || delay < 1) delay = 5;
                        this.plugin.settings.launchCheckDelaySeconds = delay;
                        await this.plugin.saveSettings();
                    }));

            // -------------------------
            // Populate Polling Tab (Global Settings)
            // -------------------------
            const pollingTabContent = tabs.polling.contentEl;

            new Setting(pollingTabContent)
                .setName('Enable Status Polling')
                .setDesc('Periodically check ComfyUI status via API calls (shared across devices).')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.enablePolling)
                    .onChange(async (value) => {
                        this.plugin.settings.enablePolling = value;
                        await this.plugin.saveSettings();
                        if (value && this.plugin.currentComfyStatus === 'Ready') {
                            this.plugin.startPolling();
                        } else {
                            this.plugin.stopPolling();
                        }
                    }));

            new Setting(pollingTabContent)
                .setName('Polling Interval (seconds)')
                .setDesc('How often to check the ComfyUI status (minimum 2 seconds, shared across devices).')
                .addText(text => text
                    .setPlaceholder('e.g., 5')
                    .setValue(this.plugin.settings.pollingIntervalSeconds.toString())
                    .onChange(async (value) => {
                        let interval = parseInt(value || '5', 10);
                        if (isNaN(interval) || interval < 2) interval = 2;
                        this.plugin.settings.pollingIntervalSeconds = interval;
                        await this.plugin.saveSettings();
                        if (this.plugin.settings.enablePolling &&
                            (this.plugin.currentComfyStatus === 'Ready' || this.plugin.currentComfyStatus === 'Busy')) {
                            this.plugin.startPolling();
                        }
                    }));

            new Setting(pollingTabContent)
                .setName('Enable Polling Retry on Error')
                .setDesc('If polling fails, automatically retry (shared across devices).')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.enablePollingRetry)
                    .onChange(async (value) => {
                        this.plugin.settings.enablePollingRetry = value;
                        await this.plugin.saveSettings();
                        if (!value) {
                            this.plugin.pollingRetryCount = 0;
                            if (this.plugin.pollingRetryTimeoutId) {
                                clearTimeout(this.plugin.pollingRetryTimeoutId);
                                this.plugin.pollingRetryTimeoutId = null;
                            }
                        }
                    }));

            if (this.plugin.settings.enablePollingRetry) {
                new Setting(pollingTabContent)
                    .setName('Polling Retry Attempts')
                    .setDesc('How many times to retry polling after an error (shared across devices).')
                    .addText(text => text
                        .setPlaceholder('e.g., 3')
                        .setValue(this.plugin.settings.pollingRetryAttempts.toString())
                        .onChange(async (value) => {
                            let attempts = parseInt(value || '3', 10);
                            if (isNaN(attempts) || attempts < 0) attempts = 0;
                            this.plugin.settings.pollingRetryAttempts = attempts;
                            await this.plugin.saveSettings();
                        }));

                new Setting(pollingTabContent)
                    .setName('Polling Retry Delay (seconds)')
                    .setDesc('How long to wait between polling retry attempts (shared across devices).')
                    .addText(text => text
                        .setPlaceholder('e.g., 10')
                        .setValue(this.plugin.settings.pollingRetryDelaySeconds.toString())
                        .onChange(async (value) => {
                            let delay = parseInt(value || '10', 10);
                            if (isNaN(delay) || delay < 1) delay = 1;
                            this.plugin.settings.pollingRetryDelaySeconds = delay;
                            await this.plugin.saveSettings();
                        }));
            }

            // Initially hide inactive tabs.
            Object.entries(tabs).forEach(([keyStr, tab]) => {
                const key = keyStr as TabKey;
                if (key !== this.activeTab) {
                    (tab.contentEl as HTMLElement).style.display = 'none';
                }
            });
        }


// Helper Methods
// -------------------------
    /** Retrieves device-specific settings, merged with defaults.
     * @returns The complete DeviceSpecificSettings for the current OS.
     */
    getCurrentDeviceSettings(): DeviceSpecificSettings {
        // Ensure the deviceSettings object is initialized
        if (!this.plugin.settings.deviceSettings) {
            this.plugin.settings.deviceSettings = { macos: {}, windows: {}, linux: {}, unknown: {} };
        }
        if (!this.plugin.settings.deviceSettings[this.currentOS]) {
            this.plugin.settings.deviceSettings[this.currentOS] = {};
        }

        // Merge defaults with saved settings for this OS
        return {
            ...DEFAULT_DEVICE_SETTINGS,
            ...this.plugin.settings.deviceSettings[this.currentOS],
        };
    }

    /** Saves a specific device setting.
     * @param key The key of the setting to update.
     * @param value The new value for the setting.
     */
    async saveCurrentDeviceSetting<K extends keyof DeviceSpecificSettings>(
        key: K,
        value: DeviceSpecificSettings[K]
    ) {
        if (!this.plugin.settings.deviceSettings) {
            this.plugin.settings.deviceSettings = { macos: {}, windows: {}, linux: {}, unknown: {} };
        }
        if (!this.plugin.settings.deviceSettings[this.currentOS]) {
            this.plugin.settings.deviceSettings[this.currentOS] = {};
        }
        this.plugin.settings.deviceSettings[this.currentOS][key] = value;
        await this.plugin.saveSettings();
    }
}