/**
 * File Menu Manager
 * 
 * Handles all file context menu integration including:
 * - Context menu items for JSON workflow files
 * - Workflow execution from files
 * - Copy workflow and open ComfyUI functionality
 */

import { Menu, TFile } from 'obsidian';
import { handleUIError, handleConnectionError, handleSettingsError } from '../utils/errorHandler';
import { updateStatusBar } from '../ui/components/status_bar';
import { runWorkflow } from '../services/comfy/generation';
import type Workbench from '../core/main';

export class FileMenuManager {
    constructor(private plugin: Workbench) {}

    /**
     * Add "Copy Workflow & Open ComfyUI" context menu item for JSON workflow files.
     * This provides users with a quick way to copy workflow data and open the ComfyUI interface.
     * 
     * @param menu - The current file context menu reference
     * @param file - The JSON workflow file being right-clicked
     */
    addCopyAndOpenComfyMenuItem(menu: Menu, file: TFile): void {
        const apiUrlString = this.plugin.settings.comfyApiUrl?.trim();
        if (apiUrlString) {
            menu.addItem((item) => {
                item.setTitle("Copy Workflow & Open ComfyUI")
                    .setIcon("copy-plus")
                    .onClick(async () => {
                        if (this.plugin.settings.comfyApiUrl) {
                            try {
                                const workflowJson = await this.plugin.app.vault.read(file);
                                await navigator.clipboard.writeText(workflowJson);
                                window.open(this.plugin.settings.comfyApiUrl, '_blank');
                                handleUIError(new Error('Workflow copied'), `Workflow '${file.name}' copied! Paste it into ComfyUI (Cmd/Ctrl+V).`);
                            } catch (error) {
                                console.error("Error copying workflow or opening ComfyUI:", error);
                                handleUIError(error, `Failed to copy workflow: ${error instanceof Error ? error.message : String(error)}`);
                            }
                        } else {
                            handleSettingsError(new Error('ComfyUI API URL not set'), "ComfyUI API URL is not set in settings.");
                        }
                    });
            });
        }
    }

    /**
     * Add "Run ComfyUI Workflow" context menu item for JSON workflow files.
     * This enables direct workflow execution from the file context menu when ComfyUI is connected.
     * 
     * @param menu - The current file context menu reference  
     * @param file - The JSON workflow file being right-clicked
     */
    addRunWorkflowMenuItem(menu: Menu, file: TFile): void {
        if (this.plugin.currentComfyStatus === 'Ready' || this.plugin.currentComfyStatus === 'Busy') {
            menu.addItem((item) => {
                item.setTitle("Run ComfyUI Workflow")
                    .setIcon("play-circle")
                    .onClick(async () => {
                        await this.executeWorkflowFromFile(file);
                    });
            });
        } else if (this.plugin.currentComfyStatus !== 'Disconnected' && this.plugin.currentComfyStatus !== 'Error') {
            menu.addItem((item) => {
                item.setTitle("Run ComfyUI Workflow (ComfyUI not ready)")
                    .setIcon("play-circle")
                    .setDisabled(true);
            });
        }
    }

    /**
     * Execute a ComfyUI workflow from a JSON file with comprehensive error handling.
     * This method loads, parses, and executes workflow files through the ComfyUI API.
     * 
     * @param file - The JSON file containing the workflow definition
     */
    async executeWorkflowFromFile(file: TFile): Promise<void> {
        if (!this.plugin.comfyApi || (this.plugin.currentComfyStatus !== 'Ready' && this.plugin.currentComfyStatus !== 'Busy')) {
            handleConnectionError(new Error('ComfyUI not ready'), 'ComfyUI is not connected or ready. Please check connection.');
            return;
        }
        try {
            handleUIError(new Error('Loading workflow'), `Loading workflow: ${file.name}`);
            const workflowJson = await this.plugin.app.vault.read(file);
            const workflowData = JSON.parse(workflowJson);
            console.log(`Running workflow from file: ${file.path}`);
            updateStatusBar(this.plugin, 'Busy', `Running workflow: ${file.name}`);
            await runWorkflow(this.plugin, workflowData);
        } catch (error) {
            console.error(`Error running workflow from ${file.path}:`, error);
            handleUIError(error, `Failed to run workflow: ${error instanceof Error ? error.message : String(error)}`);
            updateStatusBar(this.plugin, 'Error', 'Workflow execution failed.');
        }
    }
}
