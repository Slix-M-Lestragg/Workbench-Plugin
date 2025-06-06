import { ItemView, WorkspaceLeaf, App, setIcon, Notice, Modal } from 'obsidian';
import * as path from 'path';
import type Workbench from './../../../main';
import { buildModelTree } from './../../../types';
import { ModelMetadataManager } from '../../../services/models/ModelMetadataManager';
import { HuggingFaceService } from '../../../services/providers/HuggingFaceService';
import { CIVITAI_ICON_NAME, HUGGINGFACE_ICON_NAME } from './../../icons';
import type { HuggingFaceModel, HuggingFaceFile } from '../../../types/comfy';
import { ModelTreeRenderer } from './ModelTreeRenderer';
import { ModelNoteManager } from './ModelNoteManager';
import { findModelsRecursive } from './../../../utils';
import { MODEL_LIST_VIEW_TYPE, MODEL_LIST_ICON } from '../../../types/ui';


export class ModelListView extends ItemView {
    plugin: Workbench;
    private metadataManager: ModelMetadataManager | null = null;
    private huggingfaceService: HuggingFaceService | null = null;
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
        if (this.plugin && this.plugin.settings.enableCivitaiIntegration) {
            this.metadataManager = new ModelMetadataManager(
                this.app.vault,
                this.plugin.settings.civitaiApiKey,
                this.plugin.settings.huggingfaceApiKey
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
        
        // Add refresh metadata button if CivitAI integration is enabled
        if (this.plugin && this.plugin.settings.enableCivitaiIntegration) {
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
        if (this.plugin && this.plugin.settings.enableHuggingfaceIntegration) {
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

            // Add HuggingFace search button
            const searchHFBtn = actionsEl.createEl('button', {
                cls: 'wb-search-hf-btn',
                title: 'Search HuggingFace models'
            });
            setIcon(searchHFBtn, 'search');
            
            searchHFBtn.addEventListener('click', () => {
                this.showHuggingFaceSearchModal();
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
     * Shows the HuggingFace search modal for discovering and downloading models
     */
    private showHuggingFaceSearchModal(): void {
        new HuggingFaceSearchModal(this.app, this.plugin).open();
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

/**
 * Modal for searching and downloading HuggingFace models
 */
class HuggingFaceSearchModal extends Modal {
    private plugin: Workbench;
    private huggingfaceService: HuggingFaceService;
    private searchResults: HuggingFaceModel[] = [];
    private currentQuery = '';
    private isLoading = false;

    constructor(app: App, plugin: Workbench) {
        super(app);
        this.plugin = plugin;
        this.huggingfaceService = new HuggingFaceService(plugin.settings.huggingfaceApiKey);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('wb-hf-search-modal');

        // Title
        contentEl.createEl('h2', { text: 'Search HuggingFace Models' });

        // Search input section
        const searchSection = contentEl.createDiv({ cls: 'wb-search-section' });
        
        const searchInputContainer = searchSection.createDiv({ cls: 'wb-search-input-container' });
        const searchInput = searchInputContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search for models...',
            cls: 'wb-search-input'
        });

        const searchBtn = searchInputContainer.createEl('button', {
            text: 'Search',
            cls: 'wb-search-btn'
        });

        // Filter options
        const filterSection = searchSection.createDiv({ cls: 'wb-filter-section' });
        filterSection.createEl('label', { text: 'Task Type:' });
        
        const taskSelect = filterSection.createEl('select', { cls: 'wb-task-select' });
        const taskOptions = [
            { value: '', text: 'All Tasks' },
            { value: 'text-to-image', text: 'Text to Image' },
            { value: 'image-to-image', text: 'Image to Image' },
            { value: 'text-generation', text: 'Text Generation' },
            { value: 'image-classification', text: 'Image Classification' },
            { value: 'object-detection', text: 'Object Detection' }
        ];
        
        taskOptions.forEach(option => {
            taskSelect.createEl('option', {
                value: option.value,
                text: option.text
            });
        });

        // Sort options
        filterSection.createEl('label', { text: 'Sort by:' });
        const sortSelect = filterSection.createEl('select', { cls: 'wb-sort-select' });
        const sortOptions = [
            { value: 'downloads', text: 'Downloads' },
            { value: 'likes', text: 'Likes' },
            { value: 'lastModified', text: 'Recently Updated' }
        ];
        
        sortOptions.forEach(option => {
            sortSelect.createEl('option', {
                value: option.value,
                text: option.text
            });
        });

        // Results section
        const resultsSection = contentEl.createDiv({ cls: 'wb-results-section' });
        const resultsContainer = resultsSection.createDiv({ cls: 'wb-results-container' });

        // Search functionality
        const performSearch = async () => {
            const query = searchInput.value.trim();

            if (!query) {
                new Notice('Please enter a search term');
                return;
            }

            this.isLoading = true;
            searchBtn.disabled = true;
            searchBtn.setText('Searching...');
            resultsContainer.empty();
            resultsContainer.createEl('div', { text: 'Searching...', cls: 'wb-loading' });

            try {
                // Use the simple search method to avoid API issues
                console.log('🔍 Starting HuggingFace search for:', query);
                const models = await this.huggingfaceService.searchModelsSimple(query, 20);

                this.searchResults = models;
                this.currentQuery = query;
                this.renderResults(resultsContainer);

            } catch (error) {
                console.error('Search error:', error);
                resultsContainer.empty();
                resultsContainer.createEl('div', { 
                    text: 'Search failed. Please try again.', 
                    cls: 'wb-error' 
                });
            } finally {
                this.isLoading = false;
                searchBtn.disabled = false;
                searchBtn.setText('Search');
            }
        };

        // Event listeners
        searchBtn.addEventListener('click', performSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        // Focus search input
        searchInput.focus();
    }

    private renderResults(container: HTMLElement) {
        container.empty();

        if (this.searchResults.length === 0) {
            container.createEl('div', { 
                text: `No models found for "${this.currentQuery}"`, 
                cls: 'wb-no-results' 
            });
            return;
        }

        const resultsList = container.createDiv({ cls: 'wb-results-list' });
        
        this.searchResults.forEach(model => {
            const modelCard = resultsList.createDiv({ cls: 'wb-model-card' });
            
            // Model header
            const modelHeader = modelCard.createDiv({ cls: 'wb-model-header' });
            
            modelHeader.createEl('h3', { 
                text: model.id,
                cls: 'wb-model-title'
            });
            
            modelHeader.createSpan({ 
                text: `by ${model.author}`,
                cls: 'wb-model-author'
            });

            // Model stats
            const modelStats = modelCard.createDiv({ cls: 'wb-model-stats' });
            modelStats.createSpan({ 
                text: `👍 ${model.likes || 0}`,
                cls: 'wb-stat'
            });
            modelStats.createSpan({ 
                text: `📥 ${model.downloads || 0}`,
                cls: 'wb-stat'
            });

            // Model tags
            if (model.tags && model.tags.length > 0) {
                const tagsContainer = modelCard.createDiv({ cls: 'wb-model-tags' });
                model.tags.slice(0, 5).forEach(tag => {
                    tagsContainer.createSpan({ 
                        text: tag,
                        cls: 'wb-tag'
                    });
                });
            }

            // Pipeline tag
            if (model.pipeline_tag) {
                const pipelineTag = modelCard.createDiv({ cls: 'wb-pipeline-tag' });
                pipelineTag.createSpan({ 
                    text: `Task: ${model.pipeline_tag}`,
                    cls: 'wb-pipeline'
                });
            }

            // Actions
            const actionsContainer = modelCard.createDiv({ cls: 'wb-model-actions' });
            
            const viewBtn = actionsContainer.createEl('button', {
                text: 'View on HuggingFace',
                cls: 'wb-action-btn wb-view-btn'
            });
            
            viewBtn.addEventListener('click', () => {
                window.open(`https://huggingface.co/${model.id}`, '_blank');
            });

            const downloadBtn = actionsContainer.createEl('button', {
                text: 'View Files',
                cls: 'wb-action-btn wb-download-btn'
            });
            
            downloadBtn.addEventListener('click', async () => {
                try {
                    const files = await this.huggingfaceService.getModelFiles(model.id);
                    this.showModelFiles(model, files);
                } catch (error) {
                    console.error('Error fetching model files:', error);
                    new Notice('Error fetching model files');
                }
            });
        });
    }

    private showModelFiles(model: HuggingFaceModel, files: HuggingFaceFile[]) {
        const filesModal = new Modal(this.app);
        const { contentEl } = filesModal;
        
        contentEl.createEl('h2', { text: `Files for ${model.id}` });
        
        if (files.length === 0) {
            contentEl.createEl('p', { text: 'No files found for this model.' });
            return;
        }

        const filesList = contentEl.createDiv({ cls: 'wb-files-list' });
        
        files.forEach(file => {
            const fileItem = filesList.createDiv({ cls: 'wb-file-item' });
            
            fileItem.createSpan({ 
                text: file.path,
                cls: 'wb-file-name'
            });
            
            if (file.size) {
                fileItem.createSpan({ 
                    text: this.formatFileSize(file.size),
                    cls: 'wb-file-size'
                });
            }

            const downloadBtn = fileItem.createEl('button', {
                text: 'Download URL',
                cls: 'wb-download-file-btn'
            });
            
            downloadBtn.addEventListener('click', () => {
                const downloadUrl = `https://huggingface.co/${model.id}/resolve/main/${file.path}`;
                navigator.clipboard.writeText(downloadUrl);
                new Notice(`Download URL copied to clipboard: ${file.path}`);
            });
        });

        const closeBtn = contentEl.createEl('button', {
            text: 'Close',
            cls: 'wb-modal-close-btn'
        });
        
        closeBtn.addEventListener('click', () => {
            filesModal.close();
        });

        filesModal.open();
    }

    private formatFileSize(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}