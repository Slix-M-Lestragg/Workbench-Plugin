import type Workbench from './main';
import { launchComfyUiDesktopApp, launchComfyUI } from './comfy/launch'; // Import launch functions
import { Notice, TFile } from 'obsidian'; // Import TFile

/**
 * Registers all Workbench plugin commands.
 * @param pluginInstance The Workbench plugin instance.
 */
export function registerCommands(pluginInstance: Workbench): void {
    /**
     * Command: Launch ComfyUI Desktop App (macOS).
     * @id launch-comfyui-desktop-app
     * @description Starts the native ComfyUI desktop application on macOS.
     */
    pluginInstance.addCommand({
        id: 'launch-comfyui-desktop-app',
        name: 'Launch ComfyUI App (macOS)',
        callback: () => {
            launchComfyUiDesktopApp(pluginInstance);
        },
    });

    /**
     * Command: Log ComfyUI State.
     * @id log-comfyui-state
     * @description Outputs the current ComfyUI connection status and API object to the console.
     */
    pluginInstance.addCommand({
        id: 'log-comfyui-state',
        name: 'Log ComfyUI State to Console',
        callback: () => {
            console.log('Current ComfyUI Status:', pluginInstance.currentComfyStatus);
            console.log('ComfyUI API State:', pluginInstance.comfyApi);
            new Notice('ComfyUI state logged to console');
        },
    });

    /**
     * Command: Launch ComfyUI Script.
     * @id launch-comfyui-script
     * @description Starts ComfyUI via the configured script or portable installation.
     */
    pluginInstance.addCommand({
        id: 'launch-comfyui-script',
        name: 'Launch ComfyUI Script',
        callback: () => {
            launchComfyUI(pluginInstance);
        },
    });

    /**
     * Command: Run Workflow from Active File.
     * @id run-comfyui-workflow-from-active-file
     * @description If ComfyUI is Ready or Busy and a .json file is active, executes that workflow.
     */
    pluginInstance.addCommand({
        id: 'run-comfyui-workflow-from-active-file',
        name: 'Run ComfyUI Workflow from Active File',
        checkCallback: (checking: boolean) => {
            const isComfyReady = ['Ready','Busy'].includes(pluginInstance.currentComfyStatus);
            if (!isComfyReady) return false;

            const file = pluginInstance.app.workspace.getActiveFile();
            if (!(file instanceof TFile) || file.extension !== 'json') return false;

            if (!checking) {
                console.log(`Executing workflow for: ${file.path}`);
                pluginInstance.runWorkflowFromFile(file).catch(err => {
                    console.error('Error executing workflow:', err);
                    new Notice('Failed to start workflow execution.');
                });
            }
            return true;
        },
    });

    /**
     * Ribbon Icon: Launch ComfyUI Script.
     * @description Adds a toolbar icon that triggers the launch-comfyui-script command.
     */
    pluginInstance.addRibbonIcon('image', 'Launch ComfyUI Script', (evt: MouseEvent) => {
        launchComfyUI(pluginInstance);
    });
}