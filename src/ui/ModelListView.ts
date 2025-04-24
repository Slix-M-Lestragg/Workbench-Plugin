import { ItemView, WorkspaceLeaf, App, setIcon, TFolder, Notice } from 'obsidian'; // <-- Import TFolder and Notice
import * as fs from 'fs'; // Import fs for reading file content
import * as path from 'path';
import type Workbench from '../main';

export const MODEL_LIST_VIEW_TYPE = "comfyui-model-list-view";
export const MODEL_LIST_ICON = "notebook-tabs"; // Obsidian icon name

/**
 * Recursively finds all files within a directory and its subdirectories.
 * @param dirPath The absolute path to the directory to search.
 * @param baseModelsPath The absolute path to the root 'models' directory, used for calculating relative paths.
 * @returns A promise that resolves to an array of relative file paths.
 */
async function findModelsRecursive(dirPath: string, baseModelsPath: string): Promise<string[]> {
    let files: string[] = [];
    try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                // Recursively search subdirectories
                const subFiles = await findModelsRecursive(fullPath, baseModelsPath);
                files = files.concat(subFiles);
            } else if (entry.isFile() && !entry.name.startsWith('.')) {
                // Calculate path relative to the base 'models' directory
                const relativePath = path.relative(baseModelsPath, fullPath);
                files.push(relativePath);
            }
        }
    } catch (error: any) {
        // Log errors but continue if possible (e.g., permission denied for a subfolder)
        console.error(`Error reading directory ${dirPath}:`, error);
        // Optionally, re-throw specific critical errors if needed
        if (error.code === 'ENOENT' && dirPath === baseModelsPath) {
             throw error; // Re-throw if the base models directory doesn't exist
        }
    }
    return files;
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
                    const iconEl = fileItemEl.createSpan({ cls: 'wb-model-file-icon' });

                    // --- Determine icon based on file extension ---
                    const extension = path.extname(fileName).toLowerCase();
                    let iconName = 'document'; // Default icon

                    if (['.safetensors', '.ckpt', '.model', '.pth', '.pt', '.gguf'].includes(extension)) {
                        iconName = 'file-sliders'; // AI Model icon
                    } else if (extension === '.json') {
                        iconName = 'file-json';
                    } else if (extension === '.md') {
                        iconName = 'file-text'; // Changed from file-type as it might not exist
                    } else if (['.yaml', '.yml'].includes(extension)) {
                        iconName = 'file-code';
                    }
                    // --- End icon determination ---
                    setIcon(iconEl, iconName); // Use the determined icon

                    // --- Create internal link to the note ---
                    if (notesFolder) {
                        const noteFileName = path.basename(fullRelativePath, path.extname(fullRelativePath)) + '.md';
                        const noteSubfolderPath = path.dirname(fullRelativePath);
                        const fullNotePath = path.join(notesFolder, noteSubfolderPath, noteFileName).replace(/\\/g, '/');
                        const linkPath = fullNotePath.replace(/\.md$/, ''); // Path for openLinkText (no extension)

                        const linkEl = fileItemEl.createEl('a', {
                            cls: 'internal-link wb-model-file-link', // Add internal-link class
                            text: fileName,
                            href: '#' // Prevent default navigation
                        });
                        linkEl.dataset.href = linkPath; // Store the path for Obsidian

                        // Add click handler to open the note
                        linkEl.addEventListener('click', (ev) => {
                            ev.preventDefault(); // Prevent default anchor behavior
                            this.app.workspace.openLinkText(linkPath, '', false); // Open the note
                        });
                    } else {
                        // If notes folder isn't set, just display the text
                        fileItemEl.createSpan({ text: fileName });
                    }
                    // --- End internal link creation ---
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
     */
    async createModelNoteIfNeeded(relativeModelPath: string, modelsBasePath: string): Promise<void> { // Added modelsBasePath
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
                        noteContent = this.generateDefaultFrontmatter(relativeModelPath);
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
                    noteContent = this.generateDefaultFrontmatter(relativeModelPath);
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
     * @returns A string containing the default note content with frontmatter.
     */
    generateDefaultFrontmatter(relativeModelPath: string): string {
        const modelFilename = path.basename(relativeModelPath);
        const modelType = 'unknown'; // Placeholder
        return `---
# Basic model information (Workbench Generated)
model_path: "${relativeModelPath.replace(/\\/g, '/')}"
model_filename: "${modelFilename}"
model_type: "${modelType}"
tags: [workbench-model]
---

# ${modelFilename}

Notes about this model...
`;
    }

    async onOpen() {
        const container = this.contentEl;
        container.empty();
        container.addClass('wb-model-list-view'); // Add a class for potential styling
        container.createEl("h4", { text: "ComfyUI Models" });

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
            const modelFiles = await findModelsRecursive(modelsPath, modelsPath);
            loadingEl.setText(`Found ${modelFiles.length} model files. Processing...`); // Update loading text

            // --- Create Markdown notes for each model file (if setting is enabled) ---
            if (modelNotesFolderPath && modelFiles.length > 0) {
                new Notice(`Creating/checking notes for ${modelFiles.length} models...`, 3000);
                const noteCreationPromises = modelFiles.map(relativeModelPath =>
                    // Pass modelsPath to the function
                    this.createModelNoteIfNeeded(relativeModelPath, modelsPath)
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
        } catch (error: any) {
            loadingEl.remove(); // Remove loading message
            console.error(`Error scanning models directory (${modelsPath}):`, error);
            if (error.code === 'ENOENT') {
                container.createEl("p", { cls: 'wb-error-text', text: `Error: Base models directory not found at '${modelsPath}'. Please check your ComfyUI path settings.` });
            } else {
                container.createEl("p", { cls: 'wb-error-text', text: `Error scanning models directory: ${error.message}` });
            }
        }
    }

    async onClose() {
        // Clean up view content
        this.contentEl.empty();
    }
}