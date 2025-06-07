import { CivitAIService } from '../providers/CivitAIService';
import { HuggingFaceService } from '../providers/HuggingFaceService';
import type { IModelProvider, IModelProviderService } from '../interfaces';
import type { CivitAIModel, HuggingFaceModel } from '../../types/comfy';
import { handleProviderError } from '../../utils/errorHandler';

export type ModelProvider = 'civitai' | 'huggingface' | 'unknown';

export interface ModelProviderSearchResults {
    civitai: CivitAIModel[];
    huggingface: HuggingFaceModel[];
}

/**
 * Centralized service for managing multiple model providers
 * Provides unified access to CivitAI and HuggingFace services
 */
export class ModelProviderService implements IModelProviderService {
    readonly name = 'ModelProviderService';

    constructor(
        private civitAI: CivitAIService,
        private huggingFace: HuggingFaceService
    ) {}

    async initialize(): Promise<void> {
        // Initialize any required setup for provider services
        console.log(`🔧 ${this.name} initialized`);
    }

    async cleanup(): Promise<void> {
        // Clean up provider services
        this.civitAI.clearCache();
        this.huggingFace.clearCache();
        console.log(`🧹 ${this.name} cleaned up`);
    }

    /**
     * Detects model provider from file path patterns
     * @param filePath - The file path to analyze
     * @returns The detected provider or 'unknown'
     */
    detectProviderFromPath(filePath: string): ModelProvider {
        const pathLower = filePath.toLowerCase();
        const fileName = filePath.split('/').pop()?.toLowerCase() || '';
        
        // HuggingFace patterns
        if (pathLower.includes('huggingface') || 
            pathLower.includes('hf-hub') ||
            pathLower.includes('hf_') ||
            pathLower.match(/.*\/.*--.*\/.*/) ||
            fileName.includes('--')) {
            return 'huggingface';
        }
        
        // CivitAI patterns (hash-based filenames)
        if (pathLower.includes('civitai') ||
            fileName.match(/^[a-f0-9]{8,}\./)) {
            return 'civitai';
        }
        
        return 'unknown';
    }

    /**
     * Gets the appropriate provider service based on provider type
     * @param provider - The provider type
     * @returns The provider service instance
     */
    getProviderService(provider: ModelProvider): IModelProvider | null {
        switch (provider) {
            case 'civitai':
                return this.civitAI;
            case 'huggingface':
                return this.huggingFace;
            default:
                return null;
        }
    }

    /**
     * Search for models across all providers
     * @param query - Search query string
     * @returns Results from all providers
     */
    async searchAllProviders(query: string): Promise<ModelProviderSearchResults> {
        try {
            const [civitaiResults, hfResults] = await Promise.allSettled([
                this.civitAI.searchModelsByName(query),
                this.huggingFace.searchModelsByName(query)
            ]);

            return {
                civitai: civitaiResults.status === 'fulfilled' ? civitaiResults.value as CivitAIModel[] : [],
                huggingface: hfResults.status === 'fulfilled' ? hfResults.value as HuggingFaceModel[] : []
            };
        } catch (error) {
            handleProviderError(error, 'Error searching across providers');
            return {
                civitai: [],
                huggingface: []
            };
        }
    }

    /**
     * Search for a model using a specific provider
     * @param query - Search query string
     * @param provider - Specific provider to search
     * @returns Search results from the specified provider
     */
    async searchProvider(query: string, provider: ModelProvider): Promise<CivitAIModel[] | HuggingFaceModel[]> {
        const service = this.getProviderService(provider);
        if (!service) {
            throw new Error(`Unknown provider: ${provider}`);
        }

        try {
            return await service.searchModelsByName(query);
        } catch (error) {
            handleProviderError(error, `Error searching ${provider}`);
            return [];
        }
    }

    /**
     * Get model information from a specific provider
     * @param id - Model ID
     * @param provider - Provider to query
     * @returns Model information or null if not found
     */
    async getModelInfo(id: string, provider: ModelProvider): Promise<CivitAIModel | HuggingFaceModel | null> {
        const service = this.getProviderService(provider);
        if (!service) {
            throw new Error(`Unknown provider: ${provider}`);
        }

        try {
            return await service.getModelInfo(id);
        } catch (error) {
            handleProviderError(error, `Error getting model info from ${provider}`);
            return null;
        }
    }

    /**
     * Clear caches for all providers
     */
    clearAllCaches(): void {
        this.civitAI.clearCache();
        this.huggingFace.clearCache();
    }
}