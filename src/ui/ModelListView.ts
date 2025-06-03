import { ItemView, WorkspaceLeaf, App, setIcon, Notice, Menu, Modal } from 'obsidian';
import * as fs from 'fs'; // Import fs for reading file content
import * as path from 'path';
import type Workbench from '../main';
import { ModelMetadataManager } from '../comfy/metadataManager';
import { EnhancedModelMetadata } from '../comfy/types';

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
    renderModelTree(node: ModelTreeNode, parentEl: HTMLElement) {
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

        keys.forEach(key => {
            if (key === '_files_') {
                // Render files in the current directory
                const filePaths = (node[key] as string[]).sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
                const fileListEl = parentEl.createEl('ul', { cls: 'wb-model-file-list' });

                filePaths.forEach(fullRelativePath => {
                    const fileName = path.basename(fullRelativePath); // Extract filename for display
                    const fileItemEl = fileListEl.createEl('li', { cls: 'wb-model-file-item' });
                    
                    // Enhance with CivitAI metadata if enabled
                    if (this.metadataManager && this.plugin.settings.enableCivitaiIntegration) {
                        this.enhanceFileItemWithCivitAI(fileItemEl, fullRelativePath, fileName, notesFolder);
                    } else {
                        this.renderBasicFileItem(fileItemEl, fullRelativePath, fileName, notesFolder);
                    }
                });
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
                this.renderModelTree(subNode, detailsEl);
            }
        });
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
                        noteContent = this.generateDefaultFrontmatter(relativeModelPath, directoryInfo);
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
                    noteContent = this.generateDefaultFrontmatter(relativeModelPath, directoryInfo);
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
    generateDefaultFrontmatter(relativeModelPath: string, directoryInfo?: Record<string, string[]>): string {
        const modelFilename = path.basename(relativeModelPath);
        const modelDirectory = path.dirname(relativeModelPath);
        const modelType = this.inferModelType(relativeModelPath);
        
        // Get related files in the same directory
        const relatedFiles = directoryInfo?.[modelDirectory] || [];
        const otherFiles = relatedFiles.filter(file => file !== modelFilename && !isModelFile(file));
        
        let frontmatter = `---
# Basic model information (Workbench Generated)
model_path: "${relativeModelPath.replace(/\\/g, '/')}"
model_filename: "${modelFilename}"
model_type: "${modelType}"
tags: [workbench-model]
---

# ${modelFilename}

Notes about this model...
`;

        // Add information about related files if any exist
        if (otherFiles.length > 0) {
            frontmatter += `\n## Related Files

This model is part of a package that includes the following additional files:

`;
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
                this.plugin.settings.civitaiApiKey
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
            setIcon(refreshMetadataBtn, 'database');
            
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
                this.renderModelTree(modelTree, treeRootEl); // Start rendering the tree
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

    private renderBasicFileItem(fileItemEl: HTMLElement, fullRelativePath: string, fileName: string, notesFolder?: string): void {
        const iconEl = fileItemEl.createSpan({ cls: 'wb-model-file-icon' });

        // --- Determine icon based on file extension and inferred type ---
        const extension = path.extname(fileName).toLowerCase();
        const modelType = this.inferModelType(fullRelativePath);
        let iconName = 'document'; // Default icon

        if (['.safetensors', '.ckpt', '.model', '.pth', '.pt', '.gguf'].includes(extension)) {
            iconName = 'file-sliders'; // AI Model icon
        } else if (extension === '.json') {
            iconName = 'file-json';
        } else if (extension === '.md') {
            iconName = 'file-text';
        } else if (['.yaml', '.yml'].includes(extension)) {
            iconName = 'file-code';
        }
        setIcon(iconEl, iconName);

        // --- Create internal link to the note ---
        if (notesFolder) {
            const noteFileName = path.basename(fullRelativePath, path.extname(fullRelativePath)) + '.md';
            const noteSubfolderPath = path.dirname(fullRelativePath);
            const fullNotePath = path.join(notesFolder, noteSubfolderPath, noteFileName).replace(/\\/g, '/');
            const linkPath = fullNotePath.replace(/\.md$/, ''); // Path for openLinkText (no extension)

            const linkEl = fileItemEl.createEl('a', {
                cls: 'internal-link wb-model-file-link',
                text: fileName,
                href: '#'
            });
            linkEl.dataset.href = linkPath;

            linkEl.addEventListener('click', (ev) => {
                ev.preventDefault();
                this.app.workspace.openLinkText(linkPath, '', false);
            });
            
            // Add model type as subtitle if it's not just the generic "AI Model"
            if (modelType !== 'AI Model') {
                const typeEl = fileItemEl.createEl('span', {
                    cls: 'wb-model-type-hint',
                    text: ` (${modelType})`
                });
                typeEl.style.fontSize = '0.8em';
                typeEl.style.opacity = '0.7';
                typeEl.style.fontStyle = 'italic';
            }
        } else {
            fileItemEl.createSpan({ text: fileName });
            
            // Add model type as subtitle if it's not just the generic "AI Model"
            if (modelType !== 'AI Model') {
                const typeEl = fileItemEl.createEl('span', {
                    cls: 'wb-model-type-hint',
                    text: ` (${modelType})`
                });
                typeEl.style.fontSize = '0.8em';
                typeEl.style.opacity = '0.7';
                typeEl.style.fontStyle = 'italic';
            }
        }
    }

    private async enhanceFileItemWithCivitAI(fileItemEl: HTMLElement, fullRelativePath: string, fileName: string, notesFolder?: string): Promise<void> {
        if (!this.metadataManager) return this.renderBasicFileItem(fileItemEl, fullRelativePath, fileName, notesFolder);

        try {
            const deviceSettings = this.plugin.getCurrentDeviceSettings();
            const comfyPath = deviceSettings.comfyUiPath?.trim();
            if (!comfyPath) return this.renderBasicFileItem(fileItemEl, fullRelativePath, fileName, notesFolder);

            const fullModelPath = path.join(comfyPath, 'models', fullRelativePath);
            
            // Start with basic rendering
            this.renderBasicFileItem(fileItemEl, fullRelativePath, fileName, notesFolder);

            // Enhance with CivitAI data asynchronously
            const metadata = await this.metadataManager.enrichModelMetadata(fullModelPath);
            
            // Add verification badge
            if (metadata.isVerified && this.plugin.settings.showCivitaiRatings) {
                const verifiedBadge = fileItemEl.createEl('span', {
                    cls: 'wb-verified-badge',
                    text: '✓'
                });
                verifiedBadge.title = 'Verified on CivitAI';
            }

            // Add model type badge
            if (metadata.civitaiModel) {
                fileItemEl.createEl('span', {
                    cls: `wb-model-type-${metadata.civitaiModel.type.toLowerCase()}`,
                    text: metadata.civitaiModel.type
                });
            }

            // Add rating if available
            if (metadata.civitaiModel?.stats.rating && this.plugin.settings.showCivitaiRatings) {
                fileItemEl.createEl('span', {
                    cls: 'wb-model-rating',
                    text: `★${metadata.civitaiModel.stats.rating.toFixed(1)}`
                });
            }

            // Enhanced context menu
            fileItemEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showEnhancedContextMenu(e, fullModelPath, metadata);
            });

            // Add tooltip with model info
            fileItemEl.title = this.generateModelTooltip(metadata);

        } catch (error) {
            console.error('Failed to enhance file item with CivitAI data:', error);
        }
    }

    private showEnhancedContextMenu(event: MouseEvent, filePath: string, metadata: EnhancedModelMetadata): void {
        const menu = new Menu();

        // Basic actions
        menu.addItem((item) => {
            item.setTitle("Copy Path")
                .setIcon("copy")
                .onClick(() => navigator.clipboard.writeText(metadata.localPath));
        });

        if (metadata.civitaiModel) {
            menu.addSeparator();

            menu.addItem((item) => {
                item.setTitle("View on CivitAI")
                    .setIcon("external-link")
                    .onClick(() => {
                        if (metadata.civitaiModel?.id) {
                            window.open(`https://civitai.com/models/${metadata.civitaiModel.id}`, '_blank');
                        }
                    });
            });

            menu.addItem((item) => {
                item.setTitle("Show Model Details")
                    .setIcon("info")
                    .onClick(() => {
                        this.showModelDetailsModal(metadata);
                    });
            });

            if (this.plugin.settings.showCompatibleModels) {
                menu.addItem((item) => {
                    item.setTitle("Find Compatible Models")
                        .setIcon("git-branch")
                        .onClick(async () => {
                            await this.showCompatibleModels(filePath);
                        });
                });
            }

            if (metadata.civitaiVersion?.trainedWords && metadata.civitaiVersion.trainedWords.length > 0) {
                menu.addItem((item) => {
                    item.setTitle("Copy Trigger Words")
                        .setIcon("copy")
                        .onClick(() => {
                            if (metadata.civitaiVersion?.trainedWords) {
                                navigator.clipboard.writeText(metadata.civitaiVersion.trainedWords.join(', '));
                                new Notice('Trigger words copied to clipboard');
                            }
                        });
                });
            }
        }

        menu.addItem((item) => {
            item.setTitle("Refresh Metadata")
                .setIcon("refresh-cw")
                .onClick(async () => {
                    if (this.metadataManager) {
                        await this.metadataManager.refreshMetadata(filePath);
                        this.refresh();
                    }
                });
        });

        menu.showAtMouseEvent(event);
    }

    private generateModelTooltip(metadata: EnhancedModelMetadata): string {
        let tooltip = `File: ${metadata.filename}`;
        
        if (metadata.civitaiModel) {
            tooltip += `\nModel: ${metadata.civitaiModel.name}`;
            tooltip += `\nType: ${metadata.civitaiModel.type}`;
            tooltip += `\nBase Model: ${metadata.relationships.baseModel}`;
            tooltip += `\nRating: ${metadata.civitaiModel.stats.rating?.toFixed(1) || 'N/A'}`;
            tooltip += `\nDownloads: ${metadata.civitaiModel.stats.downloadCount.toLocaleString()}`;
            
            if (metadata.civitaiVersion?.trainedWords && metadata.civitaiVersion.trainedWords.length > 0) {
                tooltip += `\nTrigger Words: ${metadata.civitaiVersion.trainedWords.join(', ')}`;
            }
        }

        return tooltip;
    }

    private async showCompatibleModels(filePath: string): Promise<void> {
        if (!this.metadataManager) return;

        const relationships = await this.metadataManager.getModelRelationships(filePath);
        
        const modal = new Modal(this.app);
        modal.titleEl.setText('Compatible Models');
        
        const container = modal.contentEl.createDiv({ cls: 'wb-compatible-models' });
        
        if (relationships.length === 0) {
            container.createEl('p', { text: 'No compatible local models found.' });
        } else {
            relationships.forEach(related => {
                const item = container.createDiv({ cls: 'wb-compatible-item' });
                item.createEl('strong', { text: related.civitaiModel?.name || related.filename });
                item.createEl('span', { text: ` (${related.civitaiModel?.type || 'Unknown'})` });
                
                if (related.civitaiModel?.stats.rating) {
                    item.createEl('span', { 
                        cls: 'wb-rating',
                        text: ` ★${related.civitaiModel.stats.rating.toFixed(1)}` 
                    });
                }
                
                item.addEventListener('click', () => {
                    modal.close();
                });
            });
        }
        
        modal.open();
    }

    private showModelDetailsModal(metadata: EnhancedModelMetadata): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText(metadata.civitaiModel?.name || metadata.filename);
        
        const container = modal.contentEl.createDiv({ cls: 'wb-model-details' });
        
        if (metadata.civitaiModel) {
            // Model header
            const header = container.createDiv({ cls: 'wb-model-header' });
            header.createEl('h3', { text: metadata.civitaiModel.name });
            header.createEl('span', { 
                cls: 'wb-model-type',
                text: metadata.civitaiModel.type 
            });
            
            // Stats
            const stats = container.createDiv({ cls: 'wb-model-stats' });
            stats.createEl('span', { text: `★ ${metadata.civitaiModel.stats.rating?.toFixed(1) || 'N/A'}` });
            stats.createEl('span', { text: `↓ ${metadata.civitaiModel.stats.downloadCount.toLocaleString()}` });
            stats.createEl('span', { text: `♥ ${metadata.civitaiModel.stats.favoriteCount.toLocaleString()}` });
            
            // Description
            if (metadata.civitaiModel.description) {
                container.createEl('p', { text: metadata.civitaiModel.description });
            }
            
            // Version info
            if (metadata.civitaiVersion) {
                const versionInfo = container.createDiv({ cls: 'wb-version-info' });
                versionInfo.createEl('h4', { text: 'Version Information' });
                versionInfo.createEl('p', { text: `Version: ${metadata.civitaiVersion.name}` });
                versionInfo.createEl('p', { text: `Base Model: ${metadata.civitaiVersion.baseModel}` });
                
                if (metadata.civitaiVersion.trainedWords?.length > 0) {
                    versionInfo.createEl('p', { text: `Trigger Words: ${metadata.civitaiVersion.trainedWords.join(', ')}` });
                }
            }
            
            // Tags
            if (metadata.civitaiModel.tags?.length > 0) {
                const tagsDiv = container.createDiv({ cls: 'wb-model-tags' });
                tagsDiv.createEl('h4', { text: 'Tags' });
                const tagsList = tagsDiv.createEl('div', { cls: 'wb-tags-list' });
                metadata.civitaiModel.tags.forEach(tag => {
                    tagsList.createEl('span', { cls: 'wb-tag', text: tag });
                });
            }
        }
        
        modal.open();
    }

    public refresh(): void {
        this.onOpen();
    }

    public async refreshWithMetadata(): Promise<void> {
        if (this.metadataManager && this.plugin.settings.enableCivitaiIntegration) {
            await this.metadataManager.refreshAllMetadata();
        }
        this.onOpen();
    }

    public updateCivitAISettings(): void {
        // Reinitialize metadata manager when settings change
        if (this.plugin.settings.enableCivitaiIntegration) {
            this.metadataManager = new ModelMetadataManager(
                this.app.vault,
                this.plugin.settings.civitaiApiKey
            );
        } else {
            this.metadataManager = null;
        }
    }
}