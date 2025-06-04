import { Notice, TFile } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import type Workbench from '../../main';
import { ModelMetadataManager } from '../../comfy/metadataManager';
import { EnhancedModelMetadata } from '../../comfy/types';

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

/**
 * Handles the creation and management of model notes
 */
export class ModelNoteManager {
    private plugin: Workbench;
    private metadataManager: ModelMetadataManager | null = null;

    constructor(plugin: Workbench, metadataManager: ModelMetadataManager | null = null) {
        this.plugin = plugin;
        this.metadataManager = metadataManager;
    }

    /**
     * Creates a Markdown note for a given model file if it doesn't already exist.
     * Handles specific content generation for .md and .json files.
     * @param relativeModelPath Path of the model file relative to the ComfyUI 'models' directory.
     * @param modelsBasePath Absolute path to the root ComfyUI 'models' directory.
     * @param directoryInfo Information about all files in each directory for enhanced note content.
     */
    async createModelNoteIfNeeded(relativeModelPath: string, modelsBasePath: string, directoryInfo: Record<string, string[]>): Promise<void> {
        const deviceSettings = this.plugin.getCurrentDeviceSettings();
        const notesFolder = deviceSettings.modelNotesFolderPath?.trim();

        if (!notesFolder) {
            // Warning already handled in onOpen
            return;
        }

        const noteFileName = path.basename(relativeModelPath, path.extname(relativeModelPath)) + '.md';
        const noteSubfolderPath = path.dirname(relativeModelPath);
        const fullNoteFolderPath = path.join(notesFolder, noteSubfolderPath).replace(/\\/g, '/');
        const fullNotePath = path.join(fullNoteFolderPath, noteFileName).replace(/\\/g, '/');
        const sourceModelFullPath = path.join(modelsBasePath, relativeModelPath); // Full path to the source model file

        try {
            const noteExists = await this.plugin.app.vault.adapter.exists(fullNotePath);

            if (!noteExists) {
                const folderExists = await this.plugin.app.vault.adapter.exists(fullNoteFolderPath);
                if (!folderExists) {
                    await this.plugin.app.vault.adapter.mkdir(fullNoteFolderPath);
                    console.log(`Created model note directory: ${fullNoteFolderPath}`);
                }

                let noteContent = '';
                const fileExtension = path.extname(relativeModelPath).toLowerCase();

                if (fileExtension === '.md') {
                    // --- Handle Markdown Files ---
                    try {
                        noteContent = await fs.promises.readFile(sourceModelFullPath, 'utf-8');
                        console.log(`Copying content from source Markdown: ${relativeModelPath}`);
                    } catch (readError) {
                        console.error(`Error reading source Markdown file ${sourceModelFullPath}:`, readError);
                        new Notice(`Error reading source file ${path.basename(relativeModelPath)}. Creating basic note.`);
                        // Fallback to default frontmatter if reading fails
                        noteContent = await this.generateDefaultFrontmatter(relativeModelPath, directoryInfo);
                    }
                    // --- End Markdown Handling ---

                } else if (fileExtension === '.json') {
                    // --- Handle JSON Files ---
                    // Create a code block that references the source JSON path.
                    // You'll need a Markdown code block processor in main.ts to handle this.
                    const relativeSourcePathForLink = path.join(deviceSettings.comfyUiPath || '', 'models', relativeModelPath).replace(/\\/g, '/');
                    noteContent = `\`\`\`workbench-json\n${relativeSourcePathForLink}\n\`\`\`\n`;
                    console.log(`Creating JSON view reference note for: ${relativeModelPath}`);
                    // --- End JSON Handling ---

                } else {
                    // --- Handle Other File Types (Default Frontmatter) ---
                    noteContent = await this.generateDefaultFrontmatter(relativeModelPath, directoryInfo);
                    // --- End Default Handling ---
                }

                await this.plugin.app.vault.create(fullNotePath, noteContent);
                console.log(`Created model note: ${fullNotePath}`);
            }
        } catch (error) {
            console.error(`Error creating model note for ${relativeModelPath} at ${fullNotePath}:`, error);
            new Notice(`Error creating note for ${path.basename(relativeModelPath)}. Check console.`);
        }
    }

    /**
     * Generates default frontmatter content for a model note.
     * @param relativeModelPath Path of the model file relative to the ComfyUI 'models' directory.
     * @param directoryInfo Information about all files in each directory.
     * @returns A string containing the default note content with frontmatter.
     */
    async generateDefaultFrontmatter(relativeModelPath: string, directoryInfo?: Record<string, string[]>): Promise<string> {
        const modelFilename = path.basename(relativeModelPath);
        const modelDirectory = path.dirname(relativeModelPath);
        const modelType = this.inferModelType(relativeModelPath);
        
        // Get related files in the same directory
        const relatedFiles = directoryInfo?.[modelDirectory] || [];
        const otherFiles = relatedFiles.filter(file => file !== modelFilename && !isModelFile(file));
        
        // Try to get enhanced metadata
        let enhancedMetadata: EnhancedModelMetadata | null = null;
        if (this.metadataManager) {
            try {
                const deviceSettings = this.plugin.getCurrentDeviceSettings();
                const comfyPath = deviceSettings.comfyUiPath?.trim();
                if (comfyPath) {
                    const fullModelPath = path.join(comfyPath, 'models', relativeModelPath);
                    enhancedMetadata = await this.metadataManager.enrichModelMetadata(fullModelPath);
                }
            } catch (error) {
                console.warn(`Failed to get enhanced metadata for ${relativeModelPath}:`, error);
            }
        }

        // Start building frontmatter with basic information
        let frontmatter = `---
# Model Information (Workbench Generated)
model_path: "${relativeModelPath.replace(/\\/g, '/')}"
model_filename: "${modelFilename}"
model_type: "${modelType}"`;

        // Add enhanced metadata if available
        if (enhancedMetadata) {
            // CivitAI model information
            if (enhancedMetadata.civitaiModel) {
                const model = enhancedMetadata.civitaiModel;
                frontmatter += `\ncivitai_model_id: ${model.id}`;
                frontmatter += `\ncivitai_model_name: "${model.name}"`;
                if (model.description) {
                    // Clean description for YAML (escape quotes and newlines)
                    const cleanDescription = model.description.replace(/"/g, '\\"').replace(/\n/g, ' ').substring(0, 200);
                    frontmatter += `\ncivitai_description: "${cleanDescription}${model.description.length > 200 ? '...' : ''}"`;
                }
                if (model.type) frontmatter += `\ncivitai_type: "${model.type}"`;
                if (model.nsfw !== undefined) frontmatter += `\ncivitai_nsfw: ${model.nsfw}`;
                if (model.tags && model.tags.length > 0) {
                    const tags = model.tags.slice(0, 10).map((tag: string) => `"${tag}"`).join(', ');
                    frontmatter += `\ncivitai_tags: [${tags}]`;
                }
                if (model.creator?.username) frontmatter += `\ncivitai_creator: "${model.creator.username}"`;
            }

            // CivitAI version information
            if (enhancedMetadata.civitaiVersion) {
                const version = enhancedMetadata.civitaiVersion;
                frontmatter += `\ncivitai_version_id: ${version.id}`;
                frontmatter += `\ncivitai_version_name: "${version.name}"`;
                if (version.baseModel) frontmatter += `\nbase_model: "${version.baseModel}"`;
                if (version.trainedWords && version.trainedWords.length > 0) {
                    const trainedWords = version.trainedWords.slice(0, 10).map((word: string) => `"${word}"`).join(', ');
                    frontmatter += `\ntrained_words: [${trainedWords}]`;
                }
            }

            // HuggingFace model information
            if (enhancedMetadata.huggingfaceModel) {
                const hfModel = enhancedMetadata.huggingfaceModel;
                frontmatter += `\nhuggingface_model_id: "${hfModel.id}"`;
                frontmatter += `\nhuggingface_author: "${hfModel.author}"`;
                if (hfModel.downloads) frontmatter += `\nhuggingface_downloads: ${hfModel.downloads}`;
                if (hfModel.likes) frontmatter += `\nhuggingface_likes: ${hfModel.likes}`;
                if (hfModel.pipeline_tag) frontmatter += `\nhuggingface_pipeline: "${hfModel.pipeline_tag}"`;
                if (hfModel.tags && hfModel.tags.length > 0) {
                    const hfTags = hfModel.tags.slice(0, 10).map((tag: string) => `"${tag}"`).join(', ');
                    frontmatter += `\nhuggingface_tags: [${hfTags}]`;
                }
            }

            // Provider and verification status
            frontmatter += `\nprovider: "${enhancedMetadata.provider || 'unknown'}"`;
            if (enhancedMetadata.isVerified !== undefined) frontmatter += `\nverified: ${enhancedMetadata.isVerified}`;

            // File information
            if (enhancedMetadata.hash) frontmatter += `\nfile_hash: "${enhancedMetadata.hash}"`;
            if (enhancedMetadata.lastSynced) {
                frontmatter += `\nlast_synced: "${enhancedMetadata.lastSynced.toISOString()}"`;
            }

            // Model relationships
            if (enhancedMetadata.relationships) {
                const rel = enhancedMetadata.relationships;
                if (rel.parentModelId) frontmatter += `\nparent_model_id: ${rel.parentModelId}`;
                if (rel.childModels && rel.childModels.length > 0) {
                    frontmatter += `\nchild_models_count: ${rel.childModels.length}`;
                }
                if (rel.compatibleModels && rel.compatibleModels.length > 0) {
                    frontmatter += `\ncompatible_models_count: ${rel.compatibleModels.length}`;
                }
                if (rel.baseModel) frontmatter += `\nrelationship_base_model: "${rel.baseModel}"`;
                if (rel.derivedFrom) frontmatter += `\nderived_from: "${rel.derivedFrom}"`;
            }

            // Enhanced tags including workbench-model and provider
            const tags = ['workbench-model'];
            if (enhancedMetadata.provider && enhancedMetadata.provider !== 'unknown') {
                tags.push(enhancedMetadata.provider);
            }
            if (enhancedMetadata.civitaiModel?.type) {
                tags.push(enhancedMetadata.civitaiModel.type.toLowerCase().replace(/\s+/g, '-'));
            }
            if (enhancedMetadata.huggingfaceModel?.pipeline_tag) {
                tags.push(enhancedMetadata.huggingfaceModel.pipeline_tag.toLowerCase().replace(/\s+/g, '-'));
            }
            frontmatter += `\ntags: [${tags.map(tag => `"${tag}"`).join(', ')}]`;
        } else {
            // Fallback to basic tags if no enhanced metadata
            frontmatter += `\ntags: [workbench-model]`;
        }

        frontmatter += `\n---

# ${enhancedMetadata?.civitaiModel?.name || enhancedMetadata?.huggingfaceModel?.id || modelFilename}

`;

        // Add enhanced description if available
        if (enhancedMetadata?.civitaiModel?.description) {
            frontmatter += `## Description\n\n${enhancedMetadata.civitaiModel.description}\n\n`;
        } else {
            frontmatter += `Notes about this model...\n\n`;
        }

        // Add CivitAI model details section
        if (enhancedMetadata?.civitaiModel) {
            frontmatter += `## Model Details\n\n`;
            
            const model = enhancedMetadata.civitaiModel;
            if (model.type) frontmatter += `- **Type**: ${model.type}\n`;
            if (model.creator?.username) frontmatter += `- **Creator**: ${model.creator.username}\n`;
            if (model.stats) {
                frontmatter += `- **Downloads**: ${model.stats.downloadCount?.toLocaleString() || 'N/A'}\n`;
                frontmatter += `- **Rating**: ${model.stats.rating ? model.stats.rating.toFixed(1) : 'N/A'} (${model.stats.ratingCount || 0} reviews)\n`;
                frontmatter += `- **Favorites**: ${model.stats.favoriteCount?.toLocaleString() || 'N/A'}\n`;
            }

            if (enhancedMetadata.civitaiVersion) {
                const version = enhancedMetadata.civitaiVersion;
                if (version.baseModel) frontmatter += `- **Base Model**: ${version.baseModel}\n`;
                if (version.trainedWords && version.trainedWords.length > 0) {
                    frontmatter += `- **Trained Words**: ${version.trainedWords.join(', ')}\n`;
                }
            }

            frontmatter += `\n`;
        }

        // Add HuggingFace model details section
        if (enhancedMetadata?.huggingfaceModel) {
            frontmatter += `## HuggingFace Details\n\n`;
            
            const hfModel = enhancedMetadata.huggingfaceModel;
            frontmatter += `- **Model ID**: ${hfModel.id}\n`;
            frontmatter += `- **Author**: ${hfModel.author}\n`;
            if (hfModel.downloads) frontmatter += `- **Downloads**: ${hfModel.downloads.toLocaleString()}\n`;
            if (hfModel.likes) frontmatter += `- **Likes**: ${hfModel.likes.toLocaleString()}\n`;
            if (hfModel.pipeline_tag) frontmatter += `- **Pipeline**: ${hfModel.pipeline_tag}\n`;
            if (hfModel.library_name) frontmatter += `- **Library**: ${hfModel.library_name}\n`;
            if (hfModel.card_data?.license) frontmatter += `- **License**: ${hfModel.card_data.license}\n`;
            if (hfModel.created_at) frontmatter += `- **Created**: ${new Date(hfModel.created_at).toLocaleDateString()}\n`;
            if (hfModel.last_modified) frontmatter += `- **Last Modified**: ${new Date(hfModel.last_modified).toLocaleDateString()}\n`;

            frontmatter += `\n`;
        }

        // Add model relationships section
        if (enhancedMetadata?.relationships) {
            const rel = enhancedMetadata.relationships;
            let hasRelationships = false;
            let relationshipContent = `## Model Relationships\n\n`;

            if (rel.parentModelId) {
                relationshipContent += `- **Parent Model ID**: ${rel.parentModelId}\n`;
                hasRelationships = true;
            }

            if (rel.childModels && rel.childModels.length > 0) {
                relationshipContent += `- **Child Models**: ${rel.childModels.length} models\n`;
                hasRelationships = true;
            }

            if (rel.compatibleModels && rel.compatibleModels.length > 0) {
                relationshipContent += `- **Compatible Models**: ${rel.compatibleModels.length} models\n`;
                hasRelationships = true;
            }

            if (rel.derivedFrom) {
                relationshipContent += `- **Derived From**: ${rel.derivedFrom}\n`;
                hasRelationships = true;
            }

            if (hasRelationships) {
                frontmatter += relationshipContent + `\n`;
            }
        }

        // Add information about related files if any exist
        if (otherFiles.length > 0) {
            frontmatter += `## Related Files\n\nThis model is part of a package that includes the following additional files:\n\n`;
            otherFiles.forEach(file => {
                const fileExt = path.extname(file).toLowerCase();
                let fileType = 'Unknown';
                if (['.md', '.txt', '.readme'].some(ext => file.toLowerCase().includes(ext))) {
                    fileType = 'Documentation';
                } else if (['.json'].includes(fileExt)) {
                    fileType = 'Configuration';
                } else if (['.yaml', '.yml'].includes(fileExt)) {
                    fileType = 'Configuration';
                } else if (['.py', '.ipynb'].includes(fileExt)) {
                    fileType = 'Code/Script';
                } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(fileExt)) {
                    fileType = 'Sample Image';
                }
                
                frontmatter += `- **${file}** (${fileType})\n`;
            });
            frontmatter += `\n`;
        }

        return frontmatter;
    }

    /**
     * Infers the model type based on the file path and extension.
     * @param relativeModelPath Path of the model file relative to the ComfyUI 'models' directory.
     * @returns A string indicating the inferred model type.
     */
    private inferModelType(relativeModelPath: string): string {
        const pathParts = relativeModelPath.split('/');
        const extension = path.extname(relativeModelPath).toLowerCase();
        
        // Infer from directory structure
        if (pathParts.includes('checkpoints')) return 'Checkpoint';
        if (pathParts.includes('loras')) return 'LoRA';
        if (pathParts.includes('embeddings')) return 'Embedding';
        if (pathParts.includes('vae')) return 'VAE';
        if (pathParts.includes('upscale_models')) return 'Upscaler';
        if (pathParts.includes('controlnet')) return 'ControlNet';
        if (pathParts.includes('clip')) return 'CLIP';
        if (pathParts.includes('unet')) return 'UNet';
        if (pathParts.includes('LLM')) return 'Large Language Model';
        
        // Infer from file extension
        switch (extension) {
            case '.safetensors':
            case '.ckpt':
                return 'Neural Network Model';
            case '.pth':
            case '.pt':
                return 'PyTorch Model';
            case '.gguf':
                return 'GGUF Model';
            case '.onnx':
                return 'ONNX Model';
            default:
                return 'AI Model';
        }
    }

    /**
     * Gets the provider for a model by reading it from the corresponding note's frontmatter.
     * Falls back to path-based detection if the note doesn't exist or doesn't have provider info.
     * @param fullRelativePath The relative path to the model file
     * @param notesFolder The base folder where notes are stored
     * @returns The provider type: 'civitai', 'huggingface', or 'unknown'
     */
    async getModelProviderFromNote(fullRelativePath: string, notesFolder?: string): Promise<'civitai' | 'huggingface' | 'unknown'> {
        if (!notesFolder) {
            return this.detectModelProviderFromPath(fullRelativePath);
        }

        try {
            // Construct the note path
            const noteFileName = path.basename(fullRelativePath, path.extname(fullRelativePath)) + '.md';
            const noteSubfolderPath = path.dirname(fullRelativePath);
            const fullNotePath = path.join(notesFolder, noteSubfolderPath, noteFileName).replace(/\\/g, '/');

            // Check if the note exists and is a file
            const noteFile = this.plugin.app.vault.getAbstractFileByPath(fullNotePath);
            if (!noteFile || !('stat' in noteFile)) {
                return this.detectModelProviderFromPath(fullRelativePath);
            }

            // Read the note content
            const noteContent = await this.plugin.app.vault.read(noteFile as TFile);
            
            // Parse frontmatter to get provider
            const frontmatterMatch = noteContent.match(/^---\n([\s\S]*?)\n---/);
            if (frontmatterMatch) {
                const frontmatter = frontmatterMatch[1];
                
                // First check for explicit provider field
                const providerMatch = frontmatter.match(/provider:\s*['""]?([^'"\n]+)['""]?/);
                if (providerMatch) {
                    const provider = providerMatch[1].trim().toLowerCase();
                    if (provider === 'civitai' || provider === 'huggingface') {
                        return provider as 'civitai' | 'huggingface';
                    }
                }
                
                // Fallback: check source field for provider detection
                const sourceMatch = frontmatter.match(/source:\s*['""]?([^'"\n]+)['""]?/);
                if (sourceMatch) {
                    const source = sourceMatch[1].trim().toLowerCase();
                    if (source.includes('huggingface.co')) {
                        return 'huggingface';
                    }
                    if (source.includes('civitai.com')) {
                        return 'civitai';
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to read provider from note:', error);
        }

        // Fallback to path-based detection
        return this.detectModelProviderFromPath(fullRelativePath);
    }

    /**
     * Legacy method: Detects model provider based on file path patterns.
     * This is used as a fallback when note-based provider detection fails.
     * @param fullRelativePath The relative path to the model file
     * @returns The provider type: 'civitai', 'huggingface', or 'unknown'
     */
    private detectModelProviderFromPath(fullRelativePath: string): 'civitai' | 'huggingface' | 'unknown' {
        // For now, return 'unknown' as the default. In the future, this could include
        // more sophisticated path-based detection logic
        return 'unknown';
    }
}