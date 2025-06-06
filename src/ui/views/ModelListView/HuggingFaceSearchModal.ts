import { Modal, App, Notice } from 'obsidian';
import type Workbench from './../../../main';
import { HuggingFaceService } from '../../../services/providers/HuggingFaceService';
import type { HuggingFaceModel, HuggingFaceFile } from '../../../types/comfy';

/**
 * Modal for searching and downloading HuggingFace models
 */
export class HuggingFaceSearchModal extends Modal {
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
