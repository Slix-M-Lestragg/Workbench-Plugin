import { Notice } from 'obsidian';
import { CivitAIService } from '../services/providers/CivitAIService';

export async function testCivitAIIntegration(apiKey?: string): Promise<void> {
    const service = new CivitAIService(apiKey);
    
    try {
        console.log('Testing CivitAI integration...');
        new Notice('Testing CivitAI connection...');
        
        // Test search for a well-known model
        const results = await service.searchModelsByName('cyberrealistic');
        
        console.log(`Found ${results.length} results for 'cyberrealistic'`);
        
        if (results.length > 0) {
            const firstResult = results[0];
            console.log('First result:', {
                id: firstResult.id,
                name: firstResult.name,
                type: firstResult.type,
                rating: firstResult.stats.rating,
                downloads: firstResult.stats.downloadCount
            });
            
            new Notice(`CivitAI working! Found: ${firstResult.name} (${firstResult.type})`);
            
            // Test more searches
            const moreResults = await service.searchModelsByName('cyber realistic');
            console.log(`Found ${moreResults.length} results for 'cyber realistic'`);
            
            if (moreResults.length > 0) {
                console.log('Additional results:', moreResults.slice(0, 3).map(m => ({
                    name: m.name,
                    type: m.type,
                    rating: m.stats.rating
                })));
            }
        } else {
            new Notice('CivitAI connected but no results found for cyberrealistic');
            
            // Try a more generic search
            const genericResults = await service.searchModelsByName('realistic');
            console.log(`Found ${genericResults.length} results for 'realistic'`);
            
            if (genericResults.length > 0) {
                new Notice(`Found ${genericResults.length} realistic models`);
            }
        }
    } catch (error) {
        console.error('CivitAI test failed:', error);
        new Notice(`CivitAI test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}