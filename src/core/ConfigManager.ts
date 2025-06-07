/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Configuration Manager for Workbench Plugin
 * 
 * This module provides centralized configuration management including:
 * - Versioned settings schema with automatic migrations
 * - Device-specific configuration handling
 * - Settings validation and error recovery
 * - Provider integration management (CivitAI, HuggingFace)
 * - Cross-platform compatibility utilities
 */

// ===========================================================================
// IMPORTS AND DEPENDENCIES
// ===========================================================================

import { Plugin, Notice } from 'obsidian';
import {
    WorkbenchSettings,
    DEFAULT_SETTINGS,
    DeviceSpecificSettings,
    DEFAULT_DEVICE_SETTINGS,
    OperatingSystem,
    getCurrentOS,
    ComfyInstallType
} from './settings';

// ===========================================================================
// CONFIGURATION INTERFACES
// ===========================================================================

/** Extended settings interface with versioning */
export interface VersionedWorkbenchSettings extends WorkbenchSettings {
    version: number;
}

/** Configuration migration handler */
export type MigrationHandler = (data: any) => any;

/** Device identification information */
export interface DeviceInfo {
    id: string;
    platform: string;
    hostname: string;
}

// ===========================================================================
// CONFIGURATION MANAGER CLASS
// ===========================================================================

export class ConfigManager {
    private plugin: Plugin;
    private settings: VersionedWorkbenchSettings;
    private migrationHandlers: Map<number, MigrationHandler> = new Map();
    private currentOS: OperatingSystem;
    
    // Current schema version - increment when making breaking changes
    private static readonly CURRENT_VERSION = 3;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.currentOS = getCurrentOS();
        this.setupMigrations();
        
        // Initialize with defaults
        this.settings = {
            ...DEFAULT_SETTINGS,
            version: ConfigManager.CURRENT_VERSION
        };
    }

    // ===========================================================================
    // INITIALIZATION AND LIFECYCLE
    // ===========================================================================

    /**
     * Initialize the configuration manager and load settings
     */
    async initialize(): Promise<void> {
        try {
            await this.loadSettings();
            console.log('[ConfigManager] Initialized successfully');
        } catch (error) {
            console.error('[ConfigManager] Failed to initialize:', error);
            // Fall back to defaults on initialization failure
            this.settings = {
                ...DEFAULT_SETTINGS,
                version: ConfigManager.CURRENT_VERSION
            };
            throw error;
        }
    }

    // ===========================================================================
    // SETTINGS ACCESS METHODS
    // ===========================================================================

    /**
     * Get the current settings (read-only copy)
     */
    getSettings(): WorkbenchSettings {
        // Return a deep copy without version property to prevent direct mutation
        const { version, ...settingsWithoutVersion } = this.settings;
        // version is intentionally excluded from the returned object
        return JSON.parse(JSON.stringify(settingsWithoutVersion)) as WorkbenchSettings;
    }

    /**
     * Get device-specific settings for the current OS
     */
    getCurrentDeviceSettings(): DeviceSpecificSettings {
        const osSettings = this.settings.deviceSettings?.[this.currentOS] ?? {};
        return {
            ...DEFAULT_DEVICE_SETTINGS,
            ...osSettings
        };
    }

    /**
     * Get device-specific settings for a particular OS
     */
    getDeviceSettings(os: OperatingSystem): DeviceSpecificSettings {
        const osSettings = this.settings.deviceSettings?.[os] ?? {};
        return {
            ...DEFAULT_DEVICE_SETTINGS,
            ...osSettings
        };
    }

    /**
     * Check if a provider integration is enabled and configured
     */
    isProviderEnabled(provider: 'civitai' | 'huggingface'): boolean {
        switch (provider) {
            case 'civitai':
                return this.settings.enableCivitaiIntegration && 
                       !!this.settings.civitaiApiKey;
            case 'huggingface':
                return this.settings.enableHuggingfaceIntegration && 
                       !!this.settings.huggingfaceApiKey;
            default:
                return false;
        }
    }

    // ===========================================================================
    // SETTINGS MODIFICATION METHODS
    // ===========================================================================

    /**
     * Update global settings
     */
    async updateSettings(updates: Partial<WorkbenchSettings>): Promise<void> {
        try {
            // Validate the updates before applying
            const validatedUpdates = this.validateSettingsUpdate(updates);
            
            // Apply updates
            this.settings = {
                ...this.settings,
                ...validatedUpdates
            };
            
            await this.saveSettings();
            console.log('[ConfigManager] Settings updated successfully');
        } catch (error) {
            console.error('[ConfigManager] Failed to update settings:', error);
            throw error;
        }
    }

    /**
     * Update device-specific settings for the current OS
     */
    async updateCurrentDeviceSettings(updates: Partial<DeviceSpecificSettings>): Promise<void> {
        await this.updateDeviceSettings(this.currentOS, updates);
    }

    /**
     * Update device-specific settings for a specific OS
     */
    async updateDeviceSettings(os: OperatingSystem, updates: Partial<DeviceSpecificSettings>): Promise<void> {
        try {
            // Validate device settings
            const validatedUpdates = this.validateDeviceSettingsUpdate(updates);
            
            // Ensure device settings structure exists
            if (!this.settings.deviceSettings) {
                this.settings.deviceSettings = {
                    macos: {},
                    windows: {},
                    linux: {},
                    unknown: {}
                };
            }
            
            if (!this.settings.deviceSettings[os]) {
                this.settings.deviceSettings[os] = {};
            }
            
            // Apply updates
            this.settings.deviceSettings[os] = {
                ...this.settings.deviceSettings[os],
                ...validatedUpdates
            };
            
            await this.saveSettings();
            console.log(`[ConfigManager] Device settings updated for ${os}`);
        } catch (error) {
            console.error('[ConfigManager] Failed to update device settings:', error);
            throw error;
        }
    }

    /**
     * Reset settings to defaults
     */
    async resetSettings(): Promise<void> {
        try {
            this.settings = {
                ...DEFAULT_SETTINGS,
                version: ConfigManager.CURRENT_VERSION
            };
            await this.saveSettings();
            console.log('[ConfigManager] Settings reset to defaults');
            new Notice('Settings reset to defaults');
        } catch (error) {
            console.error('[ConfigManager] Failed to reset settings:', error);
            throw error;
        }
    }

    /**
     * Reset device settings for current OS to defaults
     */
    async resetCurrentDeviceSettings(): Promise<void> {
        await this.resetDeviceSettings(this.currentOS);
    }

    /**
     * Reset device settings for specific OS to defaults
     */
    async resetDeviceSettings(os: OperatingSystem): Promise<void> {
        try {
            if (!this.settings.deviceSettings) {
                this.settings.deviceSettings = {
                    macos: {},
                    windows: {},
                    linux: {},
                    unknown: {}
                };
            }
            
            this.settings.deviceSettings[os] = { ...DEFAULT_DEVICE_SETTINGS };
            await this.saveSettings();
            console.log(`[ConfigManager] Device settings reset for ${os}`);
            new Notice(`${os.toUpperCase()} settings reset to defaults`);
        } catch (error) {
            console.error('[ConfigManager] Failed to reset device settings:', error);
            throw error;
        }
    }

    // ===========================================================================
    // PERSISTENCE METHODS
    // ===========================================================================

    /**
     * Load settings from disk with migration support
     */
    async loadSettings(): Promise<void> {
        try {
            const rawData = await this.plugin.loadData();
            
            if (!rawData) {
                console.log('[ConfigManager] No existing settings found, using defaults');
                this.settings = {
                    ...DEFAULT_SETTINGS,
                    version: ConfigManager.CURRENT_VERSION
                };
                return;
            }

            // Run migrations if needed
            const migratedData = await this.runMigrations(rawData);
            
            // Merge with defaults to ensure all properties exist
            this.settings = this.mergeWithDefaults(migratedData);
            
            console.log(`[ConfigManager] Settings loaded (version ${this.settings.version})`);
        } catch (error) {
            console.error('[ConfigManager] Failed to load settings:', error);
            // Fall back to defaults on load failure
            this.settings = {
                ...DEFAULT_SETTINGS,
                version: ConfigManager.CURRENT_VERSION
            };
            throw error;
        }
    }

    /**
     * Save current settings to disk
     */
    async saveSettings(): Promise<void> {
        try {
            // Clean up any legacy properties before saving
            const settingsToSave = this.cleanupLegacySettings(this.settings);
            
            await this.plugin.saveData(settingsToSave);
            console.log('[ConfigManager] Settings saved successfully');
        } catch (error) {
            console.error('[ConfigManager] Failed to save settings:', error);
            throw error;
        }
    }

    // ===========================================================================
    // MIGRATION SYSTEM
    // ===========================================================================

    /**
     * Setup migration handlers for different schema versions
     */
    private setupMigrations(): void {
        // Migration from v1 to v2: Add device settings structure
        this.migrationHandlers.set(2, (data: any) => {
            console.log('[ConfigManager] Running migration to v2: Adding device settings');
            return {
                ...data,
                version: 2,
                deviceSettings: data.deviceSettings || {
                    macos: {},
                    windows: {},
                    linux: {},
                    unknown: {}
                }
            };
        });

        // Migration from v2 to v3: Move legacy top-level device settings
        this.migrationHandlers.set(3, (data: any) => {
            console.log('[ConfigManager] Running migration to v3: Moving legacy device settings');
            const migrated = { ...data, version: 3 };
            
            // Move legacy comfyUiPath to device settings
            if (data.comfyUiPath && typeof data.comfyUiPath === 'string') {
                const currentOS = getCurrentOS();
                if (!migrated.deviceSettings) {
                    migrated.deviceSettings = { macos: {}, windows: {}, linux: {}, unknown: {} };
                }
                if (!migrated.deviceSettings[currentOS]) {
                    migrated.deviceSettings[currentOS] = {};
                }
                migrated.deviceSettings[currentOS].comfyUiPath = data.comfyUiPath;
                delete migrated.comfyUiPath;
            }
            
            // Move legacy comfyInstallType to device settings
            if (data.comfyInstallType && typeof data.comfyInstallType === 'string') {
                const currentOS = getCurrentOS();
                if (!migrated.deviceSettings) {
                    migrated.deviceSettings = { macos: {}, windows: {}, linux: {}, unknown: {} };
                }
                if (!migrated.deviceSettings[currentOS]) {
                    migrated.deviceSettings[currentOS] = {};
                }
                migrated.deviceSettings[currentOS].comfyInstallType = data.comfyInstallType as ComfyInstallType;
                delete migrated.comfyInstallType;
            }
            
            return migrated;
        });
    }

    /**
     * Run migrations from current data version to latest
     */
    private async runMigrations(data: any): Promise<VersionedWorkbenchSettings> {
        if (!data) {
            return {
                ...DEFAULT_SETTINGS,
                version: ConfigManager.CURRENT_VERSION
            };
        }

        const currentVersion = data.version || 1;
        const targetVersion = ConfigManager.CURRENT_VERSION;
        
        if (currentVersion >= targetVersion) {
            return data as VersionedWorkbenchSettings;
        }

        console.log(`[ConfigManager] Migrating settings from v${currentVersion} to v${targetVersion}`);
        
        let migratedData = { ...data };
        
        // Run each migration in sequence
        for (let version = currentVersion + 1; version <= targetVersion; version++) {
            const migrationHandler = this.migrationHandlers.get(version);
            if (migrationHandler) {
                try {
                    migratedData = migrationHandler(migratedData);
                    console.log(`[ConfigManager] Successfully migrated to v${version}`);
                } catch (error) {
                    console.error(`[ConfigManager] Migration to v${version} failed:`, error);
                    throw new Error(`Settings migration failed at version ${version}`);
                }
            }
        }
        
        return migratedData as VersionedWorkbenchSettings;
    }

    // ===========================================================================
    // VALIDATION METHODS
    // ===========================================================================

    /**
     * Validate settings updates before applying
     */
    private validateSettingsUpdate(updates: Partial<WorkbenchSettings>): Partial<WorkbenchSettings> {
        const validated = { ...updates };
        
        // Validate polling interval
        if (validated.pollingIntervalSeconds !== undefined) {
            const interval = Number(validated.pollingIntervalSeconds);
            if (isNaN(interval) || interval < 2) {
                console.warn('[ConfigManager] Invalid polling interval, using minimum value');
                validated.pollingIntervalSeconds = 2;
            }
        }
        
        // Validate retry attempts
        if (validated.pollingRetryAttempts !== undefined) {
            const attempts = Number(validated.pollingRetryAttempts);
            if (isNaN(attempts) || attempts < 0) {
                console.warn('[ConfigManager] Invalid retry attempts, using default');
                validated.pollingRetryAttempts = 3;
            }
        }
        
        // Validate cache expiry days
        if (validated.civitaiCacheExpiry !== undefined) {
            const days = Number(validated.civitaiCacheExpiry);
            if (isNaN(days) || days < 1) {
                console.warn('[ConfigManager] Invalid cache expiry, using default');
                validated.civitaiCacheExpiry = 7;
            }
        }
        
        if (validated.huggingfaceCacheExpiry !== undefined) {
            const days = Number(validated.huggingfaceCacheExpiry);
            if (isNaN(days) || days < 1) {
                console.warn('[ConfigManager] Invalid HuggingFace cache expiry, using default');
                validated.huggingfaceCacheExpiry = 7;
            }
        }
        
        return validated;
    }

    /**
     * Validate device settings updates
     */
    private validateDeviceSettingsUpdate(updates: Partial<DeviceSpecificSettings>): Partial<DeviceSpecificSettings> {
        const validated = { ...updates };
        
        // Validate and clean paths
        if (validated.comfyUiPath !== undefined) {
            validated.comfyUiPath = validated.comfyUiPath.trim();
        }
        
        if (validated.modelNotesFolderPath !== undefined) {
            // Clean the path: remove leading/trailing slashes and whitespace
            validated.modelNotesFolderPath = validated.modelNotesFolderPath
                .trim()
                .replace(/^\/+|\/$/g, '');
        }
        
        // Validate install type
        if (validated.comfyInstallType !== undefined) {
            const validTypes: ComfyInstallType[] = ['script', 'portable', 'desktop'];
            if (!validTypes.includes(validated.comfyInstallType)) {
                console.warn('[ConfigManager] Invalid install type, using default');
                validated.comfyInstallType = 'script';
            }
        }
        
        return validated;
    }

    // ===========================================================================
    // UTILITY METHODS
    // ===========================================================================

    /**
     * Merge loaded data with defaults to ensure all properties exist
     */
    private mergeWithDefaults(data: any): VersionedWorkbenchSettings {
        const merged: VersionedWorkbenchSettings = {
            ...DEFAULT_SETTINGS,
            ...data,
            version: data.version || ConfigManager.CURRENT_VERSION
        };
        
        // Ensure device settings exist for all OS types
        merged.deviceSettings = merged.deviceSettings || {};
        for (const osKey of Object.keys(DEFAULT_SETTINGS.deviceSettings) as OperatingSystem[]) {
            const defaultOsSettings = DEFAULT_SETTINGS.deviceSettings[osKey] || {};
            const savedOsSettings = data?.deviceSettings?.[osKey] ?? {};
            merged.deviceSettings[osKey] = { ...defaultOsSettings, ...savedOsSettings };
        }
        
        return merged;
    }

    /**
     * Remove legacy properties before saving
     */
    private cleanupLegacySettings(settings: VersionedWorkbenchSettings): VersionedWorkbenchSettings {
        const cleaned = { ...settings };
        
        // Remove any legacy top-level device properties
        const legacyProps = ['comfyUiPath', 'comfyInstallType'] as const;
        legacyProps.forEach(prop => {
            if (cleaned.hasOwnProperty(prop)) {
                delete (cleaned as any)[prop];
            }
        });
        
        return cleaned;
    }

    /**
     * Get device identification information
     */
    getDeviceInfo(): DeviceInfo {
        try {
            // Use browser-compatible APIs instead of Node.js require('os')
            const platform = this.currentOS;
            const hostname = window.navigator.userAgent.match(/\(([^)]+)\)/)?.[1]?.split(';')[0]?.trim() || 'unknown';
            
            return {
                id: `${platform}-${hostname}`,
                platform: platform,
                hostname: hostname
            };
        } catch (error) {
            console.warn('[ConfigManager] Could not get device info:', error);
            return {
                id: `${this.currentOS}-unknown`,
                platform: this.currentOS,
                hostname: 'unknown'
            };
        }
    }

    /**
     * Export settings for backup
     */
    exportSettings(): VersionedWorkbenchSettings {
        return JSON.parse(JSON.stringify(this.settings));
    }

    /**
     * Import settings from backup (with validation)
     */
    async importSettings(importedSettings: any): Promise<void> {
        try {
            // Run migrations on imported data
            const migratedSettings = await this.runMigrations(importedSettings);
            
            // Merge with defaults and validate
            this.settings = this.mergeWithDefaults(migratedSettings);
            
            await this.saveSettings();
            console.log('[ConfigManager] Settings imported successfully');
            new Notice('Settings imported successfully');
        } catch (error) {
            console.error('[ConfigManager] Failed to import settings:', error);
            throw error;
        }
    }
}
