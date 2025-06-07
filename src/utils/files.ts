/**
 * File System Utilities for Workbench Plugin
 * 
 * This file contains utility functions for file system operations and model management including:
 * - Model file detection and classification by extension
 * - Recursive directory scanning for model collections
 * - File type validation and filtering
 * - Directory information gathering for note generation
 * - Cross-platform path handling and normalization
 * - Error handling for file system operations
 */

// ===========================================================================
// IMPORTS AND DEPENDENCIES
// ===========================================================================

    // Node.js Core Modules
    import * as fs from 'fs';
    import * as path from 'path';

// ===========================================================================
// MODEL FILE DETECTION UTILITIES
// ===========================================================================

/*
 * Determines if a file is a model file based on its extension.
 * 
 * Supports common AI model formats including:
 * - SafeTensors (.safetensors) - Recommended format for model storage
 * - PyTorch formats (.ckpt, .pth, .pt) - Standard PyTorch model files
 * - GGUF (.gguf) - GPT-Generated Unified Format for language models
 * - TensorFlow formats (.h5, .pb, .tflite) - TensorFlow model formats
 * - ONNX (.onnx) - Open Neural Network Exchange format
 * - Other formats (.bin, .model, .trt) - Various model container formats
 * 
 * @param filename - The filename to check for model file extensions
 * @returns True if the file is considered a model file
 */
export function isModelFile(filename: string): boolean {
    const extension = path.extname(filename).toLowerCase();
    const modelExtensions = [
        '.safetensors', '.ckpt', '.pth', '.pt', '.gguf', '.model',
        '.bin', '.h5', '.onnx', '.tflite', '.pb', '.trt'
    ];
    return modelExtensions.includes(extension);
}

// ===========================================================================
// RECURSIVE MODEL SCANNING UTILITIES
// ===========================================================================

/*
 * Recursively finds all model files within a directory and its subdirectories.
 * 
 * This function performs comprehensive directory traversal to:
 * - Locate all model files based on extension matching
 * - Gather information about related files for note generation
 * - Build directory structure information for model organization
 * - Handle file system errors gracefully with proper logging
 * - Calculate relative paths from the base models directory
 * - Skip hidden files and directories (starting with '.')
 * 
 * @param dirPath - The absolute path to the directory to search
 * @param baseModelsPath - The absolute path to the root 'models' directory for relative path calculation
 * @returns Promise resolving to object containing model files and directory information
 */
export async function findModelsRecursive(dirPath: string, baseModelsPath: string): Promise<{
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