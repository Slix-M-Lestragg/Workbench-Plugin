/**
 * Model Note Handler
 * 
 * Handles all model note file modifications including:
 * - Automatic provider change detection
 * - Integration with ModelNoteManager for metadata updates
 * - User feedback for successful provider changes
 * - Robust error handling for file processing issues
 */

import { TFile } from 'obsidian';
import * as path from 'path';
import { handleUIError } from '../utils/errorHandler';
import type { ModelListView } from '../ui/views/ModelListView';
import type Workbench from '../core/main';

// View type constants
const MODEL_LIST_VIEW_TYPE = 'workbench-model-list-view';

export class ModelNoteHandler {
    constructor(private plugin: Workbench) {}

    /**
     * Handle modifications to model note files with automatic provider change detection.
     * 
     * This method monitors changes to markdown files in the configured model notes folder
     * and automatically processes provider metadata changes, ensuring model information
     * stays synchronized with external provider services.
     * 
     * Key features:
     * - Automatic detection of files within the model notes folder
     * - Provider change detection and processing
     * - Integration with ModelNoteManager for metadata updates
     * - User feedback for successful provider changes
     * - Robust error handling for file processing issues
     * 
     * @param file - The modified markdown file to process
     */
    async handleModelNoteModification(file: TFile): Promise<void> {
        const deviceSettings = this.plugin.getCurrentDeviceSettings();
        const modelNotesFolder = deviceSettings.modelNotesFolderPath?.trim();
        
        // If model notes folder isn't set, we can't determine if this is a model note
        if (!modelNotesFolder) {
            console.log("Model notes folder not set in settings, skipping note modification check");
            return;
        }
        
        // Check if the modified file is in the model notes folder
        const filePath = file.path;
        if (!filePath.startsWith(modelNotesFolder)) {
            // Not a model note or it's outside the configured folder
            return; 
        }
        
        try {
            console.log(`Detected modification to potential model note: ${filePath}`);
            
            // Just pass the full file path to the ModelNoteManager
            // The manager will extract the model path from the frontmatter
            // We don't need to calculate a relative path here
            
            // Find and process with the appropriate ModelNoteManager
            const modelListLeaves = this.plugin.app.workspace.getLeavesOfType(MODEL_LIST_VIEW_TYPE);
            if (modelListLeaves.length === 0) {
                console.log("No ModelListView instances found to process note modification");
                return;
            }
            
            let processed = false;
            
            for (const leaf of modelListLeaves) {
                const view = leaf.view as ModelListView;
                if (view && view.noteManager) {
                    // This might be a provider change, let the note manager handle it
                    const result = await view.noteManager.detectAndProcessProviderChange(filePath);
                    
                    if (result) {
                        processed = true;
                        handleUIError(new Error('Provider change detected'), `Provider change detected in note: ${path.basename(filePath)}. Model metadata has been refreshed.`);
                        break; // Stop after successful processing
                    }
                }
            }
            
            if (!processed) {
                console.log(`No model found or no provider change detected for note: ${filePath}`);
            }
        } catch (error) {
            console.error(`Error handling model note modification for ${filePath}:`, error);
        }
    }
}
