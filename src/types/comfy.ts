// Define possible states for the ComfyUI connection
export type ComfyStatus = 'Disconnected' | 'Connecting' | 'Ready' | 'Busy' | 'Error' | 'Launching';

// --- Types for Status Modal ---

export interface GpuStats {
    name: string;
    gpu_utilization?: number; // Percentage
    vram_used: number; // Bytes
    vram_total: number; // Bytes
}

export interface SystemStats {
    cpu_utilization?: number; // Percentage
    ram_utilization?: number; // Percentage
    ram_used?: number; // Bytes
    ram_total?: number; // Bytes
    gpus?: GpuStats[];
}

// Basic structure based on modal usage - adjust if ComfyUI API provides more detail
export interface QueueInfo {
    queue_running: unknown[]; // Array of running items (structure might be [prompt_id, ...])
    queue_pending: unknown[]; // Array of pending items
}

// --- CivitAI API Types ---

export interface CivitAIModel {
    id: number;
    name: string;
    description: string;
    type: 'Checkpoint' | 'LORA' | 'TextualInversion' | 'Hypernetwork' | 'AestheticGradient' | 'VAE' | 'Controlnet' | 'Upscaler';
    nsfw: boolean;
    allowNoCredit: boolean;
    allowCommercialUse: string;
    allowDerivatives: boolean;
    allowDifferentLicense: boolean;
    stats: {
        downloadCount: number;
        favoriteCount: number;
        commentCount: number;
        ratingCount: number;
        rating: number;
    };
    creator: {
        username: string;
        image?: string;
    };
    tags: string[];
    modelVersions: CivitAIModelVersion[];
}

export interface CivitAIModelVersion {
    id: number;
    modelId: number;
    name: string;
    description: string;
    baseModel: string;
    downloadUrl: string;
    trainedWords: string[];
    files: CivitAIFile[];
    images: CivitAIImage[];
    stats: {
        downloadCount: number;
        ratingCount: number;
        rating: number;
    };
    metadata?: {
        fp?: string;
        size?: string;
        format?: string;
    };
}

export interface CivitAIFile {
    id: number;
    sizeKB: number;
    name: string;
    type: string;
    metadata: {
        fp?: string;
        size?: string;
        format?: string;
    };
    pickleScanResult: string;
    pickleScanMessage?: string;
    virusScanResult: string;
    scannedAt: string;
    hashes: {
        AutoV1?: string;
        AutoV2?: string;
        SHA256?: string;
        CRC32?: string;
        BLAKE3?: string;
    };
    downloadUrl: string;
    primary: boolean;
}

export interface CivitAIImage {
    id: number;
    url: string;
    nsfw: string;
    width: number;
    height: number;
    hash: string;
    meta?: {
        prompt?: string;
        negativePrompt?: string;
        seed?: number;
        steps?: number;
        sampler?: string;
        cfgScale?: number;
        model?: string;
        modelHash?: string;
    };
}

export interface ModelRelationship {
    parentModelId?: number;
    childModels: number[];
    compatibleModels: number[];
    baseModel: string;
    derivedFrom?: string;
}

// --- HuggingFace API Types ---

export interface HuggingFaceModel {
    id: string;
    modelId: string;
    author: string;
    sha: string;
    downloads: number;
    likes: number;
    tags: string[];
    pipeline_tag?: string;
    library_name?: string;
    created_at: string;
    last_modified: string;
    card_data?: {
        language?: string[];
        license?: string;
        base_model?: string;
        pipeline_tag?: string;
        tags?: string[];
    };
}

export interface HuggingFaceFile {
    path: string;
    size: number;
    blob_id: string;
    lfs?: {
        oid: string;
        size: number;
        pointer_size: number;
    };
}

export type ModelProvider = 'civitai' | 'huggingface' | 'unknown';

export interface EnhancedModelMetadata {
    localPath: string;
    filename: string;
    hash?: string;
    provider: ModelProvider;
    civitaiModel?: CivitAIModel;
    civitaiVersion?: CivitAIModelVersion;
    huggingfaceModel?: HuggingFaceModel;
    relationships: ModelRelationship;
    lastSynced?: Date;
    isVerified: boolean;
}
