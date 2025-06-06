import { EnhancedModelMetadata, CivitAIModel, HuggingFaceModel } from '../types/comfy';

export interface IModelProvider {
    searchModelsByName(name: string): Promise<CivitAIModel[] | HuggingFaceModel[]>;
    getModelInfo(id: string): Promise<CivitAIModel | HuggingFaceModel | null>;
    clearCache(): void;
}

export interface IMetadataManager {
    enrichModelMetadata(filePath: string, forceRefresh?: boolean): Promise<EnhancedModelMetadata>;
    refreshAllMetadata(targetProvider?: string): Promise<void>;
}

export interface IService {
    name: string;
    initialize?(): Promise<void>;
    cleanup?(): Promise<void>;
}

export interface IModelProviderService extends IService {
    detectProviderFromPath(filePath: string): 'civitai' | 'huggingface' | 'unknown';
    getProviderService(provider: 'civitai' | 'huggingface' | 'unknown'): IModelProvider | null;
    searchAllProviders(query: string): Promise<{
        civitai: CivitAIModel[];
        huggingface: HuggingFaceModel[];
    }>;
    searchProvider(query: string, provider: 'civitai' | 'huggingface' | 'unknown'): Promise<CivitAIModel[] | HuggingFaceModel[]>;
    getModelInfo(id: string, provider: 'civitai' | 'huggingface' | 'unknown'): Promise<CivitAIModel | HuggingFaceModel | null>;
    clearAllCaches(): void;
}