import { requestUrl } from 'obsidian';
import type { HuggingFaceModel, HuggingFaceFile } from './types';

export class HuggingFaceService {
    private static readonly BASE_URL = 'https://huggingface.co';
    private static readonly API_BASE_URL = 'https://huggingface.co'; // Updated: HF API is at the root, not /api
    private static readonly RATE_LIMIT_DELAY = 500; // 0.5 second between requests
    private lastRequestTime = 0;
    private cache = new Map<string, unknown>();
    private apiToken?: string;

    constructor(apiToken?: string) {
        this.setApiToken(apiToken);
    }

    /**
     * Set and validate the API token
     */
    setApiToken(apiToken?: string): void {
        if (apiToken && typeof apiToken === 'string') {
            const trimmed = apiToken.trim();
            // HuggingFace tokens typically start with 'hf_' and are at least 20 characters
            if (trimmed.length > 0) {
                this.apiToken = trimmed;
            } else {
                this.apiToken = undefined;
            }
        } else {
            this.apiToken = undefined;
        }
    }

    /**
     * Check if we have a valid API token
     */
    hasValidApiToken(): boolean {
        return this.apiToken !== undefined && this.apiToken.length > 0;
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

        // Only add authentication if we have a valid API token
        if (this.hasValidApiToken()) {
            headers['Authorization'] = `Bearer ${this.apiToken}`;
        }

        try {
            const response = await requestUrl({
                url: url.toString(),
                method: 'GET',
                headers
            });

            if (response.status !== 200) {
                console.error(`HuggingFace API error: ${response.status} for ${endpoint}`);
                console.error('Response details:', {
                    status: response.status,
                    statusText: response.status,
                    url: url.toString(),
                    headers: response.headers
                });
                throw new Error(`HuggingFace API error: ${response.status} for ${endpoint}`);
            }

            const data = response.json as T;
            this.cache.set(cacheKey, data);
            
            // Cache for 1 hour
            setTimeout(() => this.cache.delete(cacheKey), 60 * 60 * 1000);
            
            return data;
        } catch (error) {
            console.error(`HuggingFace API error details for ${endpoint}:`, {
                error: error,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                errorType: typeof error,
                hasAuthHeader: 'Authorization' in headers,
                debugInfo: this.getDebugInfo()
            });

            // Handle authentication errors - check multiple error patterns
            const isAuthError = error instanceof Error && (
                error.message.includes('status 401') || 
                error.message.includes('401') ||
                ('status' in error && (error as {status: number}).status === 401)
            );
            
            if (isAuthError) {
                console.warn(`🔍 Detected 401 error for ${endpoint}, attempting retry without auth`);
                
                // Always try without auth for 401 errors, regardless of whether we think we have a token
                const headersWithoutAuth = {
                    'User-Agent': 'Obsidian-Workbench-Plugin/1.0.0'
                };
                
                try {
                    console.log(`🔄 Retrying ${endpoint} without authentication...`);
                    const retryResponse = await requestUrl({
                        url: url.toString(),
                        method: 'GET',
                        headers: headersWithoutAuth
                    });

                    if (retryResponse.status === 200) {
                        console.log(`✅ HuggingFace API retry successful for ${endpoint}`);
                        const data = retryResponse.json as T;
                        this.cache.set(cacheKey, data);
                        setTimeout(() => this.cache.delete(cacheKey), 60 * 60 * 1000);
                        return data;
                    } else {
                        console.warn(`⚠️ Retry returned status ${retryResponse.status} for ${endpoint}`);
                    }
                } catch (retryError) {
                    console.error(`❌ HuggingFace API retry also failed for ${endpoint}:`, retryError);
                }
            }
            
            console.error(`💥 HuggingFace API request failed for ${endpoint}:`, error);
            throw error;
        }
    }

    async searchModelsByName(query: string): Promise<HuggingFaceModel[]> {
        try {
            // Use the correct HuggingFace models API endpoint with proper parameters
            const response = await this.makeRequest<HuggingFaceModel[]>('/api/models', {
                search: query,
                limit: 10,
                full: 'true' // Get full model data including tags, files, etc.
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
            return await this.makeRequest<HuggingFaceModel>(`/api/models/${encodeURIComponent(modelId)}`);
        } catch (error) {
            console.error(`Error fetching HuggingFace model ${modelId}:`, error);
            return null;
        }
    }

    async getModelFiles(modelId: string): Promise<HuggingFaceFile[]> {
        try {
            const response = await this.makeRequest<HuggingFaceFile[]>(`/api/models/${encodeURIComponent(modelId)}/tree/main`);
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
            // Use filter parameter for tags according to HF API docs
            const response = await this.makeRequest<HuggingFaceModel[]>('/api/models', {
                filter: tags.join(','),
                limit,
                full: 'true'
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
                sort: 'downloads',
                direction: '-1', // descending order for most popular
                full: 'true'
            };
            
            if (category) {
                params.filter = category;
            }
            
            const response = await this.makeRequest<HuggingFaceModel[]>('/api/models', params);
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

    /**
     * Get debug information about the service state
     */
    getDebugInfo(): Record<string, string | number | boolean> {
        return {
            hasApiToken: this.hasValidApiToken(),
            apiTokenPresent: this.apiToken !== undefined,
            apiTokenLength: this.apiToken ? this.apiToken.length : 0,
            apiTokenPrefix: this.apiToken ? this.apiToken.substring(0, 8) + '...' : 'none',
            cacheSize: this.cache.size,
            lastRequestTime: this.lastRequestTime
        };
    }

    /**
     * Force clear any cached authentication and reset token
     */
    clearAuthAndCache(): void {
        this.apiToken = undefined;
        this.cache.clear();
        console.log('🧹 Cleared HuggingFace auth and cache');
    }

    /**
     * Enhanced search with multiple strategies for better model discovery
     */
    async searchModels(query: string, options: {
        limit?: number;
        sort?: 'downloads' | 'likes' | 'lastModified';
        direction?: 'asc' | 'desc';
        task?: string;
        library?: string;
    } = {}): Promise<{models: HuggingFaceModel[], numItemsOnPage: number, numTotalItems: number}> {
        try {
            const params: Record<string, unknown> = {
                search: query,
                limit: options.limit || 20,
                full: 'true'
            };

            // Add sorting parameters - HF API uses direction '-1' for descending
            if (options.sort) {
                params.sort = options.sort;
                params.direction = options.direction === 'desc' ? '-1' : '1';
            }

            if (options.task) {
                params.filter = options.task;
            }

            if (options.library) {
                params.filter = params.filter ? `${params.filter},${options.library}` : options.library;
            }

            const response = await this.makeRequest<HuggingFaceModel[]>('/api/models', params);
            const models = Array.isArray(response) ? response : [];
            
            return {
                models,
                numItemsOnPage: models.length,
                numTotalItems: models.length // HF API doesn't provide total count easily
            };
        } catch (error) {
            console.error('Error in enhanced search:', error);
            return { models: [], numItemsOnPage: 0, numTotalItems: 0 };
        }
    }

    /**
     * Find a model by exact name/ID
     */
    async findModelByName(modelName: string): Promise<HuggingFaceModel | null> {
        try {
            // First try exact match
            try {
                return await this.getModelInfo(modelName);
            } catch {
                // If exact match fails, try search
                const results = await this.searchModels(modelName, { limit: 1 });
                return results.models.length > 0 ? results.models[0] : null;
            }
        } catch (error) {
            console.error('Error finding model by name:', error);
            return null;
        }
    }

    /**
     * Get related models based on tags and pipeline type
     */
    async getRelatedModels(modelId: string, limit = 10): Promise<HuggingFaceModel[]> {
        try {
            const model = await this.getModelInfo(modelId);
            if (!model) return [];
            
            const tags = model.tags?.slice(0, 3) || []; // Use first 3 tags for related search
            
            if (tags.length === 0 && !model.pipeline_tag) return [];

            const searchQuery = tags.length > 0 ? tags.join(' ') : '';
            const results = await this.searchModels(searchQuery, { 
                limit,
                task: model.pipeline_tag 
            });

            // Filter out the original model and return related ones
            return results.models.filter(m => m.id !== modelId);
        } catch (error) {
            console.error('Error fetching related models:', error);
            return [];
        }
    }

    /**
     * Extract and format metadata from a HuggingFace model
     */
    extractModelMetadata(model: HuggingFaceModel): Record<string, string | number | string[] | undefined> {
        return {
            id: model.id,
            author: model.author,
            downloads: model.downloads,
            likes: model.likes,
            tags: model.tags || [],
            task: model.pipeline_tag,
            library: model.library_name,
            created: model.created_at,
            lastModified: model.last_modified,
            license: model.card_data?.license,
            languages: model.card_data?.language || [],
            baseModel: model.card_data?.base_model,
            datasets: model.card_data?.tags?.filter(tag => tag.startsWith('dataset:')) || [],
            pipelineTag: model.card_data?.pipeline_tag || model.pipeline_tag
        };
    }

    /**
     * Simple search with minimal parameters to avoid 400 errors
     */
    async searchModelsSimple(query: string, limit = 10): Promise<HuggingFaceModel[]> {
        try {
            // Try the simplest possible API call first
            console.log(`🔍 Trying simple HuggingFace search for: "${query}"`);
            
            const response = await this.makeRequest<HuggingFaceModel[]>('/api/models', {
                search: query,
                limit: limit,
                full: 'true'
            });
            
            console.log(`✅ Simple search successful, found ${response?.length || 0} models`);
            return Array.isArray(response) ? response : [];
        } catch (error) {
            console.error('Simple search failed, trying basic list:', error);
            
            // Fallback: get basic model list without search
            try {
                const fallbackResponse = await this.makeRequest<HuggingFaceModel[]>('/api/models', {
                    limit: limit,
                    full: 'true'
                });
                console.log(`📋 Fallback list successful, found ${fallbackResponse?.length || 0} models`);
                return Array.isArray(fallbackResponse) ? fallbackResponse : [];
            } catch (fallbackError) {
                console.error('Both simple search and fallback failed:', fallbackError);
                return [];
            }
        }
    }
}
