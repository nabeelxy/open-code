import OpenAI from 'openai';
export class OpenAIProvider {
    name;
    client;
    constructor(opts = {}) {
        this.name = opts.name ?? 'openai';
        this.client = new OpenAI({
            apiKey: opts.apiKey ?? 'none', // Ollama doesn't need a key
            baseURL: opts.baseUrl,
        });
    }
    async *stream(params) {
        const { messages, tools, systemPrompt, model, maxTokens = 8192 } = params;
        const oaiMessages = [
            { role: 'system', content: systemPrompt },
            ...this.toOpenAIMessages(messages),
        ];
        // Accumulate streamed tool call chunks keyed by index
        const toolAccum = {};
        const stream = await this.client.chat.completions.create({
            model,
            max_tokens: maxTokens,
            messages: oaiMessages,
            tools: tools.length > 0
                ? tools.map(t => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.parameters,
                    },
                }))
                : undefined,
            stream: true,
        });
        let emittedDone = false;
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            const finishReason = chunk.choices[0]?.finish_reason;
            if (delta?.content) {
                yield { type: 'text', text: delta.content };
            }
            // Accumulate tool call deltas
            if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                    const idx = tc.index;
                    if (!toolAccum[idx]) {
                        toolAccum[idx] = { id: '', name: '', argChunks: [] };
                    }
                    if (tc.id)
                        toolAccum[idx].id = tc.id;
                    if (tc.function?.name)
                        toolAccum[idx].name = tc.function.name;
                    if (tc.function?.arguments)
                        toolAccum[idx].argChunks.push(tc.function.arguments);
                }
            }
            if (finishReason === 'tool_calls' || finishReason === 'stop') {
                // Emit accumulated tool calls
                for (const tc of Object.values(toolAccum)) {
                    const raw = tc.argChunks.join('');
                    const input = raw ? JSON.parse(raw) : {};
                    yield { type: 'tool_use', toolCall: { id: tc.id, name: tc.name, input } };
                }
                yield {
                    type: 'done',
                    stopReason: finishReason === 'tool_calls' ? 'tool_use' : 'end_turn',
                };
                emittedDone = true;
            }
        }
        if (!emittedDone) {
            yield { type: 'done', stopReason: 'end_turn' };
        }
    }
    /** Convert normalized messages → OpenAI ChatCompletionMessageParam array */
    toOpenAIMessages(messages) {
        const result = [];
        for (const msg of messages) {
            if (msg.role === 'user') {
                if (typeof msg.content === 'string') {
                    result.push({ role: 'user', content: msg.content });
                    continue;
                }
                // Split tool_results into separate 'tool' role messages
                const toolResults = msg.content.filter((c) => c.type === 'tool_result');
                const textBlocks = msg.content.filter((c) => c.type === 'text');
                for (const tr of toolResults) {
                    result.push({
                        role: 'tool',
                        tool_call_id: tr.tool_use_id,
                        content: tr.content,
                    });
                }
                if (textBlocks.length > 0) {
                    result.push({ role: 'user', content: textBlocks.map(t => t.text).join('\n') });
                }
            }
            else {
                // assistant
                if (typeof msg.content === 'string') {
                    result.push({ role: 'assistant', content: msg.content });
                    continue;
                }
                const textBlocks = msg.content.filter((c) => c.type === 'text');
                const toolUses = msg.content.filter((c) => c.type === 'tool_use');
                const content = textBlocks.map(t => t.text).join('');
                if (toolUses.length > 0) {
                    result.push({
                        role: 'assistant',
                        content: content || null,
                        tool_calls: toolUses.map(tu => ({
                            id: tu.id,
                            type: 'function',
                            function: {
                                name: tu.name,
                                arguments: JSON.stringify(tu.input),
                            },
                        })),
                    });
                }
                else {
                    result.push({ role: 'assistant', content });
                }
            }
        }
        return result;
    }
}
//# sourceMappingURL=openai.js.map