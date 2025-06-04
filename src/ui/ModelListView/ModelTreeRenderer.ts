import { setIcon } from 'obsidian';
import * as path from 'path';
import type Workbench from '../../main';
import { ModelMetadataManager } from '../../comfy/metadataManager';
import { CIVITAI_ICON_NAME, HUGGINGFACE_ICON_NAME, UNKNOWN_PROVIDER_ICON_NAME } from '../icons';
import { ModelNoteManager } from './ModelNoteManager';

// --- Type definition for the nested tree structure ---
export type ModelTreeNode = {
    [key: string]: ModelTreeNode | string[]; // Folders map to nodes, files map to full relative paths
};

/**
 * Handles the rendering of the model tree structure in the ModelListView
 */
export class ModelTreeRenderer {
    private plugin: Workbench;
    private metadataManager: ModelMetadataManager | null = null;
    private noteManager: ModelNoteManager;

    constructor(plugin: Workbench, metadataManager: ModelMetadataManager | null = null) {
        this.plugin = plugin;
        this.metadataManager = metadataManager;
        this.noteManager = new ModelNoteManager(plugin, metadataManager);
    }

    /**
     * Recursive function to render the tree
     */
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
                    const noteExists = await this.plugin.app.vault.adapter.exists(fullNotePath);
                    if (!noteExists) {
                        await this.noteManager.createModelNoteIfNeeded(fullRelativePath, '', {});
                    }
                    
                    // Open the note
                    const noteFile = this.plugin.app.vault.getAbstractFileByPath(fullNotePath);
                    if (noteFile) {
                        await this.plugin.app.workspace.openLinkText(fullNotePath, '', false);
                    }
                } catch (error) {
                    console.error('Error opening model note:', error);
                    // Assuming Notice is available in the context where this is used
                    // new Notice('Error opening model note');
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
                            text: `⭐ ${metadata.civitaiModel.stats.rating?.toFixed(1) || 'N/A'}` 
                        });
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