import type { LLMProvider, Message, Tool, ToolContext } from './types.js';
export interface AgentContext {
    provider: LLMProvider;
    tools: Tool[];
    messages: Message[];
    systemPrompt: string;
    model: string;
    maxTokens: number;
    toolCtx: ToolContext;
}
/**
 * Run one user turn through the agent loop.
 *
 * Streams the LLM response to stdout in real-time. Executes tool calls
 * and feeds results back until the model stops calling tools.
 *
 * @param userInput - The user's message
 * @param ctx - Shared agent context (messages array is mutated)
 * @param onText - Called with each text chunk as it streams
 */
export declare function runAgent(userInput: string, ctx: AgentContext, onText: (text: string) => void): Promise<void>;
