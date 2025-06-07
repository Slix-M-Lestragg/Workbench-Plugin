import { ItemView, WorkspaceLeaf, App, setIcon, Notice } from 'obsidian';
import * as path from 'path';
import type Workbench from './../../../main';
import { buildModelTree } from './../../../types';
import { ModelMetadataManager } from '../../../services/models/ModelMetadataManager';
import { CIVITAI_ICON_NAME, HUGGINGFACE_ICON_NAME } from '../../utilities/icons';
import { ModelTreeRenderer } from './ModelTreeRenderer';
import { ModelNoteManager } from './ModelNoteManager';
import { UnifiedSearchModal } from '../../modals/UnifiedSearchModal';
import { findModelsRecursive } from './../../../utils';
import { MODEL_LIST_VIEW_TYPE, MODEL_LIST_ICON } from '../../../types/ui';


export class ModelListView extends ItemView {
    plugin: Workbench;
    private metadataManager: ModelMetadataManager | null = null;
    private treeRenderer: ModelTreeRenderer | null = null;
    private _noteManager: ModelNoteManager | null = null;
    
    /**
     * Gets the note manager used by this view
     */
    get noteManager(): ModelNoteManager | null {
        return this._noteManager;
    }

    constructor(leaf: WorkspaceLeaf, app: App, plugin: Workbench) {
        super(leaf);
        this.app = app;
        // Get the plugin instance using the app object
        this.plugin = plugin;
        if (!this.plugin) {
            console.error("ModelListView: Could not get Workbench plugin instance!");
        }
    }

    getViewType(): string {
        return MODEL_LIST_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "ComfyUI Models";
    }

    getIcon(): string {
        return MODEL_LIST_ICON;
    }

    async onOpen(isRefresh = false) {
        // Initialize metadata manager if CivitAI integration is enabled
        if (this.plugin && this.plugin.configManager.getSettings().enableCivitaiIntegration) {
            this.metadataManager = new ModelMetadataManager(
                this.app.vault,
                this.plugin.configManager.getSettings().civitaiApiKey,
                this.plugin.configManager.getSettings().huggingfaceApiKey
            );
        }

        // Initialize the sub-components
        this.treeRenderer = new ModelTreeRenderer(this.plugin, this.metadataManager);
        this._noteManager = new ModelNoteManager(this.plugin, this.metadataManager);

        const container = this.contentEl;
        container.empty();
        container.addClass('wb-model-list-view'); // Add a class for potential styling
        
        // Create header with title and refresh button
        const headerEl = container.createDiv({ cls: 'wb-model-list-header' });
        headerEl.createEl("h4", { text: "ComfyUI Models" });
        
        const actionsEl = headerEl.createDiv({ cls: 'wb-header-actions' });
        
        // Add refresh button
        const refreshBtn = actionsEl.createEl('button', {
            cls: 'wb-refresh-btn',
            title: 'Refresh model list'
        });
        setIcon(refreshBtn, 'refresh-cw');
        
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.addClass('wb-refreshing');
            try {
                await this.refresh();
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.removeClass('wb-refreshing');
            }
        });
        
        // Add unified search button (only show if either provider is enabled)
        if (this.plugin && (this.plugin.configManager.getSettings().enableCivitaiIntegration || this.plugin.configManager.getSettings().enableHuggingfaceIntegration)) {
            const searchBtn = actionsEl.createEl('button', {
                cls: 'wb-refresh-btn',
                title: 'Search for models'
            });
            setIcon(searchBtn, 'search');
            
            searchBtn.addEventListener('click', () => {
                this.showUnifiedSearchModal();
            });
        }
        
        // Add refresh metadata button if CivitAI integration is enabled
        if (this.plugin && this.plugin.configManager.getSettings().enableCivitaiIntegration) {
            const refreshMetadataBtn = actionsEl.createEl('button', {
                cls: 'wb-refresh-metadata-btn',
                title: 'Refresh all model metadata from CivitAI'
            });
            setIcon(refreshMetadataBtn, CIVITAI_ICON_NAME);
            
            refreshMetadataBtn.addEventListener('click', async () => {
                refreshMetadataBtn.disabled = true;
                refreshMetadataBtn.addClass('wb-refreshing');
                try {
                    await this.refreshWithMetadata();
                    new Notice('Model metadata refreshed from CivitAI');
                } catch (error) {
                    console.error('Error refreshing metadata:', error);
                    new Notice('Error refreshing metadata. Check console for details.');
                } finally {
                    refreshMetadataBtn.disabled = false;
                    refreshMetadataBtn.removeClass('wb-refreshing');
                }
            });

        }

        // Add HuggingFace refresh button if HuggingFace integration is enabled
        if (this.plugin && this.plugin.configManager.getSettings().enableHuggingfaceIntegration) {
            const refreshHFBtn = actionsEl.createEl('button', {
                cls: 'wb-refresh-hf-btn',
                title: 'Refresh model metadata from HuggingFace'
            });
            setIcon(refreshHFBtn, HUGGINGFACE_ICON_NAME);
            
            refreshHFBtn.addEventListener('click', async () => {
                refreshHFBtn.disabled = true;
                refreshHFBtn.addClass('wb-refreshing');
                try {
                    await this.refreshHuggingFaceMetadata();
                    new Notice('HuggingFace model metadata refreshed');
                } catch (error) {
                    console.error('Error refreshing HuggingFace metadata:', error);
                    new Notice('Error refreshing HuggingFace metadata. Check console for details.');
                } finally {
                    refreshHFBtn.disabled = false;
                    refreshHFBtn.removeClass('wb-refreshing');
                }
            });
        }

        // --- End search interface ---

        if (!this.plugin) {
            container.createEl("p", { text: "Error: Workbench plugin instance not found." });
            return;
        }

        const deviceSettings = this.plugin.getCurrentDeviceSettings();
        const comfyPath = deviceSettings.comfyUiPath?.trim();
        const modelNotesFolderPath = deviceSettings.modelNotesFolderPath?.trim(); // Get notes folder path

        if (!comfyPath) {
            container.createEl("p", { text: "ComfyUI base directory path is not set in settings for the current OS." });
            return;
        }

        // Check if the notes folder path is set
        if (!modelNotesFolderPath) {
             container.createEl("p", { cls: 'wb-warning-text', text: "Warning: Model Notes Folder is not set in Workbench settings. Markdown notes for models will not be created." });
             // Continue without note creation functionality
        }

        const modelsPath = path.join(comfyPath, 'models');
        const loadingEl = container.createEl("p", { text: `Scanning models directory: ${modelsPath}...` });

        try {
            // Use the recursive function to find all model files
            const scanResult = await findModelsRecursive(modelsPath, modelsPath);
            const modelFiles = scanResult.modelFiles;
            // Note: directoryInfo not needed since we disabled initial note creation
            
            loadingEl.setText(`Found ${modelFiles.length} model files. Processing...`); // Update loading text

            // --- DISABLED: Create Markdown notes for each model file (if setting is enabled) ---
            // This has been disabled to prevent creating notes with empty metadata during folder scan.
            // Notes are now only created when users click on model names in the UI, using pre-found API metadata.
            /*
            if (modelNotesFolderPath && modelFiles.length > 0 && this._noteManager) {
                new Notice(`Creating/checking notes for ${modelFiles.length} models...`, 3000);
                const noteManager = this._noteManager; // Capture reference
                const noteCreationPromises = modelFiles.map(relativeModelPath =>
                    // Pass modelsPath and directoryInfo to the function
                    noteManager.createModelNoteIfNeeded(relativeModelPath, modelsPath, directoryInfo)
                );
                await Promise.all(noteCreationPromises); // Wait for all checks/creations
                new Notice(`Finished processing model notes.`, 2000);
            }
            */
            // --- End note creation ---

            loadingEl.remove(); // Remove loading message

            if (modelFiles.length === 0) {
                container.createEl("p", { text: "No model files found in the directory or its subdirectories." });
            } else {
                // Build a nested tree structure from the flat file list
                const modelTree = buildModelTree(modelFiles);
                // console.log(`Model tree structure:`, modelTree); // Keep for debugging if needed

                // --- Render the nested tree ---
                const treeRootEl = container.createDiv({ cls: 'wb-model-tree-root' });
                if (this.treeRenderer) {
                    await this.treeRenderer.renderModelTree(modelTree, treeRootEl, isRefresh); // Pass isRefresh flag
                }
            }
        } catch (error: unknown) {
            loadingEl.remove(); // Remove loading message
            console.error(`Error scanning models directory (${modelsPath}):`, error);
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                container.createEl("p", { cls: 'wb-error-text', text: `Error: Base models directory not found at '${modelsPath}'. Please check your ComfyUI path settings.` });
            } else {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                container.createEl("p", { cls: 'wb-error-text', text: `Error scanning models directory: ${errorMessage}` });
            }
        }
    }

    async onClose() {
        // Clean up view content
        this.contentEl.empty();
    }

    /**
     * Shows the unified search modal for discovering and downloading models from multiple providers
     */
    private showUnifiedSearchModal(): void {
        new UnifiedSearchModal(this.app, this.plugin).open();
    }

    /**
     * Refresh the model list view
     */
    private async refresh(isRefresh = true): Promise<void> {
        await this.onOpen(isRefresh);
    }

    /**
     * Refresh model metadata from CivitAI
     */
    private async refreshWithMetadata(): Promise<void> {
        if (this.metadataManager) {
            await this.metadataManager.refreshAllMetadata();
        }
        await this.refresh(true); // Explicitly mark as refresh
    }

    /**
     * Refresh model metadata from HuggingFace
     */
    private async refreshHuggingFaceMetadata(): Promise<void> {
        if (this.metadataManager) {
            // For now, this would trigger a refresh of HuggingFace metadata
            // Implementation would depend on how HuggingFace metadata is stored/managed
            console.log('HuggingFace metadata refresh triggered');
        }
        await this.refresh(true); // Explicitly mark as refresh
    }
}