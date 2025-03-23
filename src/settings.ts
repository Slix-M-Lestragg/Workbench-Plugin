import { App, PluginSettingTab, Setting, ButtonComponent } from 'obsidian';
import Workbench from './main';

export interface WorkbenchSettings {
    mySetting: string;
    comfyApiUrl: string;
    comfyUiPath: string; // Base ComfyUI directory path
    comfyLaunchFile: {
        windows: string;
        mac: string;
    };
}

export const DEFAULT_SETTINGS: WorkbenchSettings = {
    mySetting: 'default',
    comfyApiUrl: 'http://localhost:8188',
    comfyUiPath: '', // User will set this to their ComfyUI root folder
    comfyLaunchFile: {
        windows: 'launch.bat',
        mac: 'launch.sh'
    }
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
            .setName('My Setting')
            .setDesc('Description of my setting')
            .addText(text => text
                .setPlaceholder('Enter something')
                .setValue(this.plugin.settings.mySetting)
                .onChange(async (value) => {
                    this.plugin.settings.mySetting = value;
                    await this.plugin.saveSettings();
                }));
        
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
                }));
        
        // Platform-specific launch file setting
        const platform = window.navigator.platform.toLowerCase();
        if (platform.includes('win')) {
            new Setting(containerEl)
                .setName('Windows Launch File')
                .setDesc('Name of the batch file to launch ComfyUI (relative to base directory)')
                .addText(text => text
                    .setPlaceholder('launch.bat')
                    .setValue(this.plugin.settings.comfyLaunchFile.windows)
                    .onChange(async (value) => {
                        this.plugin.settings.comfyLaunchFile.windows = value;
                        await this.plugin.saveSettings();
                    }));
        } else if (platform.includes('mac')) {
            new Setting(containerEl)
                .setName('Mac Launch File')
                .setDesc('Name of the shell script to launch ComfyUI (relative to base directory)')
                .addText(text => text
                    .setPlaceholder('launch.sh')
                    .setValue(this.plugin.settings.comfyLaunchFile.mac)
                    .onChange(async (value) => {
                        this.plugin.settings.comfyLaunchFile.mac = value;
                        await this.plugin.saveSettings();
                    }));
        }
        
        new Setting(containerEl)
            .setName('Launch ComfyUI')
            .setDesc('Start ComfyUI using the configured settings')
            .addButton(button => button
                .setButtonText('Launch ComfyUI')
                .setCta()
                .onClick(() => this.plugin.launchComfyUi()));
    }
}