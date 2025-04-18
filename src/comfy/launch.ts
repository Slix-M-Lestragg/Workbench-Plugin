import { Notice } from 'obsidian';
import { exec } from 'child_process';
import { shell } from 'electron';
import type Workbench from '../main';
import { updateStatusBar } from '../ui/status_bar';
import { stopPolling } from './polling';
import { checkComfyConnection } from './api';

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
    updateStatusBar(pluginInstance, 'Launching', 'Attempting to launch ComfyUI App...');
    new Notice('Attempting to launch ComfyUI App...');

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error launching ComfyUI App: ${error.message}`);
            new Notice(`Error launching ComfyUI App: ${error.message}. Is it installed and named correctly?`);
            // Update status to reflect the launch failure
            updateStatusBar(pluginInstance, 'Error', 'App launch failed');
            // Optional: Attempt script launch as fallback?
            // console.log("App launch failed, attempting script launch...");
            // launchComfyUiScript(pluginInstance);
            return;
        }
        if (stderr) {
            // stderr might contain non-fatal warnings, log them but proceed.
            console.warn(`stderr from app launch command: ${stderr}`);
        }
        console.log(`ComfyUI App launch command executed: ${stdout}`);
        new Notice('ComfyUI App launch command sent.');

        // Use configurable delay before checking connection
        const delayMs = pluginInstance.settings.launchCheckDelaySeconds * 1000;
        updateStatusBar(pluginInstance, 'Launching', `App launched, waiting ${pluginInstance.settings.launchCheckDelaySeconds}s...`);
        setTimeout(() => {
            // Only check connection if status is still 'Launching' (avoid race conditions)
            if (pluginInstance.currentComfyStatus === 'Launching') {
                 // Set status to neutral before check to bypass guard in checkComfyConnection
                 pluginInstance.currentComfyStatus = 'Disconnected'; // Or another neutral status
                 console.log("Launch delay finished, initiating connection check..."); // Optional log
                 checkComfyConnection(pluginInstance);
            } else {
                 console.log("Connection check skipped: Status is no longer 'Launching'."); // Optional log
            }
        }, delayMs);
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
        updateStatusBar(pluginInstance, 'Error', 'ComfyUI path not set');
        return;
    }

    let launchFileName = '';
    if (platform.includes('win')) {
        launchFileName = settings.comfyLaunchFile.windows;
    } else { // Assume mac or linux-like
        launchFileName = settings.comfyLaunchFile.mac;
    }

    if (!launchFileName) {
         new Notice('ComfyUI launch script file name is not set for this OS in settings.');
         updateStatusBar(pluginInstance, 'Error', 'Launch script not set');
         return;
    }

    // Construct full path (basic check)
    let launchPath = basePath.endsWith('/') || basePath.endsWith('\\') ?
                     `${basePath}${launchFileName}` :
                     `${basePath}${platform.includes('win') ? '\\' : '/'}${launchFileName}`;

    // Note: We can't easily check if the script *exists* reliably here without node fs access.
    // We rely on shell.openPath error handling.

    try {
        stopPolling(pluginInstance);
        updateStatusBar(pluginInstance, 'Launching', `Attempting to launch script: ${launchFileName}`);
        new Notice(`Attempting to open ComfyUI script: ${launchFileName}`);

        await shell.openPath(launchPath); // Use imported shell

        // Use configurable delay before checking connection
        const delayMs = pluginInstance.settings.launchCheckDelaySeconds * 1000;
        updateStatusBar(pluginInstance, 'Launching', `Script launched, waiting ${pluginInstance.settings.launchCheckDelaySeconds}s...`);

        // Open API URL in browser after a shorter delay (optional)
        setTimeout(() => {
            if (settings.comfyApiUrl) {
                window.open(settings.comfyApiUrl, '_blank');
            }
        }, 2000); // Shorter delay for opening browser

        // Check connection after the configured delay
        setTimeout(() => {
             // Only check connection if status is still 'Launching'
             if (pluginInstance.currentComfyStatus === 'Launching') {
                 // Set status to neutral before check to bypass guard in checkComfyConnection
                 pluginInstance.currentComfyStatus = 'Disconnected'; // Or another neutral status
                 console.log("Launch delay finished, initiating connection check..."); // Optional log
                 checkComfyConnection(pluginInstance);
             } else {
                 console.log("Connection check skipped: Status is no longer 'Launching'."); // Optional log
             }
        }, delayMs);

    } catch (error) {
        console.error(`Failed to open ComfyUI script/path (${launchPath}):`, error);
        new Notice(`Error opening ComfyUI script/path: ${error.message}. Check path and permissions.`);
        updateStatusBar(pluginInstance, 'Error', 'Script launch failed');
        // Optional: Attempt app launch as fallback?
        // if (platform.includes('mac')) {
        //     console.log("Script launch failed, attempting app launch...");
        //     launchComfyUiDesktopApp(pluginInstance);
        // }
    }
}