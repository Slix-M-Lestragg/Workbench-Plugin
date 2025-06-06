
// --- Type definition for the nested tree structure ---
export type ModelTreeNode = {
    [key: string]: ModelTreeNode | string[]; // Folders map to nodes, files map to full relative paths
};

// --- Function to build the nested tree ---
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