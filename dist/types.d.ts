export type ContentBlock = {
    type: 'text';
    text: string;
} | {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
} | {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
};
export interface Message {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
}
export type StreamChunk = {
    type: 'text';
    text: string;
} | {
    type: 'tool_use';
    toolCall: {
        id: string;
        name: string;
        input: Record<string, unknown>;
    };
} | {
    type: 'done';
    stopReason?: 'end_turn' | 'tool_use' | 'max_tokens' | string;
} | {
    type: 'error';
    error: string;
};
export interface CompletionParams {
    messages: Message[];
    tools: ToolDefinition[];
    systemPrompt: string;
    model: string;
    maxTokens?: number;
}
export interface LLMProvider {
    readonly name: string;
    stream(params: CompletionParams): AsyncGenerator<StreamChunk>;
}
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}
export interface ToolContext {
    workingDir: string;
    permissionMode: 'ask' | 'auto';
    confirm(prompt: string): Promise<boolean>;
}
export interface ToolResult {
    content: string;
    isError?: boolean;
}
export interface Tool extends ToolDefinition {
    /** Human-readable label shown during execution, e.g. "[bash] npm install" */
    formatInput?(input: Record<string, unknown>): string;
    execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
export interface Config {
    provider: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    maxTokens?: number;
    permissionMode?: 'ask' | 'auto';
    systemPromptExtra?: string;
}
