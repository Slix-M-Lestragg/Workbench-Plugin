import type Workbench from './main';
import { launchComfyUiDesktopApp, launchComfyUiScript } from './comfy/launch'; // Import launch functions

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

    // Add Ribbon Icon action here as well if it primarily triggers a command-like action
    pluginInstance.addRibbonIcon('image', 'Launch ComfyUI Script', (evt: MouseEvent) => {
        launchComfyUiScript(pluginInstance);
    });
}