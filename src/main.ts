import { Notice, Plugin, requestUrl } from 'obsidian';
import { WorkbenchSettings, DEFAULT_SETTINGS, SampleSettingTab } from './settings';
import { ComfyApi as SdkComfyApi } from '@saintno/comfyui-sdk';

// Extended interface with our custom methods
// Create a custom type that's separate from the SDK to avoid implementation issues
interface ComfyApi {
    baseUrl: string;
    getObjectInfo(): Promise<any>;
    getPromptHistory(): Promise<any>;
}

export default class Workbench extends Plugin {
    settings: WorkbenchSettings;
    comfyApi: ComfyApi | null = null;
/* Lifecycle Methods */
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new SampleSettingTab(this.app, this));
        this.addRibbonIcon('image', 'Launch ComfyUI', (evt: MouseEvent) => {
            this.launchComfyUi();
        });
    }

    onunload() {
        // Clean up if needed
    }

/* Settings Methods */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

/* ComfyUI API Methods */
    async checkComfyConnection(): Promise<boolean> {
        const apiUrl = this.settings.comfyApiUrl?.trim();
        
        if (!apiUrl) {
            new Notice('ComfyUI API URL is empty. Please provide a valid URL.');
            console.error('ComfyUI API URL is empty');
            return false;
        }

        try {
            // Try to validate URL format
            new URL(apiUrl);
        } catch (e) {
            new Notice('Invalid ComfyUI API URL format');
            console.error('Invalid ComfyUI API URL format:', e);
            return false;
        }

        try {
            // Use Obsidian's requestUrl API instead of fetch
            const response = await requestUrl({
                url: `${apiUrl}/system_stats`,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                throw: false  // Don't throw on non-200 responses
            });

            if (response.status !== 200) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            console.log('ComfyUI connection successful:', response.json);
            new Notice('Successfully connected to ComfyUI API');

            // Create a minimal API wrapper without using problematic SDK features
            try {
                // Don't use the SDK's init() method as it's causing problems
                // Instead, create a basic wrapper around the core API functionality
                this.comfyApi = {
                    baseUrl: apiUrl,
                    
                    // Add minimal methods we need
                    async getObjectInfo() {
                        try {
                            const objectInfoResponse = await requestUrl({
                                url: `${apiUrl}/object_info`,
                                method: 'GET',
                                headers: {'Accept': 'application/json'},
                            });
                            return objectInfoResponse.json;
                        } catch (e) {
                            console.warn('Failed to fetch object info:', e);
                            return null;
                        }
                    },
                    
                    async getPromptHistory() {
                        try {
                            const historyResponse = await requestUrl({
                                url: `${apiUrl}/history`,
                                method: 'GET',
                                headers: {'Accept': 'application/json'},
                            });
                            return historyResponse.json;
                        } catch (e) {
                            console.warn('Failed to fetch prompt history:', e);
                            return null;
                        }
                    },
                    
                    // Add more methods as needed for your plugin functionality
                };
                
                // Load initial object info to confirm API works
                const objectInfo = await this.comfyApi?.getObjectInfo();
                console.log('Successfully fetched ComfyUI object info');
            } catch (error) {
                console.error('Error creating ComfyUI API wrapper:', error);
                new Notice('Connected to ComfyUI API, but advanced features may be limited', 5000);
                
                // Fallback to a minimal implementation
                this.comfyApi = {
                    baseUrl: apiUrl,
                    async getObjectInfo() {
                        console.warn('ComfyUI API wrapper not fully initialized');
                        return null;
                    },
                    async getPromptHistory() {
                        console.warn('ComfyUI API wrapper not fully initialized');
                        return null;
                    }
                };
            }
            
            return true;
        } catch (error) {
            new Notice(`Failed to connect to ComfyUI API: ${error.message}`);
            console.error('ComfyUI connection error:', error);
            this.comfyApi = null;
            return false;
        }
    }

    // Add this method to the Workbench class
    async launchComfyUi(): Promise<void> {
        const platform = window.navigator.platform.toLowerCase();
        const basePath = this.settings.comfyUiPath?.trim();
        
        if (!basePath) {
            new Notice('ComfyUI base directory path is not set. Please configure it in settings.');
            return;
        }
        
        let launchFileName = '';
        if (platform.includes('win')) {
            launchFileName = this.settings.comfyLaunchFile.windows;
        } else if (platform.includes('mac')) {
            launchFileName = this.settings.comfyLaunchFile.mac;
        } else {
            // Assume Linux or other Unix-like
            launchFileName = this.settings.comfyLaunchFile.mac;
        }
        
        // Construct full path to launch file
        let launchPath = '';
        if (platform.includes('win')) {
            // Handle Windows path joining
            launchPath = basePath.endsWith('\\') ? 
                `${basePath}${launchFileName}` : 
                `${basePath}\\${launchFileName}`;
        } else {
            // Handle Unix path joining
            launchPath = basePath.endsWith('/') ? 
                `${basePath}${launchFileName}` : 
                `${basePath}/${launchFileName}`;
        }
        
        try {
            // Use Electron's shell.openPath to open the file
            const { shell } = require('electron');
            await shell.openPath(launchPath);
            
            new Notice(`Launching ComfyUI with ${launchFileName}`);
            
            // Open the API URL in browser after a delay
            setTimeout(() => {
                window.open(this.settings.comfyApiUrl, '_blank');
            }, 5000); // Give time for ComfyUI to start
        } catch (error) {
            console.error('Failed to launch ComfyUI:', error);
            new Notice(`Error launching ComfyUI: ${error.message}`);
        }
    }
}
