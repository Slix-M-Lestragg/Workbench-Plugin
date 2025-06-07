import { setIcon } from 'obsidian';
import * as path from 'path';
import type Workbench from './../../../main';
import { ModelMetadataManager } from '../../../services/models/ModelMetadataManager';
import { EnhancedModelMetadata } from '../../../types/comfy';
import { CIVITAI_ICON_NAME, HUGGINGFACE_ICON_NAME } from '../../utilities/icons';
import { ModelNoteManager } from './ModelNoteManager';
import { ModelTreeNode } from '../../../types/models';

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
    async renderModelTree(node: ModelTreeNode, parentEl: HTMLElement, isRefresh = false): Promise<void> {
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

                    // Check if note already exists (to optimize API calls)
                    const noteAlreadyExists = await this.noteExists(fullRelativePath, notesFolder);
                    const shouldSkipApiSearch = !isRefresh && noteAlreadyExists;

                    if (shouldSkipApiSearch) {
                        console.log(`⏭️ Skipping API search for ${fileName} - note already exists (use refresh to force update)`);
                    }

                    // --- API Search: HuggingFace first, then CivitAI ---
                    // Only perform API search if note doesn't exist OR this is a refresh operation
                    console.log(`🔍 Starting API search for model: ${fileName} (refresh: ${isRefresh}, noteExists: ${noteAlreadyExists})`);
                    console.log(`📁 Full path: ${fullRelativePath}`);
                    
                    let foundMetadata: EnhancedModelMetadata | null = null;
                    let found = false;
                    
                    // Try HuggingFace API search first (only if we should search)
                    if (!shouldSkipApiSearch && this.metadataManager) {
                        console.log(`🤗 Attempting HuggingFace search for: ${fileName}`);
                        const startTime = Date.now();
                        const result = await this.searchForMetadata(fullRelativePath, 'huggingface');
                        const duration = Date.now() - startTime;
                        if (result) {
                            foundMetadata = result;
                            found = true;
                            console.log(`🤗 HuggingFace search completed in ${duration}ms. Found: ${found}`);
                        } else {
                            console.log(`🤗 HuggingFace search completed in ${duration}ms. Found: ${found}`);
                        }
                    }
                    
                    // If no HuggingFace match found, try CivitAI API search (only if we should search)
                    if (!found && !shouldSkipApiSearch && this.metadataManager && this.plugin.configManager.getSettings().enableCivitaiIntegration) {
                        console.log(`🎨 Attempting CivitAI search for: ${fileName}`);
                        const startTime = Date.now();
                        const result = await this.searchForMetadata(fullRelativePath, 'civitai');
                        const duration = Date.now() - startTime;
                        if (result) {
                            foundMetadata = result;
                            found = true;
                            console.log(`🎨 CivitAI search completed in ${duration}ms. Found: ${found}`);
                        } else {
                            console.log(`🎨 CivitAI search completed in ${duration}ms. Found: ${found}`);
                        }
                    }
                    
                    // Automatically create note if metadata was found and note doesn't exist
                    if (found && foundMetadata && notesFolder) {
                        const noteAlreadyExistsAfterSearch = await this.noteExists(fullRelativePath, notesFolder);
                        if (!noteAlreadyExistsAfterSearch) {
                            try {
                                console.log(`🚀 Auto-creating note for ${fileName} with metadata from ${foundMetadata.provider}`);
                                await this.noteManager.createModelNoteWithMetadata(fullRelativePath, '', {}, foundMetadata);
                                console.log(`✅ Successfully auto-created note for ${fileName}`);
                            } catch (error) {
                                console.error(`❌ Failed to auto-create note for ${fileName}:`, error);
                            }
                        } else {
                            console.log(`ℹ️ Note already exists for ${fileName}, skipping auto-creation`);
                        }
                    }
                    
                    // Now render the file item with whatever metadata we found (or null)
                    await this.renderFileItemWithMetadata(fileItemEl, fullRelativePath, fileName, notesFolder, foundMetadata);
                    
                    if (shouldSkipApiSearch) {
                        console.log(`⏭️ Skipped API search for: ${fileName} (note exists, not a refresh)`);
                    } else if (!found) {
                        console.log(`❌ No metadata found for: ${fileName}`);
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
                await this.renderModelTree(subNode, detailsEl, isRefresh);
            }
        }
    }

    /**
     * Renders a file item with the provided metadata (or without if null)
     */
    private async renderFileItemWithMetadata(
        fileItemEl: HTMLElement, 
        fullRelativePath: string, 
        fileName: string, 
        notesFolder?: string,
        metadata?: EnhancedModelMetadata | null
    ): Promise<void> {
        // Create a flex container for the model row
        fileItemEl.classList.add('wb-model-row');
        
        // Left side: Provider icon + Model name as clickable link
        const leftSide = fileItemEl.createDiv({ cls: 'wb-model-left' });
        
        // Get provider from note frontmatter first, fallback to metadata
        let provider: string | null = null;
        if (notesFolder) {
            provider = await this.noteManager.getModelProviderFromNote(fullRelativePath, notesFolder);
        }
        
        // Fallback to metadata provider if no note provider found
        if (!provider && metadata) {
            provider = metadata.provider;
        }
        
        // Add provider icon before the filename (inline)
        if (provider && provider !== 'unknown') {
            // Get source URL from note frontmatter using the dedicated method
            let sourceUrl = '#';
            if (notesFolder) {
                sourceUrl = await this.noteManager.getModelSourceFromNote(fullRelativePath, notesFolder) || '#';
            }
            
            // Fallback to metadata source if no frontmatter source
            if (sourceUrl === '#' && metadata) {
                if (provider === 'civitai' && metadata.civitaiModel?.id) {
                    sourceUrl = `https://civitai.com/models/${metadata.civitaiModel.id}`;
                } else if (provider === 'huggingface' && metadata.huggingfaceModel?.id) {
                    sourceUrl = `https://huggingface.co/${metadata.huggingfaceModel.id}`;
                }
            }
            
            const iconLink = leftSide.createEl('a', {
                cls: 'wb-provider-icon-left',
                href: sourceUrl,
                title: sourceUrl === '#' ? `${provider} model` : `Open ${provider} model page`
            });
            iconLink.style.display = 'inline-block';
            iconLink.style.marginRight = '8px';
            iconLink.style.verticalAlign = 'middle';
            iconLink.style.textDecoration = 'none';
            
            if (sourceUrl !== '#') {
                iconLink.setAttribute('target', '_blank');
            } else {
                iconLink.style.cursor = 'default';
                iconLink.addEventListener('click', (e) => e.preventDefault());
            }
            
            const iconEl = iconLink.createSpan();
            if (provider === 'civitai') {
                setIcon(iconEl, CIVITAI_ICON_NAME);
            } else if (provider === 'huggingface') {
                setIcon(iconEl, HUGGINGFACE_ICON_NAME);
            }
        }
        
        const fileNameEl = leftSide.createEl('a', { 
            cls: 'wb-model-filename-link',
            text: metadata?.civitaiModel?.name || metadata?.huggingfaceModel?.id || fileName,
            href: '#'
        });
        fileNameEl.style.display = 'inline-block';
        fileNameEl.style.verticalAlign = 'middle';
        
        // Make the filename clickable to open the file or note
        fileNameEl.addEventListener('click', async (e) => {
            e.preventDefault();
            if (notesFolder) {
                // Open existing note or create if it doesn't exist (fallback for edge cases)
                const noteFileName = path.basename(fullRelativePath, path.extname(fullRelativePath)) + '.md';
                const noteSubfolderPath = path.dirname(fullRelativePath);
                const fullNotePath = path.join(notesFolder, noteSubfolderPath, noteFileName).replace(/\\/g, '/');
                
                try {
                    const noteExists = await this.plugin.app.vault.adapter.exists(fullNotePath);
                    if (!noteExists) {
                        // Fallback: create note without metadata if it somehow doesn't exist
                        console.log(`📝 Fallback: Creating note for ${fileName} (note should have been auto-created)`);
                        await this.noteManager.createModelNoteWithMetadata(fullRelativePath, '', {}, metadata || null);
                    }
                    
                    const noteFile = this.plugin.app.vault.getAbstractFileByPath(fullNotePath);
                    if (noteFile) {
                        await this.plugin.app.workspace.openLinkText(fullNotePath, '', false);
                    }
                } catch (error) {
                    console.error('Error opening model note:', error);
                }
            }
        });

        // Right side: Stats (downloads/likes)
        const rightSide = fileItemEl.createDiv({ cls: 'wb-model-right' });
        
        // Show stats based on provider
        if (provider === 'civitai' && metadata?.civitaiModel?.stats) {
            const statsContainer = rightSide.createDiv({ cls: 'wb-model-stats' });
            
            // Download count
            if (metadata.civitaiModel.stats.downloadCount) {
                statsContainer.createSpan({ 
                    cls: 'wb-stat-item',
                    text: `📥 ${metadata.civitaiModel.stats.downloadCount.toLocaleString()}`
                });
            }
            
            // Favorite count
            if (metadata.civitaiModel.stats.favoriteCount) {
                statsContainer.createSpan({ 
                    cls: 'wb-stat-item',
                    text: `👍 ${metadata.civitaiModel.stats.favoriteCount.toLocaleString()}`
                });
            }
            
            // Rating
            if (metadata.civitaiModel.stats.rating) {
                statsContainer.createSpan({ 
                    cls: 'wb-stat-item',
                    text: `⭐ ${metadata.civitaiModel.stats.rating.toFixed(1)}`
                });
            }
        } else if (provider === 'huggingface' && metadata?.huggingfaceModel) {
            const statsContainer = rightSide.createDiv({ cls: 'wb-model-stats' });
            
            // Download count
            if (metadata.huggingfaceModel.downloads) {
                statsContainer.createSpan({ 
                    cls: 'wb-stat-item',
                    text: `📥 ${metadata.huggingfaceModel.downloads.toLocaleString()}`
                });
            }
            
            // Likes count
            if (metadata.huggingfaceModel.likes) {
                statsContainer.createSpan({ 
                    cls: 'wb-stat-item',
                    text: `👍 ${metadata.huggingfaceModel.likes.toLocaleString()}`
                });
            }
        }
    }

    /**
     * Searches for metadata without rendering UI elements
     * Returns the metadata if found, null otherwise
     */
    private async searchForMetadata(
        fullRelativePath: string, 
        provider: 'huggingface' | 'civitai'
    ): Promise<EnhancedModelMetadata | null> {
        if (!this.metadataManager) return null;
        
        try {
            // Force a fresh metadata search by passing forceRefresh = true
            const metadata = await this.metadataManager.enrichModelMetadata(fullRelativePath, true);
            
            if (metadata && metadata.provider === provider) {
                if (provider === 'huggingface' && metadata.huggingfaceModel) {
                    return metadata;
                } else if (provider === 'civitai' && metadata.civitaiModel) {
                    return metadata;
                }
            }
        } catch (error) {
            console.warn(`Failed to search for ${provider} metadata:`, error);
        }
        
        return null;
    }

    /**
     * Checks if a note already exists for the given model path
     */
    private async noteExists(fullRelativePath: string, notesFolder?: string): Promise<boolean> {
        if (!notesFolder) return false;
        
        try {
            const noteFileName = path.basename(fullRelativePath, path.extname(fullRelativePath)) + '.md';
            const noteSubfolderPath = path.dirname(fullRelativePath);
            const fullNotePath = path.join(notesFolder, noteSubfolderPath, noteFileName).replace(/\\/g, '/');
            
            return await this.plugin.app.vault.adapter.exists(fullNotePath);
        } catch (error) {
            console.warn('Error checking if note exists:', error);
            return false;
        }
    }
}