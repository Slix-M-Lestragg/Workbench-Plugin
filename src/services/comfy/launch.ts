/**
 * ComfyUI Launch Management for Workbench Plugin
 * 
 * This file contains functions for launching ComfyUI across different platforms and installation types including:
 * - Native desktop application launching (macOS specific)
 * - Script-based ComfyUI launching (cross-platform)
 * - Platform detection and launch method selection
 * - Launch status monitoring and connection verification
 * - Error handling and user feedback for launch operations
 * - Integration with polling system for connection management
 */

// ===========================================================================
// IMPORTS AND DEPENDENCIES
// ===========================================================================

    // Core Obsidian and Node.js Imports
    import { exec } from 'child_process';
    import { shell } from 'electron';
    import * as path from 'path';
    
    // Workbench Plugin Imports
    import type Workbench from '../../core/main';
    import { updateStatusBar } from './../../ui/components/status_bar';
    import { stopPolling } from './polling';
    import { checkComfyConnection } from './api';
    import { handleLaunchError, handleUIError, handleSettingsError } from './../../utils/errorHandler';

// ===========================================================================
// DESKTOP APPLICATION LAUNCH FUNCTIONS
// ===========================================================================

/*
 * Launches the ComfyUI Desktop Application (macOS specific).
 * 
 * This function handles launching the native ComfyUI desktop application on macOS systems.
 * It performs platform detection, executes the launch command, and manages the launch
 * sequence including status updates and connection verification timing.
 * 
 * @param pluginInstance - The instance of the Workbench plugin for settings and state management
 */
export function launchComfyUiDesktopApp(pluginInstance: Workbench): void {
    const platform = window.navigator.platform.toLowerCase();
    if (!platform.includes('mac')) {
        handleUIError(new Error('Desktop app launch not supported on platform'), 'Launching the Desktop App is currently only supported on macOS.');
        return;
    }

    const command = 'open -a "ComfyUI"'; // Ensure this matches your app name
    stopPolling(pluginInstance);
    updateStatusBar(pluginInstance, 'Launching', 'Attempting to launch ComfyUI App...');
    handleUIError(new Error('Launch attempt'), 'Attempting to launch ComfyUI App...');

    exec(command, (error, stdout, stderr) => {
        if (error) {
            handleLaunchError(error, `Failed to launch ComfyUI App: ${error.message}. Is it installed and named correctly?`);
            updateStatusBar(pluginInstance, 'Error', 'App launch failed');
            return;
        }
        if (stderr) {
            console.warn(`📋 ComfyUI App Launch: stderr output: ${stderr}`);
        }
        console.log(`📋 ComfyUI App launch command executed: ${stdout}`);
        handleUIError(new Error('App launch confirmation'), 'ComfyUI App launch command sent.');

        const delayMs = pluginInstance.settings.launchCheckDelaySeconds * 1000;
        updateStatusBar(pluginInstance, 'Launching', `App launched, waiting ${pluginInstance.settings.launchCheckDelaySeconds}s...`);
        setTimeout(() => {
            if (pluginInstance.currentComfyStatus === 'Launching') {
                 pluginInstance.currentComfyStatus = 'Disconnected';
                 console.log("Launch delay finished, initiating connection check...");
                 checkComfyConnection(pluginInstance);
            } else {
                 console.log("Connection check skipped: Status is no longer 'Launching'.");
            }
        }, delayMs);
    });
}

// ===========================================================================
// SCRIPT-BASED LAUNCH FUNCTIONS
// ===========================================================================

/*
 * Launches ComfyUI based on the selected installation type and platform.
 * 
 * This function handles launching ComfyUI via various methods including:
 * - Script-based installations (run_*.bat, run_*.sh)
 * - Portable installations with direct execution
 * - Platform-specific command construction and execution
 * - Launch validation and error handling
 * - Status monitoring and connection verification
 * 
 * @param pluginInstance - The instance of the Workbench plugin for configuration and state
 */
export async function launchComfyUI(pluginInstance: Workbench): Promise<void> {
    const platform = window.navigator.platform.toLowerCase();
    const settings = pluginInstance.settings;
    // Retrieve device-specific settings
    const { comfyUiPath, comfyInstallType } = pluginInstance.getCurrentDeviceSettings();
    const basePath = comfyUiPath?.trim();
    const installType = comfyInstallType;

    if (!basePath) {
        handleSettingsError(new Error('ComfyUI path not configured'), 'ComfyUI base directory path is not set. Please configure it in settings.');
        updateStatusBar(pluginInstance, 'Error', 'ComfyUI path not set');
        return;
    }

    stopPolling(pluginInstance); // Stop polling before attempting launch

    let command = '';
    let useExec = false; // Flag to determine whether to use exec or shell.openPath
    let scriptName = ''; // For user feedback
    const execOptions: { cwd?: string } = {}; // Options for exec, specifically cwd

    if (installType === 'script' || installType === 'portable') {
        // --- Script or Portable Launch --- 
        // Currently, both use shell.openPath assuming script is at the root
        useExec = false;
        if (platform.includes('win')) {
            scriptName = 'run_nvidia_gpu.bat'; // Consider adding run_cpu.bat as a fallback?
            command = path.join(basePath, scriptName);
        } else { // Assume mac or linux-like
            scriptName = 'run_mac.sh'; // Or a more generic name like run.sh?
            command = path.join(basePath, scriptName);
            // Note: shell.openPath might not work reliably for .sh on Linux/Mac without execute permissions.
            // Consider using exec(`sh ${command}`) or similar if issues arise.
        }
        updateStatusBar(pluginInstance, 'Launching', `Attempting to launch script: ${scriptName}`);
        handleUIError(new Error('Script launch attempt'), `Attempting to open ComfyUI script: ${scriptName}`);

    } else if (installType === 'desktop') {
        // --- Desktop Launch ---
        if (platform.includes('mac')) {
            // Use the dedicated macOS app launch function
            launchComfyUiDesktopApp(pluginInstance);
            return; // Exit early as launchComfyUiDesktopApp handles its own logic
        } else {
            // Windows or Linux Desktop - try running main.py
            useExec = true;
            scriptName = 'main.py';
            // Simple execution, assumes python is in PATH.
            // We need to execute it *within* the ComfyUI directory.
            command = `python ${scriptName}`; 
            execOptions.cwd = basePath; // Set working directory for exec
            updateStatusBar(pluginInstance, 'Launching', `Attempting to run: python ${scriptName}`);
            handleUIError(new Error('Python execution attempt'), `Attempting to run ComfyUI via: python ${scriptName}`);
        }
    } else {
        handleSettingsError(new Error(`Invalid installation type: ${installType}`), `Unknown ComfyUI installation type: ${installType}`);
        updateStatusBar(pluginInstance, 'Error', 'Unknown install type');
        return;
    }

    // --- Execute Launch --- 
    try {
        if (useExec) {
            // Execute python script using exec, setting the working directory
            exec(command, execOptions, (error, stdout, stderr) => {
                // This callback runs when the process *exits* or fails to start.
                // It doesn't mean the server is ready.
                if (error) {
                    console.error(`Error executing ComfyUI (${scriptName}): ${error.message}`);
                    // Check if it's a file not found error specifically for python
                    if (error.message.includes('ENOENT') || error.message.toLowerCase().includes('not recognized')) {
                         handleLaunchError(error, `Error: 'python' command not found. Is Python installed and in your system PATH?`);
                    } else {
                         handleLaunchError(error, `Error executing ComfyUI (${scriptName}): ${error.message}. Check console for details.`);
                    }
                    updateStatusBar(pluginInstance, 'Error', 'Execution failed');
                    // Don't proceed to connection check if exec failed immediately
                    return; 
                }
                // Log stderr/stdout but don't treat as launch failure unless error occurred.
                if (stderr) {
                    console.warn(`stderr from ComfyUI execution (${scriptName}): ${stderr}`);
                }
                if (stdout) {
                    console.log(`stdout from ComfyUI execution (${scriptName}): ${stdout}`);
                }
                console.log(`ComfyUI execution process finished (${scriptName}). Server might still be running if started correctly.`);
                // The connection check timeout below handles verifying if the server actually started.
            });
            // Since exec is asynchronous and the callback fires on exit/error,
            // we proceed immediately to setting up the connection check timeout.
            console.log(`ComfyUI execution command sent (${scriptName}).`);

        } else {
            // Open .bat or .sh script using shell.openPath
            const success = await shell.openPath(command);
            if (!success) {
                // shell.openPath can return false if it fails to find an app
                console.error(`shell.openPath failed for: ${command}`);
                handleLaunchError(new Error(`Script launch failed: ${command}`), `Failed to open script: ${scriptName}. Check path and file associations.`);
                updateStatusBar(pluginInstance, 'Error', 'Script launch failed');
                return; // Stop if shell.openPath failed
            }
            console.log(`ComfyUI script launch command sent (${scriptName}).`);
        }

        // --- Post-Launch Connection Check (Common Logic) ---
        // This runs regardless of whether exec or shell.openPath was used,
        // unless an immediate error stopped execution earlier.
        const delayMs = pluginInstance.settings.launchCheckDelaySeconds * 1000;
        updateStatusBar(pluginInstance, 'Launching', `Launch initiated, waiting ${pluginInstance.settings.launchCheckDelaySeconds}s...`);

        // Optional: Open API URL in browser 
        setTimeout(() => {
            if (settings.comfyApiUrl) {
                window.open(settings.comfyApiUrl, '_blank');
            }
        }, 2000); // Keep this short delay?

        // Check connection after the configured delay
        setTimeout(() => {
             if (pluginInstance.currentComfyStatus === 'Launching') {
                 pluginInstance.currentComfyStatus = 'Disconnected'; // Reset status before check
                 console.log("Launch delay finished, initiating connection check...");
                 checkComfyConnection(pluginInstance);
             } else {
                 // This might happen if the user manually checked connection or status updated some other way
                 console.log("Connection check skipped: Status is no longer 'Launching'. Current status: ", pluginInstance.currentComfyStatus);
             }
        }, delayMs);

    } catch (error) {
        // Catch errors primarily from shell.openPath or unexpected sync issues
        console.error(`Failed to initiate ComfyUI launch (${scriptName}):`, error);
        handleLaunchError(error, `Error initiating ComfyUI launch: ${error instanceof Error ? error.message : String(error)}. Check path and permissions.`);
        updateStatusBar(pluginInstance, 'Error', 'Launch initiation failed');
    }
}