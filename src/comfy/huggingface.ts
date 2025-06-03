import { requestUrl } from 'obsidian';
import type { HuggingFaceModel, HuggingFaceFile } from './types';

export class HuggingFaceService {
    private static readonly BASE_URL = 'https://huggingface.co';
    private static readonly API_BASE_URL = 'https://huggingface.co/api';
    private static readonly RATE_LIMIT_DELAY = 500; // 0.5 second between requests
    private lastRequestTime = 0;
    private cache = new Map<string, unknown>();
    private apiToken?: string;

    constructor(apiToken?: string) {
        this.apiToken = apiToken;
    }

    private async rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < HuggingFaceService.RATE_LIMIT_DELAY) {
            await new Promise(resolve => 
                setTimeout(resolve, HuggingFaceService.RATE_LIMIT_DELAY - timeSinceLastRequest)
            );
        }
        this.lastRequestTime = Date.now();
    }

    private async makeRequest<T>(endpoint: string, params?: Record<string, unknown>, useApiBase = true): Promise<T> {
        await this.rateLimit();

        const cacheKey = `${endpoint}?${new URLSearchParams(params as Record<string, string>).toString()}`;
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey) as T;
        }

        const baseUrl = useApiBase ? HuggingFaceService.API_BASE_URL : HuggingFaceService.BASE_URL;
        const url = new URL(endpoint, baseUrl);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    url.searchParams.append(key, String(value));
                }
            });
        }

        const headers: Record<string, string> = {
            'User-Agent': 'Obsidian-Workbench-Plugin/1.0.0'
        };

        if (this.apiToken) {
            headers['Authorization'] = `Bearer ${this.apiToken}`;
        }

        try {
            const response = await requestUrl({
                url: url.toString(),
                method: 'GET',
                headers
            });

            if (response.status !== 200) {
                throw new Error(`HuggingFace API error: ${response.status}`);
            }

            const data = response.json as T;
            this.cache.set(cacheKey, data);
            
            // Cache for 1 hour
            setTimeout(() => this.cache.delete(cacheKey), 60 * 60 * 1000);
            
            return data;
        } catch (error) {
            console.error('HuggingFace API request failed:', error);
            throw error;
        }
    }

    async searchModelsByName(query: string): Promise<HuggingFaceModel[]> {
        try {
            // Use the correct HuggingFace models API endpoint
            const response = await this.makeRequest<HuggingFaceModel[]>('/models', {
                search: query,
                limit: 10,
                filter: 'diffusers,pytorch,safetensors'
            });
            return Array.isArray(response) ? response : [];
        } catch (error) {
            console.error('Error searching HuggingFace models:', error);
            return [];
        }
    }

    async getModelInfo(modelId: string): Promise<HuggingFaceModel | null> {
        try {
            // Use the correct HuggingFace model API endpoint
            return await this.makeRequest<HuggingFaceModel>(`/models/${encodeURIComponent(modelId)}`);
        } catch (error) {
            console.error(`Error fetching HuggingFace model ${modelId}:`, error);
            return null;
        }
    }

    async getModelFiles(modelId: string): Promise<HuggingFaceFile[]> {
        try {
            const response = await this.makeRequest<HuggingFaceFile[]>(`/models/${encodeURIComponent(modelId)}/tree/main`);
            return Array.isArray(response) ? response : [];
        } catch (error) {
            console.error(`Error fetching HuggingFace model files for ${modelId}:`, error);
            return [];
        }
    }

    async findModelByHash(hash: string): Promise<HuggingFaceModel | null> {
        // HuggingFace doesn't have a direct hash search API like CivitAI
        // This would need to be implemented differently, possibly by maintaining
        // a local database of hash-to-model mappings
        console.warn('Hash-based model search not yet implemented for HuggingFace');
        return null;
    }

    /**
     * Search for models by tags/categories
     */
    async searchModelsByTags(tags: string[], limit = 10): Promise<HuggingFaceModel[]> {
        try {
            const tagFilter = tags.join(',');
            const response = await this.makeRequest<HuggingFaceModel[]>('/models', {
                filter: tagFilter,
                limit,
                sort: 'downloads'
            });
            return Array.isArray(response) ? response : [];
        } catch (error) {
            console.error('Error searching HuggingFace models by tags:', error);
            return [];
        }
    }

    /**
     * Get popular models by category
     */
    async getPopularModels(category?: string, limit = 20): Promise<HuggingFaceModel[]> {
        try {
            const params: Record<string, unknown> = {
                limit,
                sort: 'downloads'
            };
            
            if (category) {
                params.filter = category;
            }
            
            const response = await this.makeRequest<HuggingFaceModel[]>('/models', params);
            return Array.isArray(response) ? response : [];
        } catch (error) {
            console.error('Error fetching popular HuggingFace models:', error);
            return [];
        }
    }

    /**
     * Improved search that tries multiple approaches
     */
    async searchModelsAdvanced(query: string): Promise<HuggingFaceModel[]> {
        try {
            // Try exact search first
            let results = await this.searchModelsByName(query);
            
            // If no results, try searching by individual terms
            if (results.length === 0) {
                const terms = query.toLowerCase().split(/[\s_-]+/).filter(term => term.length > 2);
                for (const term of terms) {
                    const termResults = await this.searchModelsByName(term);
                    results = results.concat(termResults);
                    if (results.length >= 10) break;
                }
            }
            
            // Remove duplicates and sort by relevance
            const uniqueResults = Array.from(
                new Map(results.map(model => [model.id, model])).values()
            );
            
            return uniqueResults.slice(0, 10);
        } catch (error) {
            console.error('Error in advanced HuggingFace search:', error);
            return [];
        }
    }

    clearCache(): void {
        this.cache.clear();
    }
}
