import * as fs from 'fs';
import * as path from 'path';

/**
 * Determines if a file is a model file based on its extension.
 * @param filename The filename to check.
 * @returns True if the file is considered a model file.
 */
export function isModelFile(filename: string): boolean {
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