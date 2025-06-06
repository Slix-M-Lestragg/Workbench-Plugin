import { createHash } from 'crypto';
import { readFileSync, statSync, openSync, readSync, closeSync, fstatSync } from 'fs';

/**
 * HashService - Centralized file hashing service
 * Provides methods for calculating various hash types for model files
 */
export class HashService {
    private static readonly LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB
    private static readonly SAMPLE_CHUNK_SIZE = 8192; // 8KB chunks for sampling

    /**
     * Calculate SHA256 hash for a file
     * Uses sampling for large files (>100MB) to improve performance
     */
    static async calculateSHA256(filePath: string): Promise<string> {
        try {
            const stats = statSync(filePath);
            const fileSize = stats.size;
            
            if (fileSize > this.LARGE_FILE_THRESHOLD) {
                console.log(`📋 HashService: Large file detected (${Math.round(fileSize / 1024 / 1024)}MB), using sample hash for: ${filePath}`);
                return this.calculateSampleHash(filePath, 'sha256');
            } else {
                return this.calculateFullHash(filePath, 'sha256');
            }
        } catch (error) {
            console.error(`📋 HashService: Failed to calculate SHA256 hash for ${filePath}:`, error);
            return '';
        }
    }

    /**
     * Calculate MD5 hash for a file
     * Uses sampling for large files (>100MB) to improve performance
     */
    static async calculateMD5(filePath: string): Promise<string> {
        try {
            const stats = statSync(filePath);
            const fileSize = stats.size;
            
            if (fileSize > this.LARGE_FILE_THRESHOLD) {
                console.log(`📋 HashService: Large file detected (${Math.round(fileSize / 1024 / 1024)}MB), using sample hash for: ${filePath}`);
                return this.calculateSampleHash(filePath, 'md5');
            } else {
                return this.calculateFullHash(filePath, 'md5');
            }
        } catch (error) {
            console.error(`📋 HashService: Failed to calculate MD5 hash for ${filePath}:`, error);
            return '';
        }
    }

    /**
     * Calculate AutoV2 hash (used by Automatic1111)
     * Currently implements the same as SHA256, but can be extended for specific AutoV2 algorithm
     */
    static async calculateAutoV2Hash(filePath: string): Promise<string> {
        // AutoV2 hash is typically used by Automatic1111
        // For now, using SHA256 - can be enhanced with specific AutoV2 algorithm if needed
        return this.calculateSHA256(filePath);
    }

    /**
     * Calculate hash using the full file content
     * Suitable for smaller files
     */
    private static calculateFullHash(filePath: string, algorithm: 'sha256' | 'md5'): string {
        const fileBuffer = readFileSync(filePath);
        const hash = createHash(algorithm);
        hash.update(fileBuffer);
        return hash.digest('hex').toUpperCase();
    }

    /**
     * Calculate hash using file sampling (first and last chunks)
     * Suitable for large files to improve performance
     */
    private static calculateSampleHash(filePath: string, algorithm: 'sha256' | 'md5'): string {
        const fd = openSync(filePath, 'r');
        const stats = fstatSync(fd);
        const fileSize = stats.size;
        
        const hash = createHash(algorithm);
        
        try {
            // Read first chunk
            const firstChunk = Buffer.alloc(this.SAMPLE_CHUNK_SIZE);
            readSync(fd, firstChunk, 0, this.SAMPLE_CHUNK_SIZE, 0);
            hash.update(firstChunk);
            
            // Read last chunk if file is large enough
            if (fileSize > this.SAMPLE_CHUNK_SIZE * 2) {
                const lastChunk = Buffer.alloc(this.SAMPLE_CHUNK_SIZE);
                readSync(fd, lastChunk, 0, this.SAMPLE_CHUNK_SIZE, fileSize - this.SAMPLE_CHUNK_SIZE);
                hash.update(lastChunk);
            }
            
            return hash.digest('hex').toUpperCase();
        } finally {
            closeSync(fd);
        }
    }

    /**
     * Calculate multiple hash types for a file
     * Returns an object with different hash types
     */
    static async calculateMultipleHashes(filePath: string, hashTypes: ('sha256' | 'md5' | 'autov2')[] = ['sha256']): Promise<Record<string, string>> {
        const results: Record<string, string> = {};
        
        for (const hashType of hashTypes) {
            switch (hashType) {
                case 'sha256':
                    results.sha256 = await this.calculateSHA256(filePath);
                    break;
                case 'md5':
                    results.md5 = await this.calculateMD5(filePath);
                    break;
                case 'autov2':
                    results.autov2 = await this.calculateAutoV2Hash(filePath);
                    break;
            }
        }
        
        return results;
    }

    /**
     * Verify if a file matches a given hash
     */
    static async verifyHash(filePath: string, expectedHash: string, algorithm: 'sha256' | 'md5' | 'autov2' = 'sha256'): Promise<boolean> {
        try {
            let calculatedHash: string;
            
            switch (algorithm) {
                case 'sha256':
                    calculatedHash = await this.calculateSHA256(filePath);
                    break;
                case 'md5':
                    calculatedHash = await this.calculateMD5(filePath);
                    break;
                case 'autov2':
                    calculatedHash = await this.calculateAutoV2Hash(filePath);
                    break;
                default:
                    throw new Error(`Unsupported hash algorithm: ${algorithm}`);
            }
            
            return calculatedHash.toLowerCase() === expectedHash.toLowerCase();
        } catch (error) {
            console.error(`📋 HashService: Failed to verify hash for ${filePath}:`, error);
            return false;
        }
    }

    /**
     * Get file size information to help determine hash strategy
     */
    static getFileSizeInfo(filePath: string): { size: number; isLarge: boolean; sizeFormatted: string } {
        try {
            const stats = statSync(filePath);
            const size = stats.size;
            const isLarge = size > this.LARGE_FILE_THRESHOLD;
            const sizeFormatted = this.formatFileSize(size);
            
            return { size, isLarge, sizeFormatted };
        } catch (error) {
            console.error(`📋 HashService: Failed to get file size for ${filePath}:`, error);
            return { size: 0, isLarge: false, sizeFormatted: '0 B' };
        }
    }

    /**
     * Format file size in human-readable format
     */
    private static formatFileSize(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
    }
}
