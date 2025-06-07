import { Modal, App } from 'obsidian';
import type Workbench from '../../core/main';
import { CivitAIService } from '../../services/providers/CivitAIService';
import { HuggingFaceService } from '../../services/providers/HuggingFaceService';
import type { CivitAIModel, HuggingFaceModel, HuggingFaceFile } from '../../types/comfy';
import { handleUIError, handleProviderError } from '../../utils/errorHandler';

type SearchProvider = 'civitai' | 'huggingface' | 'all';

interface UnifiedSearchResult {
    provider: 'civitai' | 'huggingface';
    model: CivitAIModel | HuggingFaceModel;
}

/**
 * Unified modal for searching models across multiple providers
 */
export class UnifiedSearchModal extends Modal {
    private plugin: Workbench;
    private civitaiService: CivitAIService;
    private huggingfaceService: HuggingFaceService;
    private searchResults: UnifiedSearchResult[] = [];
    private currentQuery = '';
    private isLoading = false;
    private currentProvider: SearchProvider = 'all';

    constructor(app: App, plugin: Workbench) {
        super(app);
        this.plugin = plugin;
        this.civitaiService = new CivitAIService(plugin.settings.civitaiApiKey);
        this.huggingfaceService = new HuggingFaceService(plugin.settings.huggingfaceApiKey);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('wb-unified-search-modal');

        // Title
        contentEl.createEl('h2', { text: 'Search AI Models' });

        // Search input section
        const searchSection = contentEl.createDiv({ cls: 'wb-search-section' });
        
        // Provider selection (moved above search input)
        const providerSection = searchSection.createDiv({ cls: 'wb-provider-section' });
        providerSection.createEl('label', { 
            text: 'Search in:', 
            cls: 'wb-provider-label' 
        });
        
        const providerSelect = providerSection.createEl('select', { cls: 'wb-provider-select' });
        const providerOptions = [
            { value: 'all', text: 'All Providers' },
            { value: 'civitai', text: 'CivitAI' },
            { value: 'huggingface', text: 'HuggingFace' }
        ];
        
        providerOptions.forEach(option => {
            providerSelect.createEl('option', {
                value: option.value,
                text: option.text
            });
        });

        providerSelect.addEventListener('change', () => {
            this.currentProvider = providerSelect.value as SearchProvider;
        });
        
        // Search input container (moved below provider selection)
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

        // Filter options (dynamic based on provider)
        const filterSection = searchSection.createDiv({ cls: 'wb-filter-section' });
        this.createFilterOptions(filterSection);

        // Results section
        const resultsSection = contentEl.createDiv({ cls: 'wb-results-section' });
        const resultsContainer = resultsSection.createDiv({ cls: 'wb-results-container' });

        // Search functionality
        const performSearch = async () => {
            const query = searchInput.value.trim();

            if (!query) {
                handleUIError(new Error('Empty search term'), 'Please enter a search term');
                return;
            }

            this.isLoading = true;
            searchBtn.disabled = true;
            searchBtn.setText('Searching...');
            resultsContainer.empty();
            resultsContainer.createEl('div', { text: 'Searching...', cls: 'wb-loading' });

            try {
                console.log(`🔍 Starting unified search for: "${query}" in provider: ${this.currentProvider}`);
                const results = await this.searchModels(query);

                this.searchResults = results;
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

        // Update filters when provider changes
        providerSelect.addEventListener('change', () => {
            filterSection.empty();
            this.createFilterOptions(filterSection);
        });

        // Focus search input
        searchInput.focus();
    }

    private createFilterOptions(filterSection: HTMLElement) {
        if (this.currentProvider === 'civitai' || this.currentProvider === 'all') {
            // CivitAI specific filters
            const civitaiFilters = filterSection.createDiv({ cls: 'wb-civitai-filters' });
            
            // Create a row for Model Type and Base Model
            const topRow = civitaiFilters.createDiv({ cls: 'wb-filter-row' });
            
            const typeGroup = topRow.createDiv({ cls: 'wb-filter-group' });
            typeGroup.createEl('label', { text: 'Model Type:', cls: 'wb-filter-label' });
            const typeSelect = typeGroup.createEl('select', { cls: 'wb-type-select wb-filter-select' });
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

            const baseModelGroup = topRow.createDiv({ cls: 'wb-filter-group' });
            baseModelGroup.createEl('label', { text: 'Base Model:', cls: 'wb-filter-label' });
            const baseModelSelect = baseModelGroup.createEl('select', { cls: 'wb-basemodel-select wb-filter-select' });
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

            // Create a row for Sort by
            const bottomRow = civitaiFilters.createDiv({ cls: 'wb-filter-row' });
            
            const sortGroup = bottomRow.createDiv({ cls: 'wb-filter-group' });
            sortGroup.createEl('label', { text: 'Sort by:', cls: 'wb-filter-label' });
            const sortSelect = sortGroup.createEl('select', { cls: 'wb-sort-select wb-filter-select' });
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
        }

        if (this.currentProvider === 'huggingface' || this.currentProvider === 'all') {
            // HuggingFace specific filters
            const hfFilters = filterSection.createDiv({ cls: 'wb-hf-filters' });
            
            // Create a row for Task Type and Sort by
            const hfRow = hfFilters.createDiv({ cls: 'wb-filter-row' });
            
            const taskGroup = hfRow.createDiv({ cls: 'wb-filter-group' });
            taskGroup.createEl('label', { text: 'Task Type:', cls: 'wb-filter-label' });
            const taskSelect = taskGroup.createEl('select', { cls: 'wb-task-select wb-filter-select' });
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

            const hfSortGroup = hfRow.createDiv({ cls: 'wb-filter-group' });
            hfSortGroup.createEl('label', { text: 'Sort by:', cls: 'wb-filter-label' });
            const hfSortSelect = hfSortGroup.createEl('select', { cls: 'wb-hf-sort-select wb-filter-select' });
            const hfSortOptions = [
                { value: 'downloads', text: 'Downloads' },
                { value: 'likes', text: 'Likes' },
                { value: 'lastModified', text: 'Recently Updated' }
            ];
            
            hfSortOptions.forEach(option => {
                hfSortSelect.createEl('option', {
                    value: option.value,
                    text: option.text
                });
            });
        }
    }

    private async searchModels(query: string): Promise<UnifiedSearchResult[]> {
        const results: UnifiedSearchResult[] = [];

        if (this.currentProvider === 'civitai' || this.currentProvider === 'all') {
            try {
                console.log('🎨 Searching CivitAI...');
                const civitaiModels = await this.civitaiService.searchModelsByName(query);
                const civitaiResults: UnifiedSearchResult[] = civitaiModels.map(model => ({
                    provider: 'civitai' as const,
                    model
                }));
                results.push(...civitaiResults);
                console.log(`🎨 Found ${civitaiResults.length} CivitAI models`);
            } catch (error) {
                console.error('CivitAI search error:', error);
            }
        }

        if (this.currentProvider === 'huggingface' || this.currentProvider === 'all') {
            try {
                console.log('🤗 Searching HuggingFace...');
                const hfModels = await this.huggingfaceService.searchModelsSimple(query, 20);
                const hfResults: UnifiedSearchResult[] = hfModels.map(model => ({
                    provider: 'huggingface' as const,
                    model
                }));
                results.push(...hfResults);
                console.log(`🤗 Found ${hfResults.length} HuggingFace models`);
            } catch (error) {
                console.error('HuggingFace search error:', error);
            }
        }

        return results;
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

        // Group results by provider
        const civitaiResults = this.searchResults.filter(r => r.provider === 'civitai');
        const hfResults = this.searchResults.filter(r => r.provider === 'huggingface');

        const resultsList = container.createDiv({ cls: 'wb-results-list' });

        // Show provider sections
        if (civitaiResults.length > 0) {
            const civitaiSection = resultsList.createDiv({ cls: 'wb-provider-section' });
            civitaiSection.createEl('h3', { 
                text: `CivitAI (${civitaiResults.length} results)`,
                cls: 'wb-provider-header'
            });
            
            civitaiResults.forEach(result => {
                this.renderCivitAIModel(civitaiSection, result.model as CivitAIModel);
            });
        }

        if (hfResults.length > 0) {
            const hfSection = resultsList.createDiv({ cls: 'wb-provider-section' });
            hfSection.createEl('h3', { 
                text: `HuggingFace (${hfResults.length} results)`,
                cls: 'wb-provider-header'
            });
            
            hfResults.forEach(result => {
                this.renderHuggingFaceModel(hfSection, result.model as HuggingFaceModel);
            });
        }
    }

    private renderCivitAIModel(container: HTMLElement, model: CivitAIModel) {
        const modelCard = container.createDiv({ cls: 'wb-model-card wb-civitai-card' });
        
        // Provider badge
        const providerBadge = modelCard.createDiv({ cls: 'wb-provider-badge wb-civitai-badge' });
        providerBadge.setText('CivitAI');
        
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
            this.showCivitAIModelVersions(model);
        });
    }

    private renderHuggingFaceModel(container: HTMLElement, model: HuggingFaceModel) {
        const modelCard = container.createDiv({ cls: 'wb-model-card wb-hf-card' });
        
        // Provider badge
        const providerBadge = modelCard.createDiv({ cls: 'wb-provider-badge wb-hf-badge' });
        providerBadge.setText('HuggingFace');
        
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
                this.showHuggingFaceModelFiles(model, files);
            } catch (error) {
                console.error('Error fetching model files:', error);
                handleProviderError(error, 'Error fetching model files');
            }
        });
    }

    private showCivitAIModelVersions(model: CivitAIModel) {
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
                        handleUIError(new Error('URL copied'), `Download URL copied to clipboard: ${file.name}`);
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

    private showHuggingFaceModelFiles(model: HuggingFaceModel, files: HuggingFaceFile[]) {
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
                handleUIError(new Error('URL copied'), `Download URL copied to clipboard: ${file.path}`);
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
