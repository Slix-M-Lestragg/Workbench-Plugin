import { Notice, TFile } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import type Workbench from '../../main';
import { ModelMetadataManager } from '../../comfy/metadataManager';
import { EnhancedModelMetadata } from '../../comfy/types';

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
        const modelType = this.inferModelType(relativeModelPath);
        
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

        // Build tags array (excluding license and region tags) and extract license
        const allTags = new Set<string>();
        let extractedLicense = '';
        
        if (enhancedMetadata?.civitaiModel?.tags) {
            enhancedMetadata.civitaiModel.tags.forEach(tag => {
                const tagLower = tag.toLowerCase();
                if (tagLower.startsWith('license:')) {
                    extractedLicense = tag.substring(8); // Remove 'license:' prefix
                } else if (!tagLower.includes('license') && !tagLower.startsWith('region:')) {
                    allTags.add(tag);
                }
            });
        }
        if (enhancedMetadata?.huggingfaceModel?.tags) {
            enhancedMetadata.huggingfaceModel.tags.forEach(tag => {
                const tagLower = tag.toLowerCase();
                if (tagLower.startsWith('license:')) {
                    extractedLicense = tag.substring(8); // Remove 'license:' prefix
                } else if (!tagLower.includes('license') && !tagLower.startsWith('region:')) {
                    allTags.add(tag);
                }
            });
        }
        
        // Build frontmatter in the new format
        let frontmatter = `---\nprovider:`;
        
        // Add provider as array
        if (enhancedMetadata?.provider && enhancedMetadata.provider !== 'unknown') {
            frontmatter += `\n  - ${enhancedMetadata.provider}`;
        } else {
            frontmatter += `\n  - unknown`;
        }
        
        // Add common fields based on provider
        if (enhancedMetadata?.huggingfaceModel) {
            const hfModel = enhancedMetadata.huggingfaceModel;
            if (hfModel.downloads) frontmatter += `\ndownloads: ${hfModel.downloads}`;
            if (hfModel.likes) frontmatter += `\nlikes: ${hfModel.likes}`;
            if (enhancedMetadata.isVerified !== undefined) frontmatter += `\nverified: ${enhancedMetadata.isVerified}`;
            frontmatter += `\nAuthor: ${hfModel.author}`;
            frontmatter += `\nmodel_type:\n  - ${modelType}`;
            if (hfModel.pipeline_tag) {
                frontmatter += `\npipeline:\n  - ${hfModel.pipeline_tag}`;
            }
            if (enhancedMetadata.relationships?.baseModel) {
                frontmatter += `\nrelationship_base_model: ${enhancedMetadata.relationships.baseModel}`;
            }
            frontmatter += `\nmodel_id: ${hfModel.id}`;
            frontmatter += `\nmodel_filename: ${modelFilename}`;
            frontmatter += `\nmodel_path: ${relativeModelPath.replace(/\\/g, '/')}`;
            frontmatter += `\nsource: https://huggingface.co/${hfModel.id}`;
        } else if (enhancedMetadata?.civitaiModel) {
            const model = enhancedMetadata.civitaiModel;
            if (model.stats?.downloadCount) frontmatter += `\ndownloads: ${model.stats.downloadCount}`;
            if (model.stats?.favoriteCount) frontmatter += `\nlikes: ${model.stats.favoriteCount}`;
            if (enhancedMetadata.isVerified !== undefined) frontmatter += `\nverified: ${enhancedMetadata.isVerified}`;
            if (model.creator?.username) frontmatter += `\nAuthor: ${model.creator.username}`;
            frontmatter += `\nmodel_type:\n  - ${modelType}`;
            if (enhancedMetadata.civitaiVersion?.baseModel) {
                frontmatter += `\nrelationship_base_model: ${enhancedMetadata.civitaiVersion.baseModel}`;
            }
            frontmatter += `\nmodel_id: ${model.id}`;
            frontmatter += `\nmodel_filename: ${modelFilename}`;
            frontmatter += `\nmodel_path: ${relativeModelPath.replace(/\\/g, '/')}`;
            frontmatter += `\nsource: https://civitai.com/models/${model.id}`;
        } else {
            // Fallback for unknown provider
            frontmatter += `\nmodel_type:\n  - ${modelType}`;
            frontmatter += `\nmodel_filename: ${modelFilename}`;
            frontmatter += `\nmodel_path: ${relativeModelPath.replace(/\\/g, '/')}`;
        }
        
        // Add tags
        if (allTags.size > 0) {
            frontmatter += `\ntags:`;
            Array.from(allTags).slice(0, 20).forEach(tag => {
                frontmatter += `\n  - ${tag}`;
            });
        }
        
        // Add license if available
        if (enhancedMetadata?.huggingfaceModel?.card_data?.license) {
            frontmatter += `\nlicense: ${enhancedMetadata.huggingfaceModel.card_data.license}`;
        } else if (extractedLicense) {
            frontmatter += `\nlicense: ${extractedLicense}`;
        } else if (enhancedMetadata?.civitaiModel?.allowNoCredit !== undefined) {
            // CivitAI license info - allowNoCredit is a boolean indicating license restrictions
            const licenseType = enhancedMetadata.civitaiModel.allowNoCredit ? 'permissive' : 'restricted';
            frontmatter += `\nlicense: ${licenseType}`;
        }
        
        // Add last synced
        if (enhancedMetadata?.lastSynced) {
            frontmatter += `\nlast_synced: ${enhancedMetadata.lastSynced.toISOString()}`;
        }
        
        frontmatter += `\n---\n`;
        
        // Add content in new format
        const content = `### Model Information

| <center>Type</center> | <center>Author</center> | <center>Provider</center> | <center>URL</center> | <center>License</center> | <center>Downloads</center> | Likes           |
| --------------------- | ----------------------- | ------------------------- | -------------------- | ------------------------ | -------------------------- | --------------- |
| \`= this.model_type\`   | \`= this.author\`         | \`= this.provider\`         | \`= this.source\`      | \`= this.license\`         | \`= this.downloads\`         |  \`= this.likes\` |

**Tags** : \`$= "#" + dv.current().tags.join(" #")\`
## Usage Notes

*Add your notes about using this model here.*


`;

        return frontmatter + content;
    }

    /**
     * Creates a Markdown note for a given model file using pre-found metadata.
     * This method uses metadata that was already discovered during UI rendering to ensure consistency.
     * @param relativeModelPath Path of the model file relative to the ComfyUI 'models' directory.
     * @param modelsBasePath Absolute path to the root ComfyUI 'models' directory.
     * @param directoryInfo Information about all files in each directory for enhanced note content.
     * @param metadata Pre-found metadata to use for the note creation.
     */
    async createModelNoteWithMetadata(
        relativeModelPath: string, 
        modelsBasePath: string, 
        directoryInfo: Record<string, string[]>, 
        metadata: EnhancedModelMetadata | null
    ): Promise<void> {
        console.log(`📝 ModelNoteManager: Creating note for ${relativeModelPath} with metadata:`, metadata);
        console.log(`📝 ModelNoteManager: Provider: ${metadata?.provider}, CivitAI: ${!!metadata?.civitaiModel}, HF: ${!!metadata?.huggingfaceModel}`);
        
        const deviceSettings = this.plugin.getCurrentDeviceSettings();
        const notesFolder = deviceSettings.modelNotesFolderPath?.trim();

        if (!notesFolder) {
            return;
        }

        const noteFileName = path.basename(relativeModelPath, path.extname(relativeModelPath)) + '.md';
        const noteSubfolderPath = path.dirname(relativeModelPath);
        const fullNoteFolderPath = path.join(notesFolder, noteSubfolderPath).replace(/\\/g, '/');
        const fullNotePath = path.join(fullNoteFolderPath, noteFileName).replace(/\\/g, '/');
        const sourceModelFullPath = path.join(modelsBasePath, relativeModelPath);

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
                        noteContent = await this.generateFrontmatterWithMetadata(relativeModelPath, directoryInfo, metadata);
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
                    noteContent = await this.generateFrontmatterWithMetadata(relativeModelPath, directoryInfo, metadata);
                    // --- End Default Handling ---
                }

                await this.plugin.app.vault.create(fullNotePath, noteContent);
                console.log(`Created model note with pre-found metadata: ${fullNotePath}`);
            }
        } catch (error) {
            console.error(`Error creating model note for ${relativeModelPath} at ${fullNotePath}:`, error);
            new Notice(`Error creating note for ${path.basename(relativeModelPath)}. Check console.`);
        }
    }

    /**
     * Generates frontmatter content using pre-found metadata.
     * @param relativeModelPath Path of the model file relative to the ComfyUI 'models' directory.
     * @param directoryInfo Information about all files in each directory.
     * @param metadata Pre-found enhanced metadata.
     * @returns A string containing the note content with frontmatter.
     */
    async generateFrontmatterWithMetadata(
        relativeModelPath: string, 
        directoryInfo: Record<string, string[]>, 
        metadata: EnhancedModelMetadata | null
    ): Promise<string> {
        console.log(`📝 generateFrontmatterWithMetadata: Processing ${relativeModelPath} with metadata:`, metadata);
        console.log(`📝 generateFrontmatterWithMetadata: Provider: ${metadata?.provider}, CivitAI: ${!!metadata?.civitaiModel}, HF: ${!!metadata?.huggingfaceModel}`);
        
        const modelFilename = path.basename(relativeModelPath);
        const modelType = this.inferModelType(relativeModelPath);
        
        // Build tags array (excluding license and region tags) and extract license
        const allTags = new Set<string>();
        let extractedLicense = '';
        
        if (metadata?.civitaiModel?.tags) {
            metadata.civitaiModel.tags.forEach(tag => {
                const tagLower = tag.toLowerCase();
                if (tagLower.startsWith('license:')) {
                    extractedLicense = tag.substring(8); // Remove 'license:' prefix
                } else if (!tagLower.includes('license') && !tagLower.startsWith('region:')) {
                    allTags.add(tag);
                }
            });
        }
        if (metadata?.huggingfaceModel?.tags) {
            metadata.huggingfaceModel.tags.forEach(tag => {
                const tagLower = tag.toLowerCase();
                if (tagLower.startsWith('license:')) {
                    extractedLicense = tag.substring(8); // Remove 'license:' prefix
                } else if (!tagLower.includes('license') && !tagLower.startsWith('region:')) {
                    allTags.add(tag);
                }
            });
        }
        
        // Build frontmatter in the new format
        let frontmatter = `---\nprovider:`;
        
        // Add provider as array
        if (metadata?.provider && metadata.provider !== 'unknown') {
            frontmatter += `\n  - ${metadata.provider}`;
        } else {
            frontmatter += `\n  - unknown`;
        }
        
        // Add common fields based on provider
        if (metadata?.huggingfaceModel) {
            const hfModel = metadata.huggingfaceModel;
            if (hfModel.downloads) frontmatter += `\ndownloads: ${hfModel.downloads}`;
            if (hfModel.likes) frontmatter += `\nlikes: ${hfModel.likes}`;
            if (metadata.isVerified !== undefined) frontmatter += `\nverified: ${metadata.isVerified}`;
            frontmatter += `\nAuthor: ${hfModel.author}`;
            frontmatter += `\nmodel_type:\n  - ${modelType}`;
            if (hfModel.pipeline_tag) {
                frontmatter += `\npipeline:\n  - ${hfModel.pipeline_tag}`;
            }
            if (metadata.relationships?.baseModel) {
                frontmatter += `\nrelationship_base_model: ${metadata.relationships.baseModel}`;
            }
            frontmatter += `\nmodel_id: ${hfModel.id}`;
            frontmatter += `\nmodel_filename: ${modelFilename}`;
            frontmatter += `\nmodel_path: ${relativeModelPath.replace(/\\/g, '/')}`;
            frontmatter += `\nsource: https://huggingface.co/${hfModel.id}`;
        } else if (metadata?.civitaiModel) {
            const model = metadata.civitaiModel;
            if (model.stats?.downloadCount) frontmatter += `\ndownloads: ${model.stats.downloadCount}`;
            if (model.stats?.favoriteCount) frontmatter += `\nlikes: ${model.stats.favoriteCount}`;
            if (metadata.isVerified !== undefined) frontmatter += `\nverified: ${metadata.isVerified}`;
            if (model.creator?.username) frontmatter += `\nAuthor: ${model.creator.username}`;
            frontmatter += `\nmodel_type:\n  - ${modelType}`;
            if (metadata.civitaiVersion?.baseModel) {
                frontmatter += `\nrelationship_base_model: ${metadata.civitaiVersion.baseModel}`;
            }
            frontmatter += `\nmodel_id: ${model.id}`;
            frontmatter += `\nmodel_filename: ${modelFilename}`;
            frontmatter += `\nmodel_path: ${relativeModelPath.replace(/\\/g, '/')}`;
            frontmatter += `\nsource: https://civitai.com/models/${model.id}`;
        } else {
            // Fallback for unknown provider
            frontmatter += `\nmodel_type:\n  - ${modelType}`;
            frontmatter += `\nmodel_filename: ${modelFilename}`;
            frontmatter += `\nmodel_path: ${relativeModelPath.replace(/\\/g, '/')}`;
        }
        
        // Add tags
        if (allTags.size > 0) {
            frontmatter += `\ntags:`;
            Array.from(allTags).slice(0, 20).forEach(tag => {
                frontmatter += `\n  - ${tag}`;
            });
        }
        
        // Add license if available
        if (metadata?.huggingfaceModel?.card_data?.license) {
            frontmatter += `\nlicense: ${metadata.huggingfaceModel.card_data.license}`;
        } else if (extractedLicense) {
            frontmatter += `\nlicense: ${extractedLicense}`;
        } else if (metadata?.civitaiModel?.allowNoCredit !== undefined) {
            // CivitAI license info - allowNoCredit is a boolean indicating license restrictions
            const licenseType = metadata.civitaiModel.allowNoCredit ? 'permissive' : 'restricted';
            frontmatter += `\nlicense: ${licenseType}`;
        }
        
        // Add last synced
        if (metadata?.lastSynced) {
            frontmatter += `\nlast_synced: ${metadata.lastSynced.toISOString()}`;
        }
        
        frontmatter += `\n---\n`;
        
        // Add content in new format
        const content = `### Model Information

| <center>Type</center> | <center>Author</center> | <center>Provider</center> | <center>URL</center> | <center>License</center> | <center>Downloads</center> | Likes           |
| --------------------- | ----------------------- | ------------------------- | -------------------- | ------------------------ | -------------------------- | --------------- |
| \`= this.model_type\`   | \`= this.author\`         | \`= this.provider\`         | \`= this.source\`      | \`= this.license\`         | \`= this.downloads\`         |  \`= this.likes\` |

**Tags** : \`$= "#" + dv.current().tags.join(" #")\`
## Usage Notes

*Add your notes about using this model here.*


`;

        return frontmatter + content;
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
        const pathLower = fullRelativePath.toLowerCase();
        
        // HuggingFace patterns
        if (pathLower.includes('huggingface') || 
            pathLower.includes('hf-hub') ||
            pathLower.includes('transformers') ||
            pathLower.match(/.*\/.*--.*\/.*/) || // HF cache pattern: author--model/version
            pathLower.includes('diffusers')) {
            return 'huggingface';
        }
        
        // CivitAI patterns (often have hash-based names or specific folders)
        if (pathLower.includes('civitai') ||
            pathLower.match(/^[a-f0-9]{8,}\./) || // Hash-based filenames
            pathLower.includes('lora') && pathLower.match(/\d+\.safetensors$/)) {
            return 'civitai';
        }
        
        return 'unknown';
    }
}