/**
 * ComfyUI Integration Type Definitions for Workbench Plugin
 * 
 * This file contains comprehensive type definitions for ComfyUI integration and provider services including:
 * - ComfyUI connection status and system monitoring types
 * - CivitAI API integration with complete model and version structures
 * - HuggingFace Hub integration with repository and file management
 * - Enhanced metadata management with provider relationships
 * - Cross-provider model identification and verification systems
 * - System resource monitoring and queue management interfaces
 */

// ===========================================================================
// COMFYUI CONNECTION AND STATUS TYPES
// ===========================================================================

/*
 * Possible states for the ComfyUI connection status.
 * 
 * Status progression:
 * - Disconnected: No active connection to ComfyUI
 * - Launching: ComfyUI is being started up
 * - Connecting: Attempting to establish connection
 * - Ready: Connected and available for workflow execution
 * - Busy: Connected but currently processing workflows
 * - Error: Connection failed or encountered an error
 */
export type ComfyStatus = 'Disconnected' | 'Connecting' | 'Ready' | 'Busy' | 'Error' | 'Launching';

// ===========================================================================
// SYSTEM MONITORING AND STATUS MODAL TYPES
// ===========================================================================

/*
 * GPU statistics interface for system resource monitoring.
 * 
 * Provides real-time GPU utilization and VRAM usage information
 * for monitoring system performance during workflow execution.
 */

export interface GpuStats {
    name: string;
    gpu_utilization?: number; // Percentage
    vram_used: number; // Bytes
    vram_total: number; // Bytes
}

/*
 * System statistics interface for comprehensive resource monitoring.
 * 
 * Includes CPU, RAM, and GPU utilization metrics for performance tracking
 * and system health monitoring during ComfyUI operations.
 */
export interface SystemStats {
    cpu_utilization?: number; // Percentage
    ram_utilization?: number; // Percentage
    ram_used?: number; // Bytes
    ram_total?: number; // Bytes
    gpus?: GpuStats[];
}

/*
 * Queue information interface for workflow execution monitoring.
 * 
 * Tracks currently running and pending workflow items in the ComfyUI queue
 * for real-time progress monitoring and queue management.
 */
export interface QueueInfo {
    queue_running: unknown[]; // Array of running items (structure might be [prompt_id, ...])
    queue_pending: unknown[]; // Array of pending items
}

// ===========================================================================
// CIVITAI API INTEGRATION TYPES
// ===========================================================================

/*
 * Main CivitAI model interface with comprehensive metadata.
 * 
 * Represents a complete model entry from CivitAI including:
 * - Basic model information and categorization
 * - Usage permissions and licensing details
 * - Community statistics and ratings
 * - Creator information and attribution
 * - Associated tags and model versions
 */

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

/*
 * CivitAI model version interface with detailed version-specific metadata.
 * 
 * Each model can have multiple versions with different:
 * - Base models and training parameters
 * - File formats and download options
 * - Associated images and example outputs
 * - Version-specific statistics and ratings
 * - Training words and usage metadata
 */

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

/*
 * CivitAI file interface with comprehensive file metadata and security information.
 * 
 * Represents individual downloadable files within a model version including:
 * - File size, format, and technical specifications
 * - Security scanning results (pickle and virus scans)
 * - Hash verification for file integrity
 * - Download URLs and access information
 * - Primary file designation for version identification
 */

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

/*
 * CivitAI image interface for model example images and generation metadata.
 * 
 * Represents example images associated with model versions including:
 * - Image dimensions and display information
 * - NSFW content classification
 * - Generation parameters and prompts used
 * - Model configuration and sampling settings
 * - Hash verification for image integrity
 */

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

/*
 * Model relationship interface for tracking connections between models.
 * 
 * Defines relationships between models including:
 * - Parent-child relationships for derived models
 * - Compatible model recommendations
 * - Base model information and derivation chains
 * - Cross-provider model connections
 */
export interface ModelRelationship {
    parentModelId?: number;
    childModels: number[];
    compatibleModels: number[];
    baseModel: string;
    derivedFrom?: string;
}

// ===========================================================================
// HUGGINGFACE HUB INTEGRATION TYPES
// ===========================================================================

/*
 * HuggingFace model interface with repository and metadata information.
 * 
 * Represents a model from HuggingFace Hub including:
 * - Repository identification and versioning
 * - Author and community statistics
 * - Pipeline and library compatibility information
 * - Model card metadata and configuration
 * - Language and licensing information
 */

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

/*
 * HuggingFace file interface for repository file management.
 * 
 * Represents individual files within HuggingFace repositories including:
 * - File path and size information
 * - Git LFS support for large files
 * - Blob identification for version tracking
 * - File pointer management for efficient storage
 */
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

// ===========================================================================
// CROSS-PROVIDER MODEL MANAGEMENT TYPES
// ===========================================================================

/*
 * Provider identification type for model source tracking.
 * 
 * Identifies the source provider for each model:
 * - civitai: Models from CivitAI marketplace
 * - huggingface: Models from HuggingFace Hub
 * - unknown: Local models with no provider identification
 */
export type ModelProvider = 'civitai' | 'huggingface' | 'unknown';

/*
 * Enhanced model metadata interface for comprehensive model information.
 * 
 * Combines information from multiple providers with local file system data including:
 * - Local file path and identification information
 * - Provider-specific metadata and relationships
 * - Hash verification and file integrity checks
 * - Synchronization status and verification timestamps
 * - Cross-provider relationship mapping
 */

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
