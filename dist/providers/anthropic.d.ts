import type { CompletionParams, LLMProvider, StreamChunk } from '../types.js';
export declare class AnthropicProvider implements LLMProvider {
    readonly name = "anthropic";
    private client;
    constructor(apiKey?: string);
    stream(params: CompletionParams): AsyncGenerator<StreamChunk>;
    /** Convert normalized messages → Anthropic MessageParam array */
    private toAnthropicMessages;
}
