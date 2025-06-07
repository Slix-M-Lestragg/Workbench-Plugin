
/**
 * Model Tree Structure Type Definitions for Workbench Plugin
 * 
 * This file contains type definitions and utilities for building hierarchical model trees including:
 * - Nested tree node structures for organizing model collections
 * - File path organization and directory management
 * - Tree building algorithms for model browser visualization
 * - Conflict resolution for mixed file/directory structures
 */

// ===========================================================================
// MODEL TREE TYPE DEFINITIONS
// ===========================================================================

/*
 * Type definition for the nested tree structure used in model organization.
 * 
 * The tree structure supports:
 * - Folders: Map to nested ModelTreeNode objects for hierarchical organization
 * - Files: Map to string arrays containing full relative paths for file identification
 * - Special '_files_' key: Reserved for storing file paths at each directory level
 */
export type ModelTreeNode = {
    [key: string]: ModelTreeNode | string[]; // Folders map to nodes, files map to full relative paths
};

// ===========================================================================
// TREE BUILDING UTILITIES
// ===========================================================================

/*
 * Function to build the nested tree structure from an array of file paths.
 * 
 * This function processes file paths and creates a hierarchical tree structure where:
 * - Directory paths become nested objects for organizational purposes
 * - File paths are stored in '_files_' arrays at their respective directory levels
 * - Path separators are normalized for cross-platform compatibility
 * - Conflicts between files and folders with same names are handled gracefully
 * 
 * @param filePaths - Array of file paths to organize into tree structure
 * @returns ModelTreeNode representing the hierarchical organization
 */
export function buildModelTree(filePaths: string[]): ModelTreeNode {
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