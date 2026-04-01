import type { CompletionParams, LLMProvider, StreamChunk } from '../types.js';
export interface VertexProviderOptions {
    project?: string;
    location?: string;
}
/**
 * Native Vertex AI provider using the official @google/genai SDK.
 *
 * Authentication: Application Default Credentials (ADC).
 * One-time setup: `gcloud auth application-default login`
 *
 * No API key needed — auth comes from gcloud credentials.
 */
export declare class VertexProvider implements LLMProvider {
    readonly name = "vertex";
    private client;
    constructor(opts?: VertexProviderOptions);
    stream(params: CompletionParams): AsyncGenerator<StreamChunk>;
}
