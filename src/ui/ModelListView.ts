import { ItemView, WorkspaceLeaf, App, setIcon, Notice, Modal, TFile } from 'obsidian';
import * as fs from 'fs'; // Import fs for reading file content
import * as path from 'path';
import type Workbench from '../main';
import { ModelMetadataManager } from '../comfy/metadataManager';
import { EnhancedModelMetadata } from '../comfy/types';
import { HuggingFaceService } from '../comfy/huggingface';
import { CIVITAI_ICON_NAME, HUGGINGFACE_ICON_NAME, UNKNOWN_PROVIDER_ICON_NAME } from './icons';
import type { HuggingFaceModel, HuggingFaceFile } from '../comfy/types';

export const MODEL_LIST_VIEW_TYPE = "comfyui-model-list-view";
export const MODEL_LIST_ICON = "notebook-tabs"; // Obsidian icon name

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
 * Recursively finds all model files within a directory and its subdirectories.
 * Also gathers information about related files in the same directories for note generation.
 * @param dirPath The absolute path to the directory to search.
 * @param baseModelsPath The absolute path to the root 'models' directory, used for calculating relative paths.
 * @returns A promise that resolves to an object containing model files and directory info.
 */
async function findModelsRecursive(dirPath: string, baseModelsPath: string): Promise<{
    modelFiles: string[];
    directoryInfo: Record<string, string[]>;
}> {
    let modelFiles: string[] = [];
    const directoryInfo: Record<string, string[]> = {};
    
    try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const currentDirRelative = path.relative(baseModelsPath, dirPath);
        const filesInDir: string[] = [];
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                // Recursively search subdirectories
                const subResult = await findModelsRecursive(fullPath, baseModelsPath);
                modelFiles = modelFiles.concat(subResult.modelFiles);
                Object.assign(directoryInfo, subResult.directoryInfo);
            } else if (entry.isFile() && !entry.name.startsWith('.')) {
                // Track all files in this directory for note generation
                filesInDir.push(entry.name);
                
                // Only add to modelFiles if it's actually a model
                if (isModelFile(entry.name)) {
                    const relativePath = path.relative(baseModelsPath, fullPath);
                    modelFiles.push(relativePath);
                }
            }
        }
        
        // Store directory info for note generation (only if there are files)
        if (filesInDir.length > 0) {
            directoryInfo[currentDirRelative || '.'] = filesInDir;
        }
    } catch (error: unknown) {
        // Log errors but continue if possible (e.g., permission denied for a subfolder)
        console.error(`Error reading directory ${dirPath}:`, error);
        // Optionally, re-throw specific critical errors if needed
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT' && dirPath === baseModelsPath) {
             throw error; // Re-throw if the base models directory doesn't exist
        }
    }
    return { modelFiles, directoryInfo };
}

// --- Type definition for the nested tree structure ---
type ModelTreeNode = {
    [key: string]: ModelTreeNode | string[]; // Folders map to nodes, files map to full relative paths
};

// --- Function to build the nested tree ---
function buildModelTree(filePaths: string[]): ModelTreeNode {
    const tree: ModelTreeNode = {};

    filePaths.forEach(filePath => {
        // Normalize path separators for consistency
        const parts = filePath.replace(/\\/g, '/').split('/');
        let currentNode = tree;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLastPart = i === parts.length - 1;

            if (isLastPart) {
                // It's a file, add the *full relative path* to the 'files' array
                if (!currentNode['_files_']) {
                    currentNode['_files_'] = [];
                }
                // Store the full relative path, not just the filename (part)
                (currentNode['_files_'] as string[]).push(filePath);
            } else {
                // It's a directory part
                if (!currentNode[part]) {
                    currentNode[part] = {}; // Create a new node if it doesn't exist
                }
                // Ensure we are moving into an object node
                if (typeof currentNode[part] !== 'object' || Array.isArray(currentNode[part])) {
                    // This case should ideally not happen if structure is consistent
                    // but handles potential conflicts (e.g., file and folder with same name)
                    console.warn(`Model tree conflict: ${part} exists non-directory node.`);
                    // Decide on conflict resolution, e.g., overwrite or skip
                    currentNode[part] = {}; // Overwrite with a directory node
                }
                 currentNode = currentNode[part] as ModelTreeNode;
            }
        }
    });

    return tree;
}


export class ModelListView extends ItemView {
    plugin: Workbench;
    private metadataManager: ModelMetadataManager | null = null;
    private huggingfaceService: HuggingFaceService | null = null;

    constructor(leaf: WorkspaceLeaf, app: App, plugin: Workbench) {
        super(leaf);
        this.app = app;
        // Get the plugin instance using the app object
        this.plugin = plugin;
        if (!this.plugin) {
            console.error("ModelListView: Could not get Workbench plugin instance!");
        }
    }

    getViewType(): string {
        return MODEL_LIST_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "ComfyUI Models";
    }

    getIcon(): string {
        return MODEL_LIST_ICON;
    }

    // --- Recursive function to render the tree ---
    async renderModelTree(node: ModelTreeNode, parentEl: HTMLElement): Promise<void> {
        const deviceSettings = this.plugin.getCurrentDeviceSettings();
        const notesFolder = deviceSettings.modelNotesFolderPath?.trim();

        // Get sorted keys (folders first, then files)
        const keys = Object.keys(node).sort((a, b) => {
            const aIsFileArray = a === '_files_';
            const bIsFileArray = b === '_files_';
            const aIsDir = !aIsFileArray && typeof node[a] === 'object';
            const bIsDir = !bIsFileArray && typeof node[b] === 'object';

            if (aIsDir && !bIsDir) return -1; // Directories first
            if (!aIsDir && bIsDir) return 1;
            return a.localeCompare(b); // Then sort alphabetically
        });

        for (const key of keys) {
            if (key === '_files_') {
                // Render files in the current directory
                const filePaths = (node[key] as string[]).sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
                const fileListEl = parentEl.createEl('ul', { cls: 'wb-model-file-list' });

                // Process files with async operations
                await Promise.all(filePaths.map(async (fullRelativePath) => {
                    const fileName = path.basename(fullRelativePath); // Extract filename for display
                    const fileItemEl = fileListEl.createEl('li', { cls: 'wb-model-file-item' });
                    
                    // Enhance with CivitAI metadata if enabled
                    if (this.metadataManager && this.plugin.settings.enableCivitaiIntegration) {
                        await this.enhanceFileItemWithCivitAI(fileItemEl, fullRelativePath, fileName, notesFolder);
                    } else {
                        await this.renderBasicFileItem(fileItemEl, fullRelativePath, fileName, notesFolder);
                    }
                }));
                 // Ensure the file list is directly under the parent (which should be details or root)
                 if (parentEl.tagName.toLowerCase() !== 'details') {
                     parentEl.appendChild(fileListEl);
                 } else {
                     // If parent is details, append file list inside it
                     parentEl.appendChild(fileListEl);
                 }

            } else {
                // Render a subfolder (recursive step)
                const subNode = node[key] as ModelTreeNode;
                const detailsEl = parentEl.createEl('details', { cls: 'wb-model-folder-details' });
                // detailsEl.open = false; // Collapsed by default

                const summaryEl = detailsEl.createEl('summary', { cls: 'wb-model-folder-summary' });
                const iconEl = summaryEl.createSpan({ cls: 'wb-model-folder-icon' });
                setIcon(iconEl, 'folder');
                summaryEl.createSpan({ text: key }); // Folder name

                // Recursively render the content of the subfolder
                await this.renderModelTree(subNode, detailsEl);
            }
        }
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
            const noteExists = await this.app.vault.adapter.exists(fullNotePath);

            if (!noteExists) {
                const folderExists = await this.app.vault.adapter.exists(fullNoteFolderPath);
                if (!folderExists) {
                    await this.app.vault.adapter.mkdir(fullNoteFolderPath);
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

                await this.app.vault.create(fullNotePath, noteContent);
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

    async onOpen() {
        // Initialize metadata manager if CivitAI integration is enabled
        if (this.plugin && this.plugin.settings.enableCivitaiIntegration) {
            this.metadataManager = new ModelMetadataManager(
                this.app.vault,
                this.plugin.settings.civitaiApiKey,
                this.plugin.settings.huggingfaceApiKey
            );
        }

        const container = this.contentEl;
        container.empty();
        container.addClass('wb-model-list-view'); // Add a class for potential styling
        
        // Create header with title and refresh button
        const headerEl = container.createDiv({ cls: 'wb-model-list-header' });
        headerEl.createEl("h4", { text: "ComfyUI Models" });
        
        const actionsEl = headerEl.createDiv({ cls: 'wb-header-actions' });
        
        // Add refresh button
        const refreshBtn = actionsEl.createEl('button', {
            cls: 'wb-refresh-btn',
            title: 'Refresh model list'
        });
        setIcon(refreshBtn, 'refresh-cw');
        
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.addClass('wb-refreshing');
            try {
                await this.refresh();
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.removeClass('wb-refreshing');
            }
        });
        
        // Add refresh metadata button if CivitAI integration is enabled
        if (this.plugin && this.plugin.settings.enableCivitaiIntegration) {
            const refreshMetadataBtn = actionsEl.createEl('button', {
                cls: 'wb-refresh-metadata-btn',
                title: 'Refresh all model metadata from CivitAI'
            });
            setIcon(refreshMetadataBtn, CIVITAI_ICON_NAME);
            
            refreshMetadataBtn.addEventListener('click', async () => {
                refreshMetadataBtn.disabled = true;
                refreshMetadataBtn.addClass('wb-refreshing');
                try {
                    await this.refreshWithMetadata();
                    new Notice('Model metadata refreshed from CivitAI');
                } catch (error) {
                    console.error('Error refreshing metadata:', error);
                    new Notice('Error refreshing metadata. Check console for details.');
                } finally {
                    refreshMetadataBtn.disabled = false;
                    refreshMetadataBtn.removeClass('wb-refreshing');
                }
            });
        }

        // Add HuggingFace refresh button if HuggingFace integration is enabled
        if (this.plugin && this.plugin.settings.enableHuggingfaceIntegration) {
            const refreshHFBtn = actionsEl.createEl('button', {
                cls: 'wb-refresh-hf-btn',
                title: 'Refresh model metadata from HuggingFace'
            });
            setIcon(refreshHFBtn, HUGGINGFACE_ICON_NAME);
            
            refreshHFBtn.addEventListener('click', async () => {
                refreshHFBtn.disabled = true;
                refreshHFBtn.addClass('wb-refreshing');
                try {
                    await this.refreshHuggingFaceMetadata();
                    new Notice('HuggingFace model metadata refreshed');
                } catch (error) {
                    console.error('Error refreshing HuggingFace metadata:', error);
                    new Notice('Error refreshing HuggingFace metadata. Check console for details.');
                } finally {
                    refreshHFBtn.disabled = false;
                    refreshHFBtn.removeClass('wb-refreshing');
                }
            });

            // Add HuggingFace search button
            const searchHFBtn = actionsEl.createEl('button', {
                cls: 'wb-search-hf-btn',
                title: 'Search HuggingFace models'
            });
            setIcon(searchHFBtn, 'search');
            
            searchHFBtn.addEventListener('click', () => {
                this.showHuggingFaceSearchModal();
            });
        }

        // --- End search interface ---

        if (!this.plugin) {
            container.createEl("p", { text: "Error: Workbench plugin instance not found." });
            return;
        }

        const deviceSettings = this.plugin.getCurrentDeviceSettings();
        const comfyPath = deviceSettings.comfyUiPath?.trim();
        const modelNotesFolderPath = deviceSettings.modelNotesFolderPath?.trim(); // Get notes folder path

        if (!comfyPath) {
            container.createEl("p", { text: "ComfyUI base directory path is not set in settings for the current OS." });
            return;
        }

        // Check if the notes folder path is set
        if (!modelNotesFolderPath) {
             container.createEl("p", { cls: 'wb-warning-text', text: "Warning: Model Notes Folder is not set in Workbench settings. Markdown notes for models will not be created." });
             // Continue without note creation functionality
        }

        const modelsPath = path.join(comfyPath, 'models');
        const loadingEl = container.createEl("p", { text: `Scanning models directory: ${modelsPath}...` });

        try {
            // Use the recursive function to find all model files
            const scanResult = await findModelsRecursive(modelsPath, modelsPath);
            const modelFiles = scanResult.modelFiles;
            const directoryInfo = scanResult.directoryInfo;
            
            loadingEl.setText(`Found ${modelFiles.length} model files. Processing...`); // Update loading text

            // --- Create Markdown notes for each model file (if setting is enabled) ---
            if (modelNotesFolderPath && modelFiles.length > 0) {
                new Notice(`Creating/checking notes for ${modelFiles.length} models...`, 3000);
                const noteCreationPromises = modelFiles.map(relativeModelPath =>
                    // Pass modelsPath and directoryInfo to the function
                    this.createModelNoteIfNeeded(relativeModelPath, modelsPath, directoryInfo)
                );
                await Promise.all(noteCreationPromises); // Wait for all checks/creations
                new Notice(`Finished processing model notes.`, 2000);
            }
            // --- End note creation ---

            loadingEl.remove(); // Remove loading message

            if (modelFiles.length === 0) {
                container.createEl("p", { text: "No model files found in the directory or its subdirectories." });
            } else {
                // Build a nested tree structure from the flat file list
                const modelTree = buildModelTree(modelFiles);
                // console.log(`Model tree structure:`, modelTree); // Keep for debugging if needed

                // --- Render the nested tree ---
                const treeRootEl = container.createDiv({ cls: 'wb-model-tree-root' });
                await this.renderModelTree(modelTree, treeRootEl); // Start rendering the tree
            }
        } catch (error: unknown) {
            loadingEl.remove(); // Remove loading message
            console.error(`Error scanning models directory (${modelsPath}):`, error);
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                container.createEl("p", { cls: 'wb-error-text', text: `Error: Base models directory not found at '${modelsPath}'. Please check your ComfyUI path settings.` });
            } else {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                container.createEl("p", { cls: 'wb-error-text', text: `Error scanning models directory: ${errorMessage}` });
            }
        }
    }

    async onClose() {
        // Clean up view content
        this.contentEl.empty();
    }

    /**
     * Determines the provider of a model based on its metadata or path characteristics.
     * @param fullRelativePath Path of the model file relative to the ComfyUI 'models' directory.
     * @returns The detected provider type.
     */
    /**
     * Gets the provider for a model by reading it from the corresponding note's frontmatter.
     * Falls back to path-based detection if the note doesn't exist or doesn't have provider info.
     * @param fullRelativePath The relative path to the model file
     * @param notesFolder The base folder where notes are stored
     * @returns The provider type: 'civitai', 'huggingface', or 'unknown'
     */
    private async getModelProviderFromNote(fullRelativePath: string, notesFolder?: string): Promise<'civitai' | 'huggingface' | 'unknown'> {
        if (!notesFolder) {
            return this.detectModelProviderFromPath(fullRelativePath);
        }

        try {
            // Construct the note path
            const noteFileName = path.basename(fullRelativePath, path.extname(fullRelativePath)) + '.md';
            const noteSubfolderPath = path.dirname(fullRelativePath);
            const fullNotePath = path.join(notesFolder, noteSubfolderPath, noteFileName).replace(/\\/g, '/');

            // Check if the note exists and is a file
            const noteFile = this.app.vault.getAbstractFileByPath(fullNotePath);
            if (!noteFile || !('stat' in noteFile)) {
                return this.detectModelProviderFromPath(fullRelativePath);
            }

            // Read the note content
            const noteContent = await this.app.vault.read(noteFile as TFile);
            
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

    /**
     * Shows the HuggingFace search modal for discovering and downloading models
     */
    private showHuggingFaceSearchModal(): void {
        new HuggingFaceSearchModal(this.app, this.plugin).open();
    }

    /**
     * Refresh the model list view
     */
    private async refresh(): Promise<void> {
        await this.onOpen();
    }

    /**
     * Refresh model metadata from CivitAI
     */
    private async refreshWithMetadata(): Promise<void> {
        if (this.metadataManager) {
            await this.metadataManager.refreshAllMetadata();
        }
        await this.refresh();
    }

    /**
     * Refresh model metadata from HuggingFace
     */
    private async refreshHuggingFaceMetadata(): Promise<void> {
        if (this.metadataManager) {
            // For now, this would trigger a refresh of HuggingFace metadata
            // Implementation would depend on how HuggingFace metadata is stored/managed
            console.log('HuggingFace metadata refresh triggered');
        }
        await this.refresh();
    }

    /**
     * Renders a basic file item without enhanced metadata
     */
    private async renderBasicFileItem(
        fileItemEl: HTMLElement, 
        fullRelativePath: string, 
        fileName: string, 
        notesFolder?: string
    ): Promise<void> {
        const fileNameEl = fileItemEl.createSpan({ cls: 'wb-model-filename' });
        fileNameEl.textContent = fileName;
        
        // Add basic file information
        const fileInfoEl = fileItemEl.createDiv({ cls: 'wb-model-info' });
        fileInfoEl.createSpan({ 
            cls: 'wb-model-path', 
            text: `Path: ${fullRelativePath}` 
        });

        // Add note link if notes folder is configured
        if (notesFolder) {
            const noteFileName = path.basename(fullRelativePath, path.extname(fullRelativePath)) + '.md';
            const noteSubfolderPath = path.dirname(fullRelativePath);
            const fullNotePath = path.join(notesFolder, noteSubfolderPath, noteFileName).replace(/\\/g, '/');
            
            const noteLinkEl = fileItemEl.createEl('a', {
                cls: 'wb-model-note-link',
                text: '📝 Note',
                href: '#'
            });
            
            noteLinkEl.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    // Check if note exists, create if not
                    const noteExists = await this.app.vault.adapter.exists(fullNotePath);
                    if (!noteExists) {
                        await this.createModelNoteIfNeeded(fullRelativePath, '', {});
                    }
                    
                    // Open the note
                    const noteFile = this.app.vault.getAbstractFileByPath(fullNotePath);
                    if (noteFile) {
                        await this.app.workspace.openLinkText(fullNotePath, '', false);
                    }
                } catch (error) {
                    console.error('Error opening model note:', error);
                    new Notice('Error opening model note');
                }
            });
        }
    }

    /**
     * Enhances a file item with CivitAI metadata
     */
    private async enhanceFileItemWithCivitAI(
        fileItemEl: HTMLElement, 
        fullRelativePath: string, 
        fileName: string, 
        notesFolder?: string
    ): Promise<void> {
        // Start with basic rendering
        await this.renderBasicFileItem(fileItemEl, fullRelativePath, fileName, notesFolder);
        
        if (!this.metadataManager) {
            return;
        }

        try {
            // Try to get enhanced metadata
            const metadata = await this.metadataManager.enrichModelMetadata(fullRelativePath);
            
            if (metadata) {
                const enhancedInfoEl = fileItemEl.createDiv({ cls: 'wb-enhanced-info' });
                
                // Add provider icon
                const providerIconEl = enhancedInfoEl.createSpan({ cls: 'wb-provider-icon' });
                if (metadata.provider === 'civitai') {
                    setIcon(providerIconEl, CIVITAI_ICON_NAME);
                } else if (metadata.provider === 'huggingface') {
                    setIcon(providerIconEl, HUGGINGFACE_ICON_NAME);
                } else {
                    setIcon(providerIconEl, UNKNOWN_PROVIDER_ICON_NAME);
                }
                
                // Add model information based on provider
                if (metadata.civitaiModel) {
                    enhancedInfoEl.createSpan({ 
                        cls: 'wb-model-name',
                        text: metadata.civitaiModel.name 
                    });
                    
                    if (metadata.civitaiModel.stats) {
                        const statsEl = enhancedInfoEl.createDiv({ cls: 'wb-model-stats' });
                        statsEl.createSpan({ 
                            text: `👍 ${metadata.civitaiModel.stats.favoriteCount || 0}` 
                        });
                        statsEl.createSpan({ 
                            text: `📥 ${metadata.civitaiModel.stats.downloadCount || 0}` 
                        });
                    }
                } else if (metadata.huggingfaceModel) {
                    enhancedInfoEl.createSpan({ 
                        cls: 'wb-model-name',
                        text: metadata.huggingfaceModel.id 
                    });
                    
                    const statsEl = enhancedInfoEl.createDiv({ cls: 'wb-model-stats' });
                    statsEl.createSpan({ 
                        text: `👍 ${metadata.huggingfaceModel.likes || 0}` 
                    });
                    statsEl.createSpan({ 
                        text: `📥 ${metadata.huggingfaceModel.downloads || 0}` 
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to enhance file item with metadata:', error);
        }
    }
}

/**
 * Modal for searching and downloading HuggingFace models
 */
class HuggingFaceSearchModal extends Modal {
    private plugin: Workbench;
    private huggingfaceService: HuggingFaceService;
    private searchResults: HuggingFaceModel[] = [];
    private currentQuery = '';
    private isLoading = false;

    constructor(app: App, plugin: Workbench) {
        super(app);
        this.plugin = plugin;
        this.huggingfaceService = new HuggingFaceService(plugin.settings.huggingfaceApiKey);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('wb-hf-search-modal');

        // Title
        contentEl.createEl('h2', { text: 'Search HuggingFace Models' });

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
        filterSection.createEl('label', { text: 'Task Type:' });
        
        const taskSelect = filterSection.createEl('select', { cls: 'wb-task-select' });
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

        // Sort options
        filterSection.createEl('label', { text: 'Sort by:' });
        const sortSelect = filterSection.createEl('select', { cls: 'wb-sort-select' });
        const sortOptions = [
            { value: 'downloads', text: 'Downloads' },
            { value: 'likes', text: 'Likes' },
            { value: 'lastModified', text: 'Recently Updated' }
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
                // Use the simple search method to avoid API issues
                console.log('🔍 Starting HuggingFace search for:', query);
                const models = await this.huggingfaceService.searchModelsSimple(query, 20);

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
                    this.showModelFiles(model, files);
                } catch (error) {
                    console.error('Error fetching model files:', error);
                    new Notice('Error fetching model files');
                }
            });
        });
    }

    private showModelFiles(model: HuggingFaceModel, files: HuggingFaceFile[]) {
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
                new Notice(`Download URL copied to clipboard: ${file.path}`);
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