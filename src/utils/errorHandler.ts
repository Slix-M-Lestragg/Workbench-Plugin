import { Notice } from 'obsidian';

export enum ErrorSeverity {
    LOW = 'low',        // Log only, no user notice
    MEDIUM = 'medium',  // Log + brief notice
    HIGH = 'high',      // Log + prominent notice + potential fallback
    CRITICAL = 'critical' // Log + notice + stop operation
}

export enum ErrorContext {
    COMFY_CONNECTION = 'ComfyUI Connection',
    MODEL_METADATA = 'Model Metadata',
    FILE_OPERATION = 'File Operation',
    API_REQUEST = 'API Request',
    WORKFLOW_EXECUTION = 'Workflow Execution',
    SETTINGS = 'Settings',
    UI_OPERATION = 'UI Operation',
    HASH_CALCULATION = 'Hash Calculation',
    MODEL_PROVIDER = 'Model Provider',
    APP_LAUNCH = 'App Launch'
}

export class WorkbenchError extends Error {
    public readonly context: ErrorContext;
    public readonly severity: ErrorSeverity;
    public readonly originalError?: Error;
    public readonly timestamp: Date;

    constructor(
        message: string,
        context: ErrorContext,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        originalError?: Error
    ) {
        super(message);
        this.name = 'WorkbenchError';
        this.context = context;
        this.severity = severity;
        this.originalError = originalError;
        this.timestamp = new Date();
    }
}

export function handleError(
    error: unknown,
    context: ErrorContext,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    customMessage?: string
): WorkbenchError {
    let workbenchError: WorkbenchError;

    if (error instanceof WorkbenchError) {
        // Already a WorkbenchError, just re-throw or handle
        workbenchError = error;
    } else if (error instanceof Error) {
        const message = customMessage || error.message;
        workbenchError = new WorkbenchError(message, context, severity, error);
    } else {
        const message = customMessage || `Unknown error: ${String(error)}`;
        workbenchError = new WorkbenchError(message, context, severity);
    }

    // Log error with context and timestamp
    const timestamp = workbenchError.timestamp.toISOString();
    const logMessage = `[${timestamp}] [${workbenchError.context}] ${workbenchError.message}`;
    
    switch (workbenchError.severity) {
        case ErrorSeverity.LOW:
            console.log(`📋 ${logMessage}`, workbenchError.originalError);
            break;
        case ErrorSeverity.MEDIUM:
            console.warn(`⚠️ ${logMessage}`, workbenchError.originalError);
            new Notice(`${workbenchError.context}: ${workbenchError.message}`, 4000);
            break;
        case ErrorSeverity.HIGH:
            console.error(`🚨 ${logMessage}`, workbenchError.originalError);
            new Notice(`⚠️ ${workbenchError.context}: ${workbenchError.message}`, 8000);
            break;
        case ErrorSeverity.CRITICAL:
            console.error(`💥 CRITICAL: ${logMessage}`, workbenchError.originalError);
            new Notice(`🚨 Critical Error - ${workbenchError.context}: ${workbenchError.message}`, 0);
            break;
    }

    return workbenchError;
}

// Convenience functions for common patterns
export function handleConnectionError(error: unknown, customMessage?: string): WorkbenchError {
    return handleError(error, ErrorContext.COMFY_CONNECTION, ErrorSeverity.HIGH, customMessage);
}

export function handleMetadataError(error: unknown, customMessage?: string): WorkbenchError {
    return handleError(error, ErrorContext.MODEL_METADATA, ErrorSeverity.MEDIUM, customMessage);
}

export function handleFileError(error: unknown, customMessage?: string): WorkbenchError {
    return handleError(error, ErrorContext.FILE_OPERATION, ErrorSeverity.HIGH, customMessage);
}

export function handleApiError(error: unknown, customMessage?: string): WorkbenchError {
    return handleError(error, ErrorContext.API_REQUEST, ErrorSeverity.MEDIUM, customMessage);
}

export function handleWorkflowError(error: unknown, customMessage?: string): WorkbenchError {
    return handleError(error, ErrorContext.WORKFLOW_EXECUTION, ErrorSeverity.HIGH, customMessage);
}

export function handleHashError(error: unknown, customMessage?: string): WorkbenchError {
    return handleError(error, ErrorContext.HASH_CALCULATION, ErrorSeverity.LOW, customMessage);
}

export function handleProviderError(error: unknown, customMessage?: string): WorkbenchError {
    return handleError(error, ErrorContext.MODEL_PROVIDER, ErrorSeverity.MEDIUM, customMessage);
}

export function handleLaunchError(error: unknown, customMessage?: string): WorkbenchError {
    return handleError(error, ErrorContext.APP_LAUNCH, ErrorSeverity.HIGH, customMessage);
}

export function handleUIError(error: unknown, customMessage?: string): WorkbenchError {
    return handleError(error, ErrorContext.UI_OPERATION, ErrorSeverity.MEDIUM, customMessage);
}

export function handleSettingsError(error: unknown, customMessage?: string): WorkbenchError {
    return handleError(error, ErrorContext.SETTINGS, ErrorSeverity.CRITICAL, customMessage);
}

/**
 * Safely executes an async function with error handling
 * @param fn The function to execute
 * @param context The error context
 * @param severity The error severity
 * @param fallbackValue Value to return on error
 * @returns The function result or fallback value
 */
export async function safeExecute<T>(
    fn: () => Promise<T>,
    context: ErrorContext,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    fallbackValue?: T
): Promise<T | undefined> {
    try {
        return await fn();
    } catch (error) {
        handleError(error, context, severity);
        return fallbackValue;
    }
}

/**
 * Safely executes a sync function with error handling
 * @param fn The function to execute
 * @param context The error context
 * @param severity The error severity
 * @param fallbackValue Value to return on error
 * @returns The function result or fallback value
 */
export function safeExecuteSync<T>(
    fn: () => T,
    context: ErrorContext,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    fallbackValue?: T
): T | undefined {
    try {
        return fn();
    } catch (error) {
        handleError(error, context, severity);
        return fallbackValue;
    }
}
