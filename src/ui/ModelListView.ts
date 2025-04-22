import { ItemView, WorkspaceLeaf, App, setIcon } from 'obsidian';
import * as fs from 'fs';
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
    [key: string]: ModelTreeNode | string[]; // Folders map to nodes, files map to string arrays
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
                // It's a file, add it to the 'files' array of the current node
                if (!currentNode['_files_']) {
                    currentNode['_files_'] = [];
                }
                (currentNode['_files_'] as string[]).push(part);
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
                const files = (node[key] as string[]).sort((a, b) => a.localeCompare(b));
                const fileListEl = parentEl.createEl('ul', { cls: 'wb-model-file-list' });
                files.forEach(fileName => {
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
                    fileItemEl.createSpan({ text: fileName });
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

        if (!comfyPath) {
            container.createEl("p", { text: "ComfyUI base directory path is not set in settings for the current OS." });
            return;
        }

        const modelsPath = path.join(comfyPath, 'models');
        const loadingEl = container.createEl("p", { text: `Scanning models directory: ${modelsPath}...` });

        try {
            // Use the recursive function to find all model files
            const modelFiles = await findModelsRecursive(modelsPath, modelsPath);
            loadingEl.remove(); // Remove loading message
            // console.log(`Model files found in ${modelsPath} and subdirectories:`, modelFiles); // Keep for debugging if needed

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