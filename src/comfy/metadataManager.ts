import { TFile, Vault } from 'obsidian';
import { CivitAIService } from './civitai';
import { EnhancedModelMetadata, ModelRelationship, CivitAIModel, CivitAIModelVersion } from './types';
import { FileHashCalculator } from '../utils/hashCalculator';
import * as path from 'path';

/**
 * Determines if a file is a model file based on its extension.
 * @param filename The filename to check.
 * @returns True if the file is considered a model file.
 */
function isModelFile(filename: string): boolean {
    const extension = path.extname(filename).toLowerCase();
    const modelExtensions = [
        '.safetensors', '.ckpt', '.pth', '.pt', '.gguf', '.model',
        '.bin', '.h5', '.onnx', '.tflite', '.pb', '.trt'
    ];
    return modelExtensions.includes(extension);
}

export class ModelMetadataManager {
    private civitaiService: CivitAIService;
    private vault: Vault;
    private metadataCache = new Map<string, EnhancedModelMetadata>();
    private metadataFile = 'model-metadata.json';

    constructor(vault: Vault, apiKey?: string) {
        this.vault = vault;
        this.civitaiService = new CivitAIService(apiKey);
        this.loadMetadataCache();
    }

    async enrichModelMetadata(filePath: string): Promise<EnhancedModelMetadata> {
        const filename = path.basename(filePath);
        
        // Only process actual model files
        if (!isModelFile(filename)) {
            throw new Error(`File ${filename} is not a model file and should not be processed by metadata manager`);
        }
        
        const existingMetadata = this.metadataCache.get(filePath);

        // If we have recent metadata, return it
        if (existingMetadata && this.isMetadataFresh(existingMetadata)) {
            return existingMetadata;
        }

        const metadata: EnhancedModelMetadata = {
            localPath: filePath,
            filename: filename,
            relationships: {
                childModels: [],
                compatibleModels: [],
                baseModel: 'Unknown'
            },
            isVerified: false,
            lastSynced: new Date()
        };

        try {
            // Calculate file hash
            metadata.hash = await FileHashCalculator.calculateSHA256(filePath);

            // Search CivitAI by hash first (most accurate)
            let civitaiModels: CivitAIModel[] = [];
            if (metadata.hash) {
                civitaiModels = await this.civitaiService.searchModelsByHash(metadata.hash);
            }

            // If no hash match, try name search
            if (civitaiModels.length === 0) {
                const cleanName = this.extractModelName(filename);
                civitaiModels = await this.civitaiService.searchModelsByName(cleanName);
            }

            if (civitaiModels.length > 0) {
                const bestMatch = this.findBestMatch(civitaiModels, filename);
                metadata.civitaiModel = bestMatch;

                // Find the matching version
                const matchingVersion = this.findMatchingVersion(bestMatch, filename, metadata.hash);
                if (matchingVersion) {
                    metadata.civitaiVersion = matchingVersion;
                    metadata.isVerified = true;
                }

                // Build relationships
                metadata.relationships = await this.buildRelationships(bestMatch);
            }

            // Cache the metadata
            this.metadataCache.set(filePath, metadata);
            await this.saveMetadataCache();

            return metadata;
        } catch (error) {
            console.error(`Failed to enrich metadata for ${filePath}:`, error);
            return metadata;
        }
    }

    private async buildRelationships(civitaiModel: CivitAIModel): Promise<ModelRelationship> {
        const relationships: ModelRelationship = {
            childModels: [],
            compatibleModels: [],
            baseModel: civitaiModel.modelVersions[0]?.baseModel || 'Unknown'
        };

        try {
            // Find LoRAs compatible with this checkpoint
            if (civitaiModel.type === 'Checkpoint') {
                const compatibleLoras = await this.civitaiService.findRelatedModels(
                    relationships.baseModel,
                    'LORA'
                );
                relationships.compatibleModels = compatibleLoras.map(m => m.id);
            }

            // Find parent model for LoRAs
            if (civitaiModel.type === 'LORA') {
                const baseCheckpoints = await this.civitaiService.findRelatedModels(
                    relationships.baseModel,
                    'Checkpoint'
                );
                if (baseCheckpoints.length > 0) {
                    relationships.parentModelId = baseCheckpoints[0].id;
                }
            }

            return relationships;
        } catch (error) {
            console.error('Failed to build relationships:', error);
            return relationships;
        }
    }

    private extractModelName(filename: string): string {
        // Remove file extension
        let name = filename.replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, '');
        
        // Remove common prefixes/suffixes
        name = name.replace(/^(sd_xl_|sdxl_|sd_|v\d+_)/i, '');
        name = name.replace(/_(fp16|fp32|bf16|pruned|ema|inpainting)$/i, '');
        name = name.replace(/_v?\d+(\.\d+)?$/i, '');
        
        // Handle camelCase properly - preserve it for search
        // Only add spaces if it's clearly camelCase (lowercase followed by uppercase)
        if (/[a-z][A-Z]/.test(name)) {
            // For names like "cyberRealistic" -> keep original for primary search
            // The CivitAI service will handle variations
            return name.trim();
        }
        
        // Replace underscores and dashes with spaces for non-camelCase names
        name = name.replace(/[_-]/g, ' ');
        
        return name.trim();
    }

    private findBestMatch(models: CivitAIModel[], filename: string): CivitAIModel {
        if (models.length === 0) {
            throw new Error('No models provided for matching');
        }
        
        if (models.length === 1) {
            return models[0];
        }

        // Score models based on multiple factors
        const scores = models.map(model => {
            const baseNameScore = this.calculateNameSimilarity(filename, model.name);
            
            // Also check similarity with all model versions' file names
            let versionFileScore = 0;
            if (model.modelVersions) {
                for (const version of model.modelVersions) {
                    if (version.files) {
                        for (const file of version.files) {
                            const fileNameScore = this.calculateNameSimilarity(filename, file.name);
                            versionFileScore = Math.max(versionFileScore, fileNameScore);
                        }
                    }
                }
            }
            
            // Combine scores
            const nameScore = Math.max(baseNameScore, versionFileScore);
            
            // Popularity score (logarithmic to prevent dominance)
            const popularityScore = Math.log(model.stats.downloadCount + 1) / 25;
            
            // Rating score
            const ratingScore = (model.stats.rating || 0) / 10;
            
            // Boost score if it's verified/popular
            const verificationBoost = model.stats.downloadCount > 1000 ? 0.1 : 0;
            
            const totalScore = nameScore * 0.7 + popularityScore * 0.15 + ratingScore * 0.1 + verificationBoost * 0.05;
            
            return {
                model,
                score: totalScore,
                nameScore,
                popularityScore,
                ratingScore
            };
        });

        scores.sort((a, b) => b.score - a.score);
        
        console.log(`Best match for "${filename}":`, {
            winner: scores[0].model.name,
            score: scores[0].score,
            breakdown: {
                nameScore: scores[0].nameScore,
                popularityScore: scores[0].popularityScore,
                ratingScore: scores[0].ratingScore
            }
        });
        
        return scores[0].model;
    }

    private findMatchingVersion(model: CivitAIModel, filename: string, hash?: string): CivitAIModelVersion | null {
        if (!model.modelVersions) return null;

        // First try to match by file hash
        if (hash) {
            for (const version of model.modelVersions) {
                for (const file of version.files || []) {
                    if (file.hashes?.SHA256 === hash || 
                        file.hashes?.AutoV2 === hash ||
                        file.hashes?.AutoV1 === hash) {
                        return version;
                    }
                }
            }
        }

        // Then try to match by filename
        for (const version of model.modelVersions) {
            for (const file of version.files || []) {
                if (this.calculateNameSimilarity(filename, file.name) > 0.8) {
                    return version;
                }
            }
        }

        // Return the most popular version
        return model.modelVersions[0];
    }

    private calculateNameSimilarity(str1: string, str2: string): number {
        const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        const norm1 = normalize(str1);
        const norm2 = normalize(str2);

        if (norm1 === norm2) return 1;
        if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.8;

        // Simple Levenshtein distance
        const matrix = Array(norm2.length + 1).fill(null).map(() => Array(norm1.length + 1).fill(null));

        for (let i = 0; i <= norm1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= norm2.length; j++) matrix[j][0] = j;

        for (let j = 1; j <= norm2.length; j++) {
            for (let i = 1; i <= norm1.length; i++) {
                const cost = norm1[i - 1] === norm2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + cost
                );
            }
        }

        const maxLength = Math.max(norm1.length, norm2.length);
        return 1 - matrix[norm2.length][norm1.length] / maxLength;
    }

    private isMetadataFresh(metadata: EnhancedModelMetadata): boolean {
        if (!metadata.lastSynced) return false;
        const daysSinceSync = (Date.now() - metadata.lastSynced.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceSync < 7; // Refresh weekly
    }

    private async loadMetadataCache(): Promise<void> {
        try {
            const file = this.vault.getAbstractFileByPath(this.metadataFile);
            if (file instanceof TFile) {
                const content = await this.vault.read(file);
                const data = JSON.parse(content);
                // Convert dates back from string
                Object.entries(data).forEach(([key, value]) => {
                    if (typeof value === 'object' && value && 'lastSynced' in value) {
                        const metadata = value as EnhancedModelMetadata;
                        if (metadata.lastSynced) {
                            metadata.lastSynced = new Date(metadata.lastSynced);
                        }
                    }
                });
                this.metadataCache = new Map(Object.entries(data) as [string, EnhancedModelMetadata][]);
            }
        } catch (error) {
            console.log('No existing metadata cache found, starting fresh');
        }
    }

    private async saveMetadataCache(): Promise<void> {
        try {
            const data = Object.fromEntries(this.metadataCache);
            const content = JSON.stringify(data, null, 2);
            
            const file = this.vault.getAbstractFileByPath(this.metadataFile);
            if (file instanceof TFile) {
                await this.vault.modify(file, content);
            } else {
                await this.vault.create(this.metadataFile, content);
            }
        } catch (error) {
            console.error('Failed to save metadata cache:', error);
        }
    }

    async getModelRelationships(filePath: string): Promise<EnhancedModelMetadata[]> {
        const metadata = await this.enrichModelMetadata(filePath);
        const relationships: EnhancedModelMetadata[] = [];

        // Get parent model
        if (metadata.relationships.parentModelId) {
            const parentModel = await this.civitaiService.getModelById(metadata.relationships.parentModelId);
            if (parentModel) {
                // Try to find local file for parent
                const localParent = this.findLocalModelByCivitaiId(parentModel.id);
                if (localParent) {
                    relationships.push(localParent);
                }
            }
        }

        // Get compatible models
        for (const compatibleId of metadata.relationships.compatibleModels.slice(0, 10)) {
            const localModel = this.findLocalModelByCivitaiId(compatibleId);
            if (localModel) {
                relationships.push(localModel);
            }
        }

        return relationships;
    }

    private findLocalModelByCivitaiId(civitaiId: number): EnhancedModelMetadata | null {
        for (const [, metadata] of this.metadataCache) {
            if (metadata.civitaiModel?.id === civitaiId) {
                return metadata;
            }
        }
        return null;
    }

    setApiKey(apiKey: string): void {
        this.civitaiService.setApiKey(apiKey);
    }

    async refreshMetadata(filePath?: string): Promise<void> {
        if (filePath) {
            this.metadataCache.delete(filePath);
            await this.enrichModelMetadata(filePath);
        } else {
            this.metadataCache.clear();
            this.civitaiService.clearCache();
            await this.saveMetadataCache();
        }
    }

    async refreshAllMetadata(): Promise<void> {
        // Clear all caches
        this.metadataCache.clear();
        this.civitaiService.clearCache();
        
        console.log('Cleared all metadata caches');
        
        // Save empty cache to disk
        await this.saveMetadataCache();
    }

    async cleanupNonModelMetadata(): Promise<void> {
        const keysToDelete: string[] = [];
        
        for (const [filePath] of this.metadataCache.entries()) {
            const filename = path.basename(filePath);
            if (!isModelFile(filename)) {
                keysToDelete.push(filePath);
            }
        }
        
        console.log(`Removing ${keysToDelete.length} non-model file entries from metadata cache`);
        
        for (const key of keysToDelete) {
            this.metadataCache.delete(key);
        }
        
        if (keysToDelete.length > 0) {
            await this.saveMetadataCache();
            console.log('Cleaned up metadata cache - removed non-model file entries');
        } else {
            console.log('No non-model file entries found in metadata cache');
        }
    }

    async batchEnrichMetadata(filePaths: string[]): Promise<Map<string, EnhancedModelMetadata>> {
        const results = new Map<string, EnhancedModelMetadata>();
        
        // Filter to only include actual model files
        const modelFilePaths = filePaths.filter(filePath => {
            const filename = path.basename(filePath);
            return isModelFile(filename);
        });
        
        console.log(`Starting batch enrichment for ${modelFilePaths.length} model files (filtered from ${filePaths.length} total files)`);
        
        for (let i = 0; i < modelFilePaths.length; i++) {
            const filePath = modelFilePaths[i];
            try {
                console.log(`Processing ${i + 1}/${modelFilePaths.length}: ${path.basename(filePath)}`);
                const metadata = await this.enrichModelMetadata(filePath);
                results.set(filePath, metadata);
                
                // Save progress periodically
                if ((i + 1) % 10 === 0) {
                    await this.saveMetadataCache();
                    console.log(`Saved progress: ${i + 1}/${modelFilePaths.length} files processed`);
                }
            } catch (error) {
                console.error(`Failed to process ${filePath}:`, error);
            }
        }
        
        // Final save
        await this.saveMetadataCache();
        console.log(`Batch enrichment completed for ${results.size} files`);
        
        return results;
    }
}
