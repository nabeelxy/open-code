import Anthropic from '@anthropic-ai/sdk';
export class AnthropicProvider {
    name = 'anthropic';
    client;
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
    }
    async *stream(params) {
        const { messages, tools, systemPrompt, model, maxTokens = 8192 } = params;
        // Accumulate tool input JSON chunks keyed by content block index
        const toolAccum = {};
        const stream = this.client.messages.stream({
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: this.toAnthropicMessages(messages),
            tools: tools.map(t => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters,
            })),
        });
        for await (const event of stream) {
            switch (event.type) {
                case 'content_block_start':
                    if (event.content_block.type === 'tool_use') {
                        toolAccum[event.index] = {
                            id: event.content_block.id,
                            name: event.content_block.name,
                            chunks: [],
                        };
                    }
                    break;
                case 'content_block_delta':
                    if (event.delta.type === 'text_delta') {
                        yield { type: 'text', text: event.delta.text };
                    }
                    else if (event.delta.type === 'input_json_delta' && toolAccum[event.index]) {
                        toolAccum[event.index].chunks.push(event.delta.partial_json);
                    }
                    break;
                case 'content_block_stop': {
                    const tool = toolAccum[event.index];
                    if (tool) {
                        const raw = tool.chunks.join('');
                        const input = raw ? JSON.parse(raw) : {};
                        yield { type: 'tool_use', toolCall: { id: tool.id, name: tool.name, input } };
                        delete toolAccum[event.index];
                    }
                    break;
                }
                case 'message_delta':
                    yield {
                        type: 'done',
                        stopReason: event.delta.stop_reason ?? 'end_turn',
                    };
                    break;
                default:
                    // Other events (message_start, message_stop, ping, etc.) are ignored
                    break;
            }
        }
    }
    /** Convert normalized messages → Anthropic MessageParam array */
    toAnthropicMessages(messages) {
        return messages.map(msg => ({
            role: msg.role,
            content: typeof msg.content === 'string'
                ? msg.content
                : msg.content.map(block => {
                    if (block.type === 'text')
                        return { type: 'text', text: block.text };
                    if (block.type === 'tool_use')
                        return {
                            type: 'tool_use',
                            id: block.id,
                            name: block.name,
                            input: block.input,
                        };
                    // tool_result
                    return {
                        type: 'tool_result',
                        tool_use_id: block.tool_use_id,
                        content: block.content,
                        is_error: block.is_error,
                    };
                }),
        }));
    }
}
//# sourceMappingURL=anthropic.js.map