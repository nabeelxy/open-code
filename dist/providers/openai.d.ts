import type { CompletionParams, LLMProvider, StreamChunk } from '../types.js';
interface OpenAIProviderOptions {
    name?: string;
    apiKey?: string;
    baseUrl?: string;
}
export declare class OpenAIProvider implements LLMProvider {
    readonly name: string;
    private client;
    constructor(opts?: OpenAIProviderOptions);
    stream(params: CompletionParams): AsyncGenerator<StreamChunk>;
    /** Convert normalized messages → OpenAI ChatCompletionMessageParam array */
    private toOpenAIMessages;
}
export {};
