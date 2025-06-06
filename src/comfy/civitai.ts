import { requestUrl } from 'obsidian';
import { CivitAIModel, CivitAIModelVersion } from '../types/comfy';

export class CivitAIService {
    private static readonly BASE_URL = 'https://civitai.com/api/v1';
    private static readonly RATE_LIMIT_DELAY = 1000; // 1 second between requests
    private lastRequestTime = 0;
    private cache = new Map<string, unknown>();
    private apiKey?: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey;
    }

    private async rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < CivitAIService.RATE_LIMIT_DELAY) {
            await new Promise(resolve => 
                setTimeout(resolve, CivitAIService.RATE_LIMIT_DELAY - timeSinceLastRequest)
            );
        }
        this.lastRequestTime = Date.now();
    }

    private async makeRequest<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
        await this.rateLimit();

        const url = new URL(`${CivitAIService.BASE_URL}${endpoint}`);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null) url.searchParams.append(key, value.toString());
            });
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        try {
            const response = await requestUrl({
                url: url.toString(),
                method: 'GET',
                headers
            });

            if (response.status !== 200) {
                throw new Error(`CivitAI API error: ${response.status}`);
            }

            return response.json as T;
        } catch (error) {
            console.error('CivitAI API request failed:', error);
            throw error;
        }
    }

    async searchModelsByHash(hash: string): Promise<CivitAIModel[]> {
        const cacheKey = `hash_${hash}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey) as CivitAIModel[];
        }

        try {
            const response = await this.makeRequest<{ items: CivitAIModel[] }>('/models', {
                hash: hash,
                limit: 10
            });

            this.cache.set(cacheKey, response.items);
            return response.items;
        } catch (error) {
            console.error(`Failed to search models by hash ${hash}:`, error);
            return [];
        }
    }

    async searchModelsByName(name: string): Promise<CivitAIModel[]> {
        const cacheKey = `name_${name.toLowerCase()}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey) as CivitAIModel[];
        }

        try {
            // Generate multiple search variations for better matching
            const searchVariations = this.generateSearchVariations(name);
            const allResults = new Map<number, CivitAIModel>();

            for (const variation of searchVariations) {
                try {
                    const response = await this.makeRequest<{ items: CivitAIModel[] }>('/models', {
                        query: variation,
                        limit: 20
                    });

                    // Merge results, avoiding duplicates
                    response.items.forEach(model => {
                        if (!allResults.has(model.id)) {
                            allResults.set(model.id, model);
                        }
                    });
                } catch (error) {
                    console.warn(`Search failed for variation "${variation}":`, error);
                }
            }

            const results = Array.from(allResults.values());
            this.cache.set(cacheKey, results);
            return results;
        } catch (error) {
            console.error(`Failed to search models by name ${name}:`, error);
            return [];
        }
    }

    private generateSearchVariations(originalName: string): string[] {
        const variations = new Set<string>();
        
        // Original name
        variations.add(originalName);
        
        // Lowercase
        variations.add(originalName.toLowerCase());
        
        // Remove common file patterns
        let cleanName = originalName.replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, '');
        cleanName = cleanName.replace(/^(sd_xl_|sdxl_|sd_|v\d+_)/i, '');
        cleanName = cleanName.replace(/_(fp16|fp32|bf16|pruned|ema|inpainting)$/i, '');
        cleanName = cleanName.replace(/_v?\d+(\.\d+)?$/i, '');
        
        variations.add(cleanName);
        variations.add(cleanName.toLowerCase());
        
        // Handle camelCase - split into words
        const camelCaseWords = cleanName.replace(/([a-z])([A-Z])/g, '$1 $2');
        variations.add(camelCaseWords);
        variations.add(camelCaseWords.toLowerCase());
        
        // Replace underscores and dashes with spaces
        const spaced = cleanName.replace(/[_-]/g, ' ');
        variations.add(spaced);
        variations.add(spaced.toLowerCase());
        
        // Try without spaces
        const nospaces = cleanName.replace(/[\s_-]/g, '');
        variations.add(nospaces);
        variations.add(nospaces.toLowerCase());
        
        // Extract main word (first part before space/underscore)
        const mainWord = cleanName.split(/[\s_-]/)[0];
        if (mainWord.length >= 3) {
            variations.add(mainWord);
            variations.add(mainWord.toLowerCase());
        }
        
        // Handle specific patterns like "cyberRealistic" -> "cyber realistic", "cyberrealistic"
        if (/[a-z][A-Z]/.test(cleanName)) {
            const separated = cleanName.replace(/([a-z])([A-Z])/g, '$1 $2');
            variations.add(separated);
            variations.add(separated.toLowerCase());
        }
        
        return Array.from(variations).filter(v => v.length >= 2);
    }

    async getModelById(modelId: number): Promise<CivitAIModel | null> {
        const cacheKey = `model_${modelId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey) as CivitAIModel;
        }

        try {
            const model = await this.makeRequest<CivitAIModel>(`/models/${modelId}`);
            this.cache.set(cacheKey, model);
            return model;
        } catch (error) {
            console.error(`Failed to get model ${modelId}:`, error);
            return null;
        }
    }

    async getModelVersion(versionId: number): Promise<CivitAIModelVersion | null> {
        const cacheKey = `version_${versionId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey) as CivitAIModelVersion;
        }

        try {
            const version = await this.makeRequest<CivitAIModelVersion>(`/model-versions/${versionId}`);
            this.cache.set(cacheKey, version);
            return version;
        } catch (error) {
            console.error(`Failed to get model version ${versionId}:`, error);
            return null;
        }
    }

    async findRelatedModels(baseModel: string, modelType: string): Promise<CivitAIModel[]> {
        try {
            const response = await this.makeRequest<{ items: CivitAIModel[] }>('/models', {
                types: [modelType],
                baseModels: [baseModel],
                sort: 'Highest Rated',
                limit: 50
            });

            return response.items;
        } catch (error) {
            console.error(`Failed to find related models for ${baseModel}:`, error);
            return [];
        }
    }

    clearCache() {
        this.cache.clear();
    }

    setApiKey(apiKey: string) {
        this.apiKey = apiKey;
    }
}
