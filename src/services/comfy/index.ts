/**
 * ComfyUI Integration Module Index for Workbench Plugin
 * 
 * This file serves as the central export hub for all ComfyUI integration functionality
 * used throughout the Workbench Plugin. It provides a unified interface for importing
 * functions and utilities related to:
 * - ComfyUI application lifecycle management and launch operations
 * - Real-time connection monitoring and status polling
 * - ComfyUI API integration for system stats and queue management
 * - Workflow execution and generation pipeline management
 * - Provider integration testing and validation
 * - Cross-platform ComfyUI installation support
 */

// ===========================================================================
// COMFYUI INTEGRATION EXPORTS
// ===========================================================================

    // Application Launch and Lifecycle Management
    // Exports functions for launching ComfyUI in various configurations including
    // desktop app mode, script-based installations, and portable versions with
    // proper cross-platform support and error handling
    export * from './launch';

    // Connection Monitoring and Status Polling  
    // Exports utilities for maintaining real-time connection status with ComfyUI,
    // including automatic polling management, connection state tracking, and
    // graceful handling of connection interruptions
    export * from './polling';

    // ComfyUI API Integration and Communication
    // Exports functions for direct communication with the ComfyUI API including
    // connection verification, system statistics retrieval, queue information
    // fetching, and workflow execution with proper error handling
    export * from './api';

    // Workflow Generation and Execution Pipeline
    // Exports functions for executing ComfyUI workflows, managing generation
    // processes, and handling workflow data with validation and error recovery
    export { runWorkflow as executeGeneration, /* other exports from generation */ } from './generation';

    // Integration Testing and Validation
    // Exports testing utilities for validating provider integrations including
    // CivitAI API connectivity, model search functionality, and service validation
    // with comprehensive error reporting and user feedback
    export * from './testIntegration';
