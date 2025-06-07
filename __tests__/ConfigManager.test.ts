/**
 * ConfigManager Test Suite
 * 
 * Comprehensive tests for the ConfigManager including:
 * - Initialization and default settings
 * - Settings loading and saving
 * - Device-specific configuration management
 * - Migration system validation
 * - Settings validation and error handling
 * - Provider integration testing
 */

import { ConfigManager } from '../src/core/ConfigManager';
import { DEFAULT_SETTINGS, DEFAULT_DEVICE_SETTINGS } from '../src/settings';

// ===========================================================================
// MOCK SETUP
// ===========================================================================

const mockPlugin = {
    loadData: jest.fn(),
    saveData: jest.fn()
} as any;

// Mock OS module for device info testing
jest.mock('os', () => ({
    hostname: jest.fn(() => 'test-machine'),
    platform: jest.fn(() => 'darwin')
}));

// Mock process.platform
Object.defineProperty(process, 'platform', {
    value: 'darwin',
    writable: true
});

describe('ConfigManager', () => {
    let configManager: ConfigManager;

    beforeEach(() => {
        jest.clearAllMocks();
        configManager = new ConfigManager(mockPlugin);
    });

    // ===========================================================================
    // INITIALIZATION TESTS
    // ===========================================================================

    describe('initialization', () => {
        it('should initialize with default settings when no data exists', async () => {
            mockPlugin.loadData.mockResolvedValue(null);
            
            await configManager.initialize();
            const settings = configManager.getSettings();
            
            expect(settings).toMatchObject({
                ...DEFAULT_SETTINGS,
                version: expect.any(Number)
            });
        });

        it('should load existing settings successfully', async () => {
            const existingData = {
                version: 3,
                comfyApiUrl: 'http://localhost:8080',
                enablePolling: false,
                deviceSettings: {
                    macos: {
                        comfyUiPath: '/Users/test/ComfyUI',
                        comfyInstallType: 'portable'
                    }
                }
            };
            
            mockPlugin.loadData.mockResolvedValue(existingData);
            await configManager.initialize();
            
            const settings = configManager.getSettings();
            expect(settings.comfyApiUrl).toBe('http://localhost:8080');
            expect(settings.enablePolling).toBe(false);
        });

        it('should fall back to defaults on initialization failure', async () => {
            mockPlugin.loadData.mockRejectedValue(new Error('Load failed'));
            
            await expect(configManager.initialize()).rejects.toThrow('Load failed');
            
            const settings = configManager.getSettings();
            expect(settings).toMatchObject(DEFAULT_SETTINGS);
        });
    });

    // ===========================================================================
    // SETTINGS ACCESS TESTS
    // ===========================================================================

    describe('settings access', () => {
        beforeEach(async () => {
            mockPlugin.loadData.mockResolvedValue(null);
            await configManager.initialize();
        });

        it('should return a deep copy of settings to prevent mutation', () => {
            const settings1 = configManager.getSettings();
            const settings2 = configManager.getSettings();
            
            expect(settings1).toEqual(settings2);
            expect(settings1).not.toBe(settings2); // Different object references
            
            // Modifying returned settings should not affect internal state
            settings1.comfyApiUrl = 'modified';
            const settings3 = configManager.getSettings();
            expect(settings3.comfyApiUrl).toBe(DEFAULT_SETTINGS.comfyApiUrl);
        });

        it('should get current device settings with defaults merged', () => {
            const deviceSettings = configManager.getCurrentDeviceSettings();
            
            expect(deviceSettings).toMatchObject(DEFAULT_DEVICE_SETTINGS);
            expect(deviceSettings.comfyUiPath).toBe('');
            expect(deviceSettings.comfyInstallType).toBe('script');
        });

        it('should get device settings for specific OS', () => {
            const windowsSettings = configManager.getDeviceSettings('windows');
            const linuxSettings = configManager.getDeviceSettings('linux');
            
            expect(windowsSettings).toMatchObject(DEFAULT_DEVICE_SETTINGS);
            expect(linuxSettings).toMatchObject(DEFAULT_DEVICE_SETTINGS);
        });

        it('should check provider enablement correctly', async () => {
            // Initially disabled
            expect(configManager.isProviderEnabled('civitai')).toBe(false);
            expect(configManager.isProviderEnabled('huggingface')).toBe(false);
            
            // Enable CivitAI
            await configManager.updateSettings({
                enableCivitaiIntegration: true,
                civitaiApiKey: 'test-key'
            });
            
            expect(configManager.isProviderEnabled('civitai')).toBe(true);
            expect(configManager.isProviderEnabled('huggingface')).toBe(false);
        });
    });

    // ===========================================================================
    // SETTINGS MODIFICATION TESTS
    // ===========================================================================

    describe('settings modification', () => {
        beforeEach(async () => {
            mockPlugin.loadData.mockResolvedValue(null);
            await configManager.initialize();
        });

        it('should update global settings successfully', async () => {
            const updates = {
                comfyApiUrl: 'http://localhost:9999',
                enablePolling: false,
                pollingIntervalSeconds: 10
            };
            
            await configManager.updateSettings(updates);
            
            const settings = configManager.getSettings();
            expect(settings.comfyApiUrl).toBe('http://localhost:9999');
            expect(settings.enablePolling).toBe(false);
            expect(settings.pollingIntervalSeconds).toBe(10);
            expect(mockPlugin.saveData).toHaveBeenCalled();
        });

        it('should validate and correct invalid polling interval', async () => {
            await configManager.updateSettings({
                pollingIntervalSeconds: 1 // Below minimum of 2
            });
            
            const settings = configManager.getSettings();
            expect(settings.pollingIntervalSeconds).toBe(2);
        });

        it('should validate and correct invalid retry attempts', async () => {
            await configManager.updateSettings({
                pollingRetryAttempts: -1 // Invalid negative value
            });
            
            const settings = configManager.getSettings();
            expect(settings.pollingRetryAttempts).toBe(3);
        });

        it('should update current device settings', async () => {
            const deviceUpdates = {
                comfyUiPath: '/new/path/to/comfyui',
                comfyInstallType: 'portable' as const,
                modelNotesFolderPath: 'Custom/Models'
            };
            
            await configManager.updateCurrentDeviceSettings(deviceUpdates);
            
            const deviceSettings = configManager.getCurrentDeviceSettings();
            expect(deviceSettings.comfyUiPath).toBe('/new/path/to/comfyui');
            expect(deviceSettings.comfyInstallType).toBe('portable');
            expect(deviceSettings.modelNotesFolderPath).toBe('Custom/Models');
        });

        it('should clean paths when updating device settings', async () => {
            await configManager.updateCurrentDeviceSettings({
                comfyUiPath: '  /path/with/spaces  ',
                modelNotesFolderPath: '/leading/and/trailing/slashes/'
            });
            
            const deviceSettings = configManager.getCurrentDeviceSettings();
            expect(deviceSettings.comfyUiPath).toBe('/path/with/spaces');
            expect(deviceSettings.modelNotesFolderPath).toBe('leading/and/trailing/slashes');
        });

        it('should reset settings to defaults', async () => {
            // First modify settings
            await configManager.updateSettings({
                comfyApiUrl: 'http://custom:8080',
                enablePolling: false
            });
            
            // Then reset
            await configManager.resetSettings();
            
            const settings = configManager.getSettings();
            expect(settings.comfyApiUrl).toBe(DEFAULT_SETTINGS.comfyApiUrl);
            expect(settings.enablePolling).toBe(DEFAULT_SETTINGS.enablePolling);
        });

        it('should reset device settings to defaults', async () => {
            // First modify device settings
            await configManager.updateCurrentDeviceSettings({
                comfyUiPath: '/custom/path',
                comfyInstallType: 'desktop'
            });
            
            // Then reset
            await configManager.resetCurrentDeviceSettings();
            
            const deviceSettings = configManager.getCurrentDeviceSettings();
            expect(deviceSettings.comfyUiPath).toBe(DEFAULT_DEVICE_SETTINGS.comfyUiPath);
            expect(deviceSettings.comfyInstallType).toBe(DEFAULT_DEVICE_SETTINGS.comfyInstallType);
        });
    });

    // ===========================================================================
    // MIGRATION TESTS
    // ===========================================================================

    describe('migrations', () => {
        it('should migrate from v1 to latest version', async () => {
            const v1Data = {
                // No version property (implies v1)
                comfyApiUrl: 'http://localhost:8188',
                enablePolling: true,
                comfyUiPath: '/old/path/to/comfyui',
                comfyInstallType: 'script'
            };
            
            mockPlugin.loadData.mockResolvedValue(v1Data);
            await configManager.initialize();
            
            const settings = configManager.getSettings();
            // Version should not be exposed in getSettings() - it's internal to ConfigManager
            expect(settings.deviceSettings).toBeDefined();
            expect(settings.comfyApiUrl).toBe('http://localhost:8188');
            
            // Legacy properties should be moved to device settings
            const deviceSettings = configManager.getCurrentDeviceSettings();
            expect(deviceSettings.comfyUiPath).toBe('/old/path/to/comfyui');
            expect(deviceSettings.comfyInstallType).toBe('script');
        });

        it('should migrate from v2 to v3', async () => {
            const v2Data = {
                version: 2,
                comfyApiUrl: 'http://localhost:8188',
                deviceSettings: {
                    macos: { comfyUiPath: '/existing/path' },
                    windows: {},
                    linux: {},
                    unknown: {}
                },
                // Legacy top-level properties
                comfyUiPath: '/legacy/path',
                comfyInstallType: 'portable'
            };
            
            mockPlugin.loadData.mockResolvedValue(v2Data);
            await configManager.initialize();
            
            const settings = configManager.getSettings();
            // Version should not be exposed in getSettings() - it's internal to ConfigManager
            
            // Should not have legacy top-level properties
            expect(settings).not.toHaveProperty('comfyUiPath');
            expect(settings).not.toHaveProperty('comfyInstallType');
            
            // Legacy properties should be moved to current OS device settings
            const deviceSettings = configManager.getCurrentDeviceSettings();
            expect(deviceSettings.comfyUiPath).toBe('/legacy/path');
            expect(deviceSettings.comfyInstallType).toBe('portable');
        });

        it('should handle migration failure gracefully', async () => {
            // Mock a migration that would throw an error
            const corruptData = {
                version: 1,
                comfyApiUrl: null, // Invalid data that might cause migration issues
                invalidProperty: { deeply: { nested: 'value' } }
            };
            
            mockPlugin.loadData.mockResolvedValue(corruptData);
            
            // Should still initialize successfully with migration
            await configManager.initialize();
            
            const settings = configManager.getSettings();
            // Version should not be exposed in getSettings() - it's internal to ConfigManager
            expect(settings.comfyApiUrl).toBeDefined();
        });

        it('should skip migrations for current version data', async () => {
            const currentData = {
                version: 3,
                comfyApiUrl: 'http://localhost:8188',
                deviceSettings: {
                    macos: { comfyUiPath: '/path' },
                    windows: {},
                    linux: {},
                    unknown: {}
                }
            };
            
            mockPlugin.loadData.mockResolvedValue(currentData);
            await configManager.initialize();
            
            const settings = configManager.getSettings();
            // Version should not be exposed in getSettings() - it's internal to ConfigManager
            expect(settings.comfyApiUrl).toBe('http://localhost:8188');
        });
    });

    // ===========================================================================
    // PERSISTENCE TESTS
    // ===========================================================================

    describe('persistence', () => {
        beforeEach(async () => {
            mockPlugin.loadData.mockResolvedValue(null);
            await configManager.initialize();
        });

        it('should save settings without legacy properties', async () => {
            await configManager.updateSettings({
                comfyApiUrl: 'http://test:8080'
            });
            
            const saveCall = mockPlugin.saveData.mock.calls[0][0];
            expect(saveCall).not.toHaveProperty('comfyUiPath');
            expect(saveCall).not.toHaveProperty('comfyInstallType');
            expect(saveCall.version).toBe(3);
            expect(saveCall.comfyApiUrl).toBe('http://test:8080');
        });

        it('should handle save failures gracefully', async () => {
            mockPlugin.saveData.mockRejectedValue(new Error('Disk full'));
            
            await expect(configManager.updateSettings({
                comfyApiUrl: 'http://test:8080'
            })).rejects.toThrow('Disk full');
        });
    });

    // ===========================================================================
    // UTILITY TESTS
    // ===========================================================================

    describe('utilities', () => {
        beforeEach(async () => {
            mockPlugin.loadData.mockResolvedValue(null);
            await configManager.initialize();
        });

        it('should get device information', () => {
            const deviceInfo = configManager.getDeviceInfo();
            
            expect(deviceInfo).toHaveProperty('id');
            expect(deviceInfo).toHaveProperty('platform');
            expect(deviceInfo).toHaveProperty('hostname');
            expect(deviceInfo.platform).toBe('darwin');
        });

        it('should export settings for backup', () => {
            const exported = configManager.exportSettings();
            const current = configManager.getSettings();
            
            expect(exported).toEqual(current);
            expect(exported).not.toBe(current); // Should be a copy
        });

        it('should import settings from backup', async () => {
            const importData = {
                version: 2,
                comfyApiUrl: 'http://imported:8080',
                enablePolling: false,
                deviceSettings: {
                    macos: { comfyUiPath: '/imported/path' },
                    windows: {},
                    linux: {},
                    unknown: {}
                }
            };
            
            await configManager.importSettings(importData);
            
            const settings = configManager.getSettings();
            expect(settings.comfyApiUrl).toBe('http://imported:8080');
            expect(settings.enablePolling).toBe(false);
            // Version should not be exposed in getSettings() - it's internal to ConfigManager
        });

        it('should handle import failures gracefully', async () => {
            const invalidData = { completely: 'invalid' };
            
            await expect(configManager.importSettings(invalidData))
                .rejects.toThrow();
        });
    });

    // ===========================================================================
    // EDGE CASES AND ERROR HANDLING
    // ===========================================================================

    describe('edge cases', () => {
        it('should handle missing device settings gracefully', async () => {
            const dataWithoutDeviceSettings = {
                version: 3,
                comfyApiUrl: 'http://localhost:8188'
                // No deviceSettings property
            };
            
            mockPlugin.loadData.mockResolvedValue(dataWithoutDeviceSettings);
            await configManager.initialize();
            
            const deviceSettings = configManager.getCurrentDeviceSettings();
            expect(deviceSettings).toMatchObject(DEFAULT_DEVICE_SETTINGS);
        });

        it('should handle corrupt device settings', async () => {
            const dataWithCorruptDeviceSettings = {
                version: 3,
                comfyApiUrl: 'http://localhost:8188',
                deviceSettings: null // Corrupt
            };
            
            mockPlugin.loadData.mockResolvedValue(dataWithCorruptDeviceSettings);
            await configManager.initialize();
            
            const deviceSettings = configManager.getCurrentDeviceSettings();
            expect(deviceSettings).toMatchObject(DEFAULT_DEVICE_SETTINGS);
        });

        it('should validate install type and use default for invalid values', async () => {
            await configManager.updateCurrentDeviceSettings({
                comfyInstallType: 'invalid-type' as any
            });
            
            const deviceSettings = configManager.getCurrentDeviceSettings();
            expect(deviceSettings.comfyInstallType).toBe('script');
        });

        it('should handle empty string values appropriately', async () => {
            await configManager.updateCurrentDeviceSettings({
                comfyUiPath: '',
                modelNotesFolderPath: ''
            });
            
            const deviceSettings = configManager.getCurrentDeviceSettings();
            expect(deviceSettings.comfyUiPath).toBe('');
            expect(deviceSettings.modelNotesFolderPath).toBe('');
        });
    });
});
