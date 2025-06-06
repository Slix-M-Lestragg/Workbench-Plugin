import { Modal, App, Notice } from 'obsidian';
import type Workbench from './../../../main';
import { CivitAIService } from '../../../services/providers/CivitAIService';
import type { CivitAIModel } from '../../../types/comfy';

/**
 * Modal for searching and downloading CivitAI models
 */
export class CivitAISearchModal extends Modal {
    private plugin: Workbench;
    private civitaiService: CivitAIService;
    private searchResults: CivitAIModel[] = [];
    private currentQuery = '';
    private isLoading = false;

    constructor(app: App, plugin: Workbench) {
        super(app);
        this.plugin = plugin;
        this.civitaiService = new CivitAIService(plugin.settings.civitaiApiKey);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('wb-civitai-search-modal');

        // Title
        contentEl.createEl('h2', { text: 'Search CivitAI Models' });

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
        filterSection.createEl('label', { text: 'Model Type:' });
        
        const typeSelect = filterSection.createEl('select', { cls: 'wb-type-select' });
        const typeOptions = [
            { value: '', text: 'All Types' },
            { value: 'Checkpoint', text: 'Checkpoint' },
            { value: 'LORA', text: 'LoRA' },
            { value: 'TextualInversion', text: 'Textual Inversion' },
            { value: 'Hypernetwork', text: 'Hypernetwork' },
            { value: 'VAE', text: 'VAE' },
            { value: 'Controlnet', text: 'ControlNet' },
            { value: 'Upscaler', text: 'Upscaler' }
        ];
        
        typeOptions.forEach(option => {
            typeSelect.createEl('option', {
                value: option.value,
                text: option.text
            });
        });

        // Base Model options
        filterSection.createEl('label', { text: 'Base Model:' });
        const baseModelSelect = filterSection.createEl('select', { cls: 'wb-basemodel-select' });
        const baseModelOptions = [
            { value: '', text: 'All Base Models' },
            { value: 'SD 1.5', text: 'SD 1.5' },
            { value: 'SDXL 1.0', text: 'SDXL 1.0' },
            { value: 'SD 2.0', text: 'SD 2.0' },
            { value: 'SD 2.1', text: 'SD 2.1' },
            { value: 'Other', text: 'Other' }
        ];
        
        baseModelOptions.forEach(option => {
            baseModelSelect.createEl('option', {
                value: option.value,
                text: option.text
            });
        });

        // Sort options
        filterSection.createEl('label', { text: 'Sort by:' });
        const sortSelect = filterSection.createEl('select', { cls: 'wb-sort-select' });
        const sortOptions = [
            { value: 'Most Downloaded', text: 'Most Downloaded' },
            { value: 'Most Liked', text: 'Most Liked' },
            { value: 'Highest Rated', text: 'Highest Rated' },
            { value: 'Newest', text: 'Newest' }
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
                console.log('🎨 Starting CivitAI search for:', query);
                const models = await this.civitaiService.searchModelsByName(query);

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
                text: model.name,
                cls: 'wb-model-title'
            });
            
            modelHeader.createSpan({ 
                text: `by ${model.creator?.username || 'Unknown'}`,
                cls: 'wb-model-author'
            });

            // Model stats
            const modelStats = modelCard.createDiv({ cls: 'wb-model-stats' });
            modelStats.createSpan({ 
                text: `👍 ${model.stats?.favoriteCount || 0}`,
                cls: 'wb-stat'
            });
            modelStats.createSpan({ 
                text: `📥 ${model.stats?.downloadCount || 0}`,
                cls: 'wb-stat'
            });
            modelStats.createSpan({ 
                text: `⭐ ${model.stats?.rating || 0}/5`,
                cls: 'wb-stat'
            });

            // Model type and base model
            const modelMeta = modelCard.createDiv({ cls: 'wb-model-meta' });
            modelMeta.createSpan({ 
                text: `Type: ${model.type}`,
                cls: 'wb-meta-item'
            });
            
            if (model.modelVersions && model.modelVersions.length > 0) {
                const latestVersion = model.modelVersions[0];
                if (latestVersion.baseModel) {
                    modelMeta.createSpan({ 
                        text: `Base: ${latestVersion.baseModel}`,
                        cls: 'wb-meta-item'
                    });
                }
            }

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

            // Description (truncated)
            if (model.description) {
                const description = model.description.length > 150 
                    ? model.description.substring(0, 150) + '...'
                    : model.description;
                
                modelCard.createDiv({ 
                    text: description,
                    cls: 'wb-model-description'
                });
            }

            // Actions
            const actionsContainer = modelCard.createDiv({ cls: 'wb-model-actions' });
            
            const viewBtn = actionsContainer.createEl('button', {
                text: 'View on CivitAI',
                cls: 'wb-action-btn wb-view-btn'
            });
            
            viewBtn.addEventListener('click', () => {
                window.open(`https://civitai.com/models/${model.id}`, '_blank');
            });

            const downloadBtn = actionsContainer.createEl('button', {
                text: 'View Versions',
                cls: 'wb-action-btn wb-download-btn'
            });
            
            downloadBtn.addEventListener('click', () => {
                this.showModelVersions(model);
            });
        });
    }

    private showModelVersions(model: CivitAIModel) {
        const versionsModal = new Modal(this.app);
        const { contentEl } = versionsModal;
        
        contentEl.createEl('h2', { text: `Versions for ${model.name}` });
        
        if (!model.modelVersions || model.modelVersions.length === 0) {
            contentEl.createEl('p', { text: 'No versions found for this model.' });
            return;
        }

        const versionsList = contentEl.createDiv({ cls: 'wb-versions-list' });
        
        model.modelVersions.forEach(version => {
            const versionItem = versionsList.createDiv({ cls: 'wb-version-item' });
            
            // Version header
            const versionHeader = versionItem.createDiv({ cls: 'wb-version-header' });
            versionHeader.createEl('h4', { 
                text: version.name,
                cls: 'wb-version-name'
            });
            
            if (version.baseModel) {
                versionHeader.createSpan({ 
                    text: version.baseModel,
                    cls: 'wb-version-base'
                });
            }

            // Version stats
            if (version.stats) {
                const versionStats = versionItem.createDiv({ cls: 'wb-version-stats' });
                versionStats.createSpan({ 
                    text: `📥 ${version.stats.downloadCount || 0}`,
                    cls: 'wb-stat'
                });
                versionStats.createSpan({ 
                    text: `⭐ ${version.stats.rating || 0}/5`,
                    cls: 'wb-stat'
                });
            }

            // Trained words
            if (version.trainedWords && version.trainedWords.length > 0) {
                const trainedWordsDiv = versionItem.createDiv({ cls: 'wb-trained-words' });
                trainedWordsDiv.createSpan({ 
                    text: 'Trigger words: ',
                    cls: 'wb-trained-words-label'
                });
                trainedWordsDiv.createSpan({ 
                    text: version.trainedWords.join(', '),
                    cls: 'wb-trained-words-list'
                });
            }

            // Files
            if (version.files && version.files.length > 0) {
                const filesDiv = versionItem.createDiv({ cls: 'wb-version-files' });
                filesDiv.createEl('strong', { text: 'Files:' });
                
                version.files.forEach(file => {
                    const fileDiv = filesDiv.createDiv({ cls: 'wb-file-item' });
                    
                    fileDiv.createSpan({ 
                        text: file.name,
                        cls: 'wb-file-name'
                    });
                    
                    if (file.sizeKB) {
                        fileDiv.createSpan({ 
                            text: this.formatFileSize(file.sizeKB * 1024),
                            cls: 'wb-file-size'
                        });
                    }

                    const downloadBtn = fileDiv.createEl('button', {
                        text: 'Copy Download URL',
                        cls: 'wb-download-file-btn'
                    });
                    
                    downloadBtn.addEventListener('click', () => {
                        const downloadUrl = file.downloadUrl || `https://civitai.com/api/download/models/${version.id}`;
                        navigator.clipboard.writeText(downloadUrl);
                        new Notice(`Download URL copied to clipboard: ${file.name}`);
                    });
                });
            }

            // Description
            if (version.description) {
                const description = versionItem.createDiv({ cls: 'wb-version-description' });
                description.createEl('strong', { text: 'Description:' });
                description.createEl('p', { text: version.description });
            }
        });

        const closeBtn = contentEl.createEl('button', {
            text: 'Close',
            cls: 'wb-modal-close-btn'
        });
        
        closeBtn.addEventListener('click', () => {
            versionsModal.close();
        });

        versionsModal.open();
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