import { Notice, requireApiVersion } from 'obsidian';
import { exec } from 'child_process';
import type Workbench from '../main';
import { updateStatusBar } from '../ui/status_bar';
import { stopPolling } from './polling';
import { checkComfyConnection } from './api'; // Import checkComfyConnection

/**
 * Launches the ComfyUI Desktop Application (macOS specific).
 * @param pluginInstance The instance of the Workbench plugin.
 */
export function launchComfyUiDesktopApp(pluginInstance: Workbench): void {
    const platform = window.navigator.platform.toLowerCase();
    if (!platform.includes('mac')) {
        new Notice('Launching the Desktop App is currently only supported on macOS.');
        return;
    }

    const command = 'open -a "ComfyUI"'; // Ensure this matches your app name
    stopPolling(pluginInstance);
    updateStatusBar(pluginInstance, 'Launching', 'Attempting to launch ComfyUI...');
    new Notice('Attempting to launch ComfyUI...');

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error launching ComfyUI: ${error.message}`);
            new Notice(`Error launching ComfyUI: ${error.message}`);
            if (pluginInstance.currentComfyStatus === 'Launching') {
                updateStatusBar(pluginInstance, 'Disconnected', 'Launch failed');
            }
            return;
        }
        if (stderr) {
            console.warn(`stderr from launch command: ${stderr}`);
        }
        console.log(`ComfyUI launched: ${stdout}`);
        new Notice('ComfyUI launched successfully.');
        setTimeout(() => checkComfyConnection(pluginInstance), 3000); // Check connection after delay
    });
}

/**
 * Launches the ComfyUI Script based on platform and settings.
 * @param pluginInstance The instance of the Workbench plugin.
 */
export async function launchComfyUiScript(pluginInstance: Workbench): Promise<void> {
    const platform = window.navigator.platform.toLowerCase();
    const settings = pluginInstance.settings;
    const basePath = settings.comfyUiPath?.trim();

    if (!basePath) {
        new Notice('ComfyUI base directory path is not set. Please configure it in settings.');
        return;
    }

    let launchFileName = '';
    if (platform.includes('win')) {
        launchFileName = settings.comfyLaunchFile.windows;
    } else { // Assume mac or linux-like
        launchFileName = settings.comfyLaunchFile.mac;
    }

    // Construct full path
    let launchPath = basePath.endsWith('/') || basePath.endsWith('\\') ?
                     `${basePath}${launchFileName}` :
                     `${basePath}${platform.includes('win') ? '\\' : '/'}${launchFileName}`;

    try {
        stopPolling(pluginInstance);
        stopPolling(pluginInstance);
        updateStatusBar(pluginInstance, 'Launching', `Launching script: ${launchFileName}`);
        await require('electron').shell.openPath(launchPath); // Access Electron shell through require

        new Notice(`Attempting to open ComfyUI script: ${launchFileName}`);
        // Open API URL after delay
        setTimeout(() => {
            if (settings.comfyApiUrl) {
                window.open(settings.comfyApiUrl, '_blank');
            }
        }, 5000);

        // Check connection after delay
        setTimeout(() => checkComfyConnection(pluginInstance), 5000);

    } catch (error) {
        console.error('Failed to open ComfyUI script/path:', error);
        new Notice(`Error opening ComfyUI script/path: ${error.message}`);
        if (pluginInstance.currentComfyStatus === 'Launching') {
            updateStatusBar(pluginInstance, 'Disconnected', 'Script launch failed');
        }
    }
}