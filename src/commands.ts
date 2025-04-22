import type Workbench from './main';
import { launchComfyUiDesktopApp, launchComfyUI } from './comfy/launch'; // Import launch functions
import { Notice, TFile, setIcon } from 'obsidian'; // Import TFile and setIcon
import { MODEL_LIST_VIEW_TYPE } from './ui/ModelListView'; // Added import for view type

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
     * Command: Show ComfyUI Models.
     * @id show-comfyui-models
     * @description Opens a view listing available models in the ComfyUI models directory.
     */
    pluginInstance.addCommand({
        id: 'show-comfyui-models',
        name: 'Show ComfyUI Models',
        callback: async () => {
            // Check if view is already open, if so, just reveal it
            const existingLeaves = pluginInstance.app.workspace.getLeavesOfType(MODEL_LIST_VIEW_TYPE);
            if (existingLeaves.length > 0) {
                pluginInstance.app.workspace.revealLeaf(existingLeaves[0]);
                return;
            }

            // Otherwise, open in a new leaf
            await pluginInstance.app.workspace.getLeaf(true).setViewState({
                type: MODEL_LIST_VIEW_TYPE,
                active: true,
            });
            // Ensure the new leaf is revealed
            pluginInstance.app.workspace.revealLeaf(
                pluginInstance.app.workspace.getLeavesOfType(MODEL_LIST_VIEW_TYPE)[0]
            );
        },
    });

    /**
     * Ribbon Icon: Launch or Open ComfyUI.
     * @description Adds a toolbar icon that launches ComfyUI if disconnected/error,
     * or opens the web UI if ready/busy. The icon changes based on status.
     */
    // Use a placeholder icon initially, it will be updated immediately by updateRibbonIcon
    const initialIcon = 'image'; // Or any valid icon name
    const initialTooltip = 'Loading ComfyUI Status...'; // Placeholder tooltip
    pluginInstance.ribbonIconEl = pluginInstance.addRibbonIcon(initialIcon, initialTooltip, (evt: MouseEvent) => { // Assign the returned element
        const status = pluginInstance.currentComfyStatus;
        const apiUrl = pluginInstance.settings.comfyApiUrl?.trim();

        if (status === 'Ready' || status === 'Busy') {
            // If connected, open the web UI
            if (apiUrl) {
                window.open(apiUrl, '_blank');
            } else {
                new Notice("ComfyUI API URL is not set in settings.");
            }
            // Tooltip/icon update is handled centrally by updateStatusBar -> updateRibbonIcon
        } else {
            // If disconnected, launching, connecting, or error state, attempt to launch
            launchComfyUI(pluginInstance);
            // Tooltip/icon update is handled centrally by updateStatusBar -> updateRibbonIcon
        }
    });

    // Remove the initial tooltip setting here, it's handled in main.ts onload
    // const initialStatus = pluginInstance.currentComfyStatus;
    // if (initialStatus === 'Ready' || initialStatus === 'Busy') {
    //     pluginInstance.ribbonIconEl.ariaLabel = 'Open ComfyUI Web Interface';
    // } else {
    //     pluginInstance.ribbonIconEl.ariaLabel = 'Launch ComfyUI';
    // }
}