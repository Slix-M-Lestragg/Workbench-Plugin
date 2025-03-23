import { Plugin } from 'obsidian';
import { WorkbenchSettings, DEFAULT_SETTINGS, SampleSettingTab } from './settings';

export default class Workbench extends Plugin {
    settings: WorkbenchSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new SampleSettingTab(this.app, this));
    }

    onunload() {

    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
