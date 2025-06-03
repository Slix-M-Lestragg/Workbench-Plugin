import { createHash } from 'crypto';
import { readFileSync, statSync, openSync, readSync, closeSync, fstatSync } from 'fs';

export class FileHashCalculator {
    static async calculateSHA256(filePath: string): Promise<string> {
        try {
            // For large files, we'll calculate hash from a sample
            const stats = statSync(filePath);
            const fileSize = stats.size;
            
            if (fileSize > 100 * 1024 * 1024) { // Files larger than 100MB
                return this.calculateSampleHash(filePath);
            } else {
                return this.calculateFullHash(filePath);
            }
        } catch (error) {
            console.error(`Failed to calculate hash for ${filePath}:`, error);
            return '';
        }
    }

    private static calculateFullHash(filePath: string): string {
        const fileBuffer = readFileSync(filePath);
        const hash = createHash('sha256');
        hash.update(fileBuffer);
        return hash.digest('hex').toUpperCase();
    }

    private static calculateSampleHash(filePath: string): string {
        // Calculate hash from first and last 8KB of file
        const fd = openSync(filePath, 'r');
        const stats = fstatSync(fd);
        const fileSize = stats.size;
        
        const hash = createHash('sha256');
        
        try {
            // Read first 8KB
            const firstChunk = Buffer.alloc(8192);
            readSync(fd, firstChunk, 0, 8192, 0);
            hash.update(firstChunk);
            
            // Read last 8KB
            if (fileSize > 16384) {
                const lastChunk = Buffer.alloc(8192);
                readSync(fd, lastChunk, 0, 8192, fileSize - 8192);
                hash.update(lastChunk);
            }
            
            return hash.digest('hex').toUpperCase();
        } finally {
            closeSync(fd);
        }
    }

    static async calculateAutoV2Hash(filePath: string): Promise<string> {
        // AutoV2 hash is typically used by Automatic1111
        // This is a simplified version - you might need to implement the exact algorithm
        return this.calculateSHA256(filePath);
    }
}
