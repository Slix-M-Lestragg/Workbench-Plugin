/**
 * Settings Management for Workbench Plugin
 * 
 * This file contains the complete settings architecture for the Workbench Plugin including:
 * - Type definitions for cross-platform device settings
 * - Main settings interface with provider integrations
 * - Default configuration values and fallbacks
 * - Operating system detection utilities
 * - Settings UI tab with tabbed interface for organization
 * - Device-specific configuration management
 * - Provider API key management (CivitAI, HuggingFace)
 * - Real-time settings validation and updates
 */

// ===========================================================================
// IMPORTS AND DEPENDENCIES
// ===========================================================================

    // Core Obsidian imports for settings UI and plugin integration
    import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
    import type Workbench from '../main';


// ===========================================================================
// TYPE DEFINITIONS AND INTERFACES
// ===========================================================================

/** 
 * Possible installation types for ComfyUI.
 * - 'script': Script-based installation (run_*.bat or run_*.sh)
 * - 'portable': Portable version of ComfyUI
 * - 'desktop': Desktop application (experimental)
 */
export type ComfyInstallType = 'script' | 'portable' | 'desktop';

/** 
 * Supported Operating Systems.
 * - 'macos': macOS operating system
 * - 'windows': Windows operating system
 * - 'linux': Linux operating system
 * - 'unknown': Unknown or unsupported operating system
 */
export type OperatingSystem = 'macos' | 'windows' | 'linux' | 'unknown';

/** 
 * Interface for settings that may vary per device/OS.
 * - `comfyUiPath`: Path to the ComfyUI installation directory
 * - `comfyInstallType`: Type of ComfyUI installation
 * - `modelNotesFolderPath`: Path for storing model notes (Markdown)
 */
export interface DeviceSpecificSettings {
    comfyUiPath: string;
    comfyInstallType: ComfyInstallType;
    modelNotesFolderPath: string;
}

/** 
 * Main settings interface for the Workbench plugin.
 * Contains both global settings and device-specific settings.
 */
export interface WorkbenchSettings {
    // Non-device-specific settings
    comfyApiUrl: string;
    enablePolling: boolean;
    pollingIntervalSeconds: number;
    launchCheckDelaySeconds: number;
    enablePollingRetry: boolean;
    pollingRetryAttempts: number;
    pollingRetryDelaySeconds: number;

    // CivitAI Integration settings
    civitaiApiKey?: string;
    enableCivitaiIntegration: boolean;
    autoRefreshMetadata: boolean;
    civitaiCacheExpiry: number; // days
    showCivitaiRatings: boolean;
    showCompatibleModels: boolean;
    
    // HuggingFace Integration settings
    huggingfaceApiKey?: string;
    enableHuggingfaceIntegration: boolean;
    huggingfaceCacheExpiry: number; // days
    showProviderIcons: boolean;

    // Device-specific settings keyed by operating system
    deviceSettings: Record<OperatingSystem, Partial<DeviceSpecificSettings>>;
}


// ===========================================================================
// DEFAULT SETTINGS AND CONFIGURATION
// ===========================================================================

/* 
 * Default device-specific settings used as fallback.
 * - `comfyUiPath`: Default path for ComfyUI installation
 * - `comfyInstallType`: Default installation type (script)
 * - `modelNotesFolderPath`: Default folder for model notes
 */
export const DEFAULT_DEVICE_SETTINGS: DeviceSpecificSettings = {
    comfyUiPath: '',
    comfyInstallType: 'script',
    modelNotesFolderPath: 'Workbench/Models',
};

/** 
 * Default global settings for the Workbench plugin.
 * These values are used when no user-specific settings are found.
 */
export const DEFAULT_SETTINGS: WorkbenchSettings = {
    comfyApiUrl: 'http://127.0.0.1:8188',
    enablePolling: true,
    pollingIntervalSeconds: 5,
    launchCheckDelaySeconds: 5,
    enablePollingRetry: true,
    pollingRetryAttempts: 3,
    pollingRetryDelaySeconds: 10,
    
    // CivitAI Integration defaults
    enableCivitaiIntegration: true,
    autoRefreshMetadata: false,
    civitaiCacheExpiry: 7,
    showCivitaiRatings: true,
    showCompatibleModels: true,
    
    // HuggingFace Integration defaults
    enableHuggingfaceIntegration: false,
    huggingfaceCacheExpiry: 7,
    showProviderIcons: true,
    
    deviceSettings: {
        macos: {},
        windows: {},
        linux: {},
        unknown: {},
    },
};


// ===========================================================================
// OPERATING SYSTEM DETECTION UTILITIES
// ===========================================================================

/*
 * Detects the current operating system.
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


// ===========================================================================
// SETTINGS TAB CLASS
// ===========================================================================

/** A settings tab for the Workbench plugin which organizes
* both global (non-device-specific) and device-specific settings.
*/
export class SampleSettingTab extends PluginSettingTab {
    plugin: Workbench;
    activeTab = 'general'; // Track the current active tab
    currentOS: OperatingSystem; // Detected operating system for this device

    /*
     * Constructor. Detects current OS and initializes the tab.
     * @param app The current Obsidian App instance.
     * @param plugin The instance of the Workbench plugin.
     */
    constructor(app: App, plugin: Workbench) {
        super(app, plugin);
        this.plugin = plugin;
        this.currentOS = getCurrentOS();
    }


    // ===========================================================================
    // USER INTERFACE SETUP AND DISPLAY
    // ===========================================================================

    /*
     * Constructs the settings UI including tab headers and content.
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
                .setValue(this.plugin.configManager.getSettings().comfyApiUrl)
                .onChange(async (value) => {
                    await this.plugin.configManager.updateSettings({ comfyApiUrl: value });
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

        // CivitAI Integration Section
        generalTabContent.createEl('h3', { text: 'CivitAI Integration' });

        new Setting(generalTabContent)
            .setName('Enable CivitAI Integration')
            .setDesc('Enable integration with CivitAI for enhanced model metadata')
            .addToggle(toggle => toggle
                .setValue(this.plugin.configManager.getSettings().enableCivitaiIntegration)
                .onChange(async (value) => {
                    await this.plugin.configManager.updateSettings({ enableCivitaiIntegration: value });
                })
            );

        new Setting(generalTabContent)
            .setName('CivitAI API Key')
            .setDesc('Optional API key for CivitAI (enables higher rate limits and access to private models)')
            .addText(text => text
                .setPlaceholder('Enter your CivitAI API key')
                .setValue(this.plugin.configManager.getSettings().civitaiApiKey || '')
                .onChange(async (value) => {
                    await this.plugin.configManager.updateSettings({ civitaiApiKey: value });
                })
            );

        new Setting(generalTabContent)
            .setName('Auto-refresh Metadata')
            .setDesc('Automatically refresh model metadata from CivitAI weekly')
            .addToggle(toggle => toggle
                .setValue(this.plugin.configManager.getSettings().autoRefreshMetadata)
                .onChange(async (value) => {
                    await this.plugin.configManager.updateSettings({ autoRefreshMetadata: value });
                })
            );

        new Setting(generalTabContent)
            .setName('Show CivitAI Ratings')
            .setDesc('Display model ratings from CivitAI in the models list')
            .addToggle(toggle => toggle
                .setValue(this.plugin.configManager.getSettings().showCivitaiRatings)
                .onChange(async (value) => {
                    await this.plugin.configManager.updateSettings({ showCivitaiRatings: value });
                })
            );

        new Setting(generalTabContent)
            .setName('Show Compatible Models')
            .setDesc('Show suggestions for compatible models (LoRAs for checkpoints, etc.)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.configManager.getSettings().showCompatibleModels)
                .onChange(async (value) => {
                    await this.plugin.configManager.updateSettings({ showCompatibleModels: value });
                })
            );

        // HuggingFace Integration Section
        generalTabContent.createEl('h3', { text: 'HuggingFace Integration' });

        new Setting(generalTabContent)
            .setName('Enable HuggingFace Integration')
            .setDesc('Enable integration with HuggingFace for model metadata and enhanced features')
            .addToggle(toggle => toggle
                .setValue(this.plugin.configManager.getSettings().enableHuggingfaceIntegration)
                .onChange(async (value) => {
                    await this.plugin.configManager.updateSettings({ enableHuggingfaceIntegration: value });
                })
            );

        new Setting(generalTabContent)
            .setName('HuggingFace API Token')
            .setDesc('Optional API token for HuggingFace (enables access to private models and higher rate limits)')
            .addText(text => text
                .setPlaceholder('Enter your HuggingFace API token')
                .setValue(this.plugin.configManager.getSettings().huggingfaceApiKey || '')
                .onChange(async (value) => {
                    await this.plugin.configManager.updateSettings({ huggingfaceApiKey: value });
                })
            );

        new Setting(generalTabContent)
            .setName('HuggingFace Cache Expiry (days)')
            .setDesc('How long to cache HuggingFace metadata before refreshing')
            .addText(text => text
                .setPlaceholder('7')
                .setValue(this.plugin.configManager.getSettings().huggingfaceCacheExpiry.toString())
                .onChange(async (value) => {
                    let days = parseInt(value || '7', 10);
                    if (isNaN(days) || days < 1) days = 7;
                    await this.plugin.configManager.updateSettings({ huggingfaceCacheExpiry: days });
                })
            );

        new Setting(generalTabContent)
            .setName('Show Provider Icons')
            .setDesc('Display icons to differentiate between CivitAI, HuggingFace, and unknown model sources')
            .addToggle(toggle => toggle
                .setValue(this.plugin.configManager.getSettings().showProviderIcons)
                .onChange(async (value) => {
                    await this.plugin.configManager.updateSettings({ showProviderIcons: value });
                })
            );

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
                .setValue(this.plugin.configManager.getSettings().launchCheckDelaySeconds.toString())
                .onChange(async (value) => {
                    let delay = parseInt(value || '5', 10);
                    if (isNaN(delay) || delay < 1) delay = 5;
                    await this.plugin.configManager.updateSettings({ launchCheckDelaySeconds: delay });
                }));

        // -------------------------
        // Populate Polling Tab (Global Settings)
        // -------------------------
        const pollingTabContent = tabs.polling.contentEl;

        new Setting(pollingTabContent)
            .setName('Enable Status Polling')
            .setDesc('Periodically check ComfyUI status via API calls (shared across devices).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.configManager.getSettings().enablePolling)
                .onChange(async (value) => {
                    await this.plugin.configManager.updateSettings({ enablePolling: value });
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
                .setValue(this.plugin.configManager.getSettings().pollingIntervalSeconds.toString())
                .onChange(async (value) => {
                    let interval = parseInt(value || '5', 10);
                    if (isNaN(interval) || interval < 2) interval = 2;
                    await this.plugin.configManager.updateSettings({ pollingIntervalSeconds: interval });
                    if (this.plugin.configManager.getSettings().enablePolling &&
                        (this.plugin.currentComfyStatus === 'Ready' || this.plugin.currentComfyStatus === 'Busy')) {
                        this.plugin.startPolling();
                    }
                }));

        new Setting(pollingTabContent)
            .setName('Enable Polling Retry on Error')
            .setDesc('If polling fails, automatically retry (shared across devices).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.configManager.getSettings().enablePollingRetry)
                .onChange(async (value) => {
                    await this.plugin.configManager.updateSettings({ enablePollingRetry: value });
                    if (!value) {
                        this.plugin.pollingRetryCount = 0;
                        if (this.plugin.pollingRetryTimeoutId) {
                            clearTimeout(this.plugin.pollingRetryTimeoutId);
                            this.plugin.pollingRetryTimeoutId = null;
                        }
                    }
                }));

        if (this.plugin.configManager.getSettings().enablePollingRetry) {
            new Setting(pollingTabContent)
                .setName('Polling Retry Attempts')
                .setDesc('How many times to retry polling after an error (shared across devices).')
                .addText(text => text
                    .setPlaceholder('e.g., 3')
                    .setValue(this.plugin.configManager.getSettings().pollingRetryAttempts.toString())
                    .onChange(async (value) => {
                        let attempts = parseInt(value || '3', 10);
                        if (isNaN(attempts) || attempts < 0) attempts = 0;
                        await this.plugin.configManager.updateSettings({ pollingRetryAttempts: attempts });
                    }));

            new Setting(pollingTabContent)
                .setName('Polling Retry Delay (seconds)')
                .setDesc('How long to wait between polling retry attempts (shared across devices).')
                .addText(text => text
                    .setPlaceholder('e.g., 10')
                    .setValue(this.plugin.configManager.getSettings().pollingRetryDelaySeconds.toString())
                    .onChange(async (value) => {
                        let delay = parseInt(value || '10', 10);
                        if (isNaN(delay) || delay < 1) delay = 1;
                        await this.plugin.configManager.updateSettings({ pollingRetryDelaySeconds: delay });
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


    // ---------------------------------------------------------------------------
    // HELPER METHODS
    // ---------------------------------------------------------------------------

    /** Retrieves device-specific settings, merged with defaults.
     * @returns The complete DeviceSpecificSettings for the current OS.
     */
    getCurrentDeviceSettings(): DeviceSpecificSettings {
        return this.plugin.configManager.getCurrentDeviceSettings();
    }

    /** Saves a specific device setting.
     * @param key The key of the setting to update.
     * @param value The new value for the setting.
     */
    async saveCurrentDeviceSetting<K extends keyof DeviceSpecificSettings>(
        key: K,
        value: DeviceSpecificSettings[K]
    ) {
        await this.plugin.configManager.updateDeviceSettings(this.currentOS, { [key]: value });
    }
}