/**
 * Core Module Barrel Export
 * 
 * This file provides a centralized export point for all core plugin infrastructure,
 * making imports cleaner and more organized throughout the codebase.
 */

// Configuration Management
export { ConfigManager } from './ConfigManager';
export type { VersionedWorkbenchSettings, DeviceInfo } from './ConfigManager';

// Settings and Device Configuration
export type {
    WorkbenchSettings,
    DeviceSpecificSettings,
    OperatingSystem,
    ComfyInstallType
} from './settings';
export {
    SampleSettingTab,
    DEFAULT_SETTINGS,
    DEFAULT_DEVICE_SETTINGS,
    getCurrentOS
} from './settings';

// Command Management
export { registerCommands } from './CommandManager';
