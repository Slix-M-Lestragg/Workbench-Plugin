import type Workbench from './main';
import { launchComfyUiDesktopApp, launchComfyUiScript } from './comfy/launch'; // Import launch functions
import { Notice, TFile } from 'obsidian'; // Import TFile

/**
 * Registers the plugin commands.
 * @param pluginInstance The instance of the Workbench plugin.
 */
export function registerCommands(pluginInstance: Workbench): void {
    pluginInstance.addCommand({
        id: 'launch-comfyui-desktop-app',
        name: 'Launch ComfyUI App (macOS)',
        callback: () => {
            launchComfyUiDesktopApp(pluginInstance);
        },
    });

    pluginInstance.addCommand({
        id: 'launch-comfyui-script',
        name: 'Launch ComfyUI Script',
        callback: () => {
            launchComfyUiScript(pluginInstance);
        },
    });

    // --- New Command: Run Workflow from Active File ---
    pluginInstance.addCommand({
        id: 'run-comfyui-workflow-from-active-file',
        name: 'Run ComfyUI Workflow from Active File',
        checkCallback: (checking: boolean) => {
            // Condition 1: ComfyUI must be Ready or Busy
            const isComfyReady = pluginInstance.currentComfyStatus === 'Ready' || pluginInstance.currentComfyStatus === 'Busy';
            if (!isComfyReady) {
                return false;
            }

            // Condition 2: Active file must be a JSON file
            const file = pluginInstance.app.workspace.getActiveFile();
            const isJsonFile = file instanceof TFile && file.extension === 'json';
            if (!isJsonFile) {
                return false;
            }

            // If all conditions met, command is available
            if (!checking) {
                // Execute the command
                console.log(`Executing 'Run ComfyUI Workflow from Active File' for: ${file.path}`);
                // Use the refactored method from the plugin instance
                pluginInstance.runWorkflowFromFile(file).catch(error => {
                    // Catch potential errors from the async function if not handled internally
                    console.error("Error executing workflow from command:", error);
                    new Notice("Failed to start workflow execution.");
                });
            }

            return true; // Command is valid in this context
        },
    });


    // Add Ribbon Icon action here as well if it primarily triggers a command-like action
    pluginInstance.addRibbonIcon('image', 'Launch ComfyUI Script', (evt: MouseEvent) => {
        launchComfyUiScript(pluginInstance);
    });
}