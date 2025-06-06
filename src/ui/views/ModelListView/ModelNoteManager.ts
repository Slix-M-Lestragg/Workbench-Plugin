import { Notice, TFile } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import type Workbench from './../../../main';
import { ModelMetadataManager } from '../../../services/models/ModelMetadataManager';
import { EnhancedModelMetadata, ModelProvider } from '../../../types/comfy';

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
        let frontmatter = `---\n`;
        
        // Add provider as plain text
        if (enhancedMetadata?.provider && enhancedMetadata.provider !== 'unknown') {
            frontmatter += `provider: ${enhancedMetadata.provider}`;
        } else {
            frontmatter += `provider: unknown`;
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

> [!tip] Provider Change Feature
> You can manually change the metadata source by editing the provider field in the frontmatter to either civitai or huggingface. 
> When you save the note, Workbench will automatically try to reprocess the model metadata from the selected provider.

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
        let frontmatter = `---\n`;
        
        // Add provider as plain text
        if (metadata?.provider && metadata.provider !== 'unknown') {
            frontmatter += `provider: ${metadata.provider}`;
        } else {
            frontmatter += `provider: unknown`;
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

> [!tip] Provider Change Feature
> You can manually change the metadata source by editing the provider field in the frontmatter to either civitai or huggingface. 
> When you save the note, Workbench will automatically try to reprocess the model metadata from the selected provider.

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
        if (pathParts.includes('llm')) return 'Large Language Model';
        
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
     * Detects the model provider based on file path patterns.
     * This is used as a fallback when note-based provider detection fails.
     * @param fullRelativePath The relative path to the model file
     * @returns The provider type: 'civitai', 'huggingface'
     */
    private detectModelProviderFromPath(fullRelativePath: string): 'civitai' | 'huggingface' | 'unknown' {
        const pathParts = fullRelativePath.split('/');
        const fileName = path.basename(fullRelativePath).toLowerCase();

        // Heuristic checks based on file path and name patterns
        if (pathParts.includes('civitai') || fileName.includes('civitai')) {
            return 'civitai';
        }
        if (pathParts.includes('huggingface') || fileName.includes('huggingface')) {
            return 'huggingface';
        }

        // Unknown provider
        return 'unknown';
    }

    /**
     * Detects if a provider has been manually changed in a note and reprocesses the model metadata.
     * This function reads the provider and model_path from the note's frontmatter.
     * @param notePath The path to the note file
     * @returns True if the note was reprocessed, false otherwise
     */
    async detectAndProcessProviderChange(notePath: string): Promise<boolean> {
        try {
            // Ensure we have a metadata manager
            if (!this.metadataManager) {
                console.warn("Cannot process provider change: No metadata manager available");
                return false;
            }

            // Get the note content
            const noteFile = this.plugin.app.vault.getAbstractFileByPath(notePath);
            if (!noteFile || !(noteFile instanceof TFile)) {
                console.warn(`Note not found or not a file: ${notePath}`);
                return false;
            }
            
            const noteContent = await this.plugin.app.vault.read(noteFile);
            
            // Extract provider from frontmatter
            const frontmatterMatch = noteContent.match(/^---\n([\s\S]*?)\n---/);
            if (!frontmatterMatch) {
                console.warn(`No frontmatter found in note: ${notePath}`);
                return false;
            }
            
            const frontmatter = frontmatterMatch[1];
            // Improved regex to handle various formats like 'provider: civitai', 'provider: "civitai"', etc.
            const providerMatch = frontmatter.match(/provider:\s*["']?([^"'\n]+)["']?/);
            if (!providerMatch) {
                console.warn(`No provider found in frontmatter: ${notePath}`);
                new Notice(`No provider field found in frontmatter. Cannot process provider change.`, 4000);
                return false;
            }
            
            // Get the provider from the note
            const noteProvider = providerMatch[1].trim().toLowerCase();
            if (noteProvider !== 'civitai' && noteProvider !== 'huggingface' && noteProvider !== 'unknown') {
                console.warn(`Invalid provider in note (must be civitai, huggingface, or unknown): ${noteProvider}`);
                new Notice(`Invalid provider: "${noteProvider}". Provider must be "civitai", "huggingface", or "unknown".`, 5000);
                return false;
            }
            
            // Get the model_path from the frontmatter - this is required for proper operation
            const modelPathMatch = frontmatter.match(/model_path:\s*([^\n]+)/);
            if (!modelPathMatch) {
                // Without model_path in frontmatter, we can't accurately locate the model file
                console.warn(`No model_path found in frontmatter. Cannot process provider change for note: ${notePath}`);
                new Notice(`Cannot process provider change: No model_path in frontmatter`, 4000);
                return false;
            }
            
            // Use the path from the frontmatter
            let modelPath = modelPathMatch[1].trim();
            // Remove any quotes if present
            modelPath = modelPath.replace(/^["']|["']$/g, '');
            
            console.log(`Using model_path from frontmatter: "${modelPath}"`);
            
            // Get the full model path for metadata lookup
            const deviceSettings = this.plugin.getCurrentDeviceSettings();
            const comfyPath = deviceSettings.comfyUiPath?.trim();
            if (!comfyPath) {
                console.warn("ComfyUI path not set in settings");
                return false;
            }
            
            const fullModelPath = path.join(comfyPath, 'models', modelPath);
            
            // Check if model exists
            try {
                console.log(`Checking if model exists at: ${fullModelPath}`);
                await fs.promises.access(fullModelPath);
                console.log(`✅ Model file found at ${fullModelPath}`);
            } catch (err) {
                const errorMessage = `Model file not found at ${fullModelPath}. Cannot process provider change.`;
                console.warn(errorMessage);
                new Notice(errorMessage, 5000);
                return false;
            }
            
            // Get current metadata
            console.log(`Getting current metadata for model: ${fullModelPath}`);
            const currentMetadata = await this.metadataManager.enrichModelMetadata(fullModelPath, false);
            
            // If provider is set to unknown, no reprocessing needed
            if (noteProvider === 'unknown') {
                console.log(`Provider set to 'unknown', no reprocessing needed`);
                new Notice(`Provider set to 'unknown'. No metadata refresh will be performed.\nTo fetch metadata, change provider to 'civitai' or 'huggingface'.`, 5000);
                return false;
            }
            
            // Check if provider has been changed
            if (currentMetadata.provider === noteProvider as ModelProvider) {
                console.log(`Provider unchanged (${noteProvider}), no reprocessing needed`);
                return false;
            }
            
            console.log(`Provider changed from ${currentMetadata.provider} to ${noteProvider}, reprocessing model metadata...`);
            new Notice(`Provider changed to ${noteProvider}. Reprocessing model metadata for ${path.basename(modelPath)}...`, 5000);
            
            // Force refresh using the target provider
            const newMetadata = await this.forceRefreshWithTargetProvider(fullModelPath, noteProvider as ModelProvider);
            
            if (newMetadata) {
                // Regenerate note content with new metadata
                const notesFolder = deviceSettings.modelNotesFolderPath?.trim();
                if (!notesFolder) {
                    console.warn("Model notes folder not set in settings");
                    return false;
                }
                
                // Delete and recreate the note
                await this.plugin.app.vault.delete(noteFile);
                
                // Get directory structure info (needed for note creation)
                const modelsBasePath = path.join(comfyPath, 'models');
                const directoryInfo = {}; // We can pass an empty object here as it's not critical

                // Create a new note with the refreshed metadata
                await this.createModelNoteWithMetadata(modelPath, modelsBasePath, directoryInfo, newMetadata);
                
                new Notice(`Model metadata reprocessed with ${noteProvider} provider`, 3000);
                return true;
            } else {
                new Notice(`Failed to find metadata for ${path.basename(modelPath)} using ${noteProvider} provider`, 5000);
                return false;
            }
        } catch (error) {
            console.error("Error processing provider change:", error);
            new Notice(`Error reprocessing model metadata: ${error.message}`);
            return false;
        }
    }

    /**
     * Forces a metadata refresh using a specific target provider
     * @param fullModelPath Full path to the model file
     * @param targetProvider The provider to use for metadata lookup
     * @returns Updated model metadata or null if no metadata found
     */
    private async forceRefreshWithTargetProvider(fullModelPath: string, targetProvider: ModelProvider): Promise<EnhancedModelMetadata | null> {
        if (!this.metadataManager) {
            console.error("Metadata manager is not available");
            new Notice("Cannot search for metadata: Metadata manager not available", 3000);
            return null;
        }
        
        // Skip if provider is "unknown" - can't search with that
        if (targetProvider === 'unknown') {
            console.warn("Cannot search with 'unknown' provider");
            new Notice("Cannot search with 'unknown' provider. Please specify 'civitai' or 'huggingface'", 4000);
            return null;
        }
        
        try {
            // Show a notice to the user about what's happening
            new Notice(`Searching for metadata using ${targetProvider} provider. This may take a moment...`, 3000);
            console.log(`🔍 Searching for metadata from ${targetProvider} for model: ${fullModelPath}`);
            
            // Check if API keys are set for the selected provider
            const settings = this.plugin.settings;
            if (targetProvider === 'civitai' && (!settings.enableCivitaiIntegration || !settings.civitaiApiKey)) {
                const errorMsg = `CivitAI integration is ${settings.enableCivitaiIntegration ? 'enabled but API key is missing' : 'disabled'}`;
                console.warn(errorMsg);
                new Notice(`Cannot search CivitAI: ${errorMsg}`, 4000);
                return null;
            }
            
            if (targetProvider === 'huggingface' && (!settings.enableHuggingfaceIntegration || !settings.huggingfaceApiKey)) {
                const errorMsg = `HuggingFace integration is ${settings.enableHuggingfaceIntegration ? 'enabled but API key is missing' : 'disabled'}`;
                console.warn(errorMsg);
                new Notice(`Cannot search HuggingFace: ${errorMsg}`, 4000);
                return null;
            }
            
            // Use the new public method to search using a specific provider
            // Cast targetProvider to the expected type since we've already filtered out 'unknown'
            console.log(`Using enrichModelMetadataWithProvider to search ${targetProvider} for model: ${fullModelPath}`);
            const metadata = await this.metadataManager.enrichModelMetadataWithProvider(
                fullModelPath,
                targetProvider as 'civitai' | 'huggingface',
                true // Force refresh
            );
            
            // Check if we got valid metadata for the requested provider
            if (metadata.provider === targetProvider) {
                console.log(`✅ Successfully found ${targetProvider} metadata for ${path.basename(fullModelPath)}`);
                return metadata;
            } else {
                console.warn(`📣 No metadata found from ${targetProvider} for ${fullModelPath}`);
                return null;
            }
        } catch (error) {
            const errorMsg = `Failed to search for ${targetProvider} metadata: ${error instanceof Error ? error.message : String(error)}`;
            console.warn(errorMsg, error);
            new Notice(errorMsg, 5000);
            return null;
        }
    }

    /**
     * Gets the source URL for a model by reading it from the corresponding note's frontmatter.
     * @param fullRelativePath The relative path to the model file
     * @param notesFolder The base folder where notes are stored
     * @returns The source URL or null if not found
     */
    async getModelSourceFromNote(fullRelativePath: string, notesFolder?: string): Promise<string | null> {
        if (!notesFolder) {
            return null;
        }

        try {
            // Construct the note path
            const noteFileName = path.basename(fullRelativePath, path.extname(fullRelativePath)) + '.md';
            const noteSubfolderPath = path.dirname(fullRelativePath);
            const fullNotePath = path.join(notesFolder, noteSubfolderPath, noteFileName).replace(/\\/g, '/');

            // Check if the note exists and is a file
            const noteFile = this.plugin.app.vault.getAbstractFileByPath(fullNotePath);
            if (!noteFile || !('stat' in noteFile)) {
                return null;
            }

            // Read the note content
            const noteContent = await this.plugin.app.vault.read(noteFile as TFile);
            
            // Parse frontmatter to get source
            const frontmatterMatch = noteContent.match(/^---\n([\s\S]*?)\n---/);
            if (frontmatterMatch) {
                const frontmatter = frontmatterMatch[1];
                
                // Extract source field
                const sourceMatch = frontmatter.match(/source:\s*['""]?([^'"\n]+)['""]?/);
                if (sourceMatch) {
                    return sourceMatch[1].trim();
                }
            }
        } catch (error) {
            console.warn('Failed to read source from note:', error);
        }

        return null;
    }
}