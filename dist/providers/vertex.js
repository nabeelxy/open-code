import { execSync } from 'node:child_process';
import { GoogleGenAI, Type } from '@google/genai';
/**
 * Native Vertex AI provider using the official @google/genai SDK.
 *
 * Authentication: Application Default Credentials (ADC).
 * One-time setup: `gcloud auth application-default login`
 *
 * No API key needed — auth comes from gcloud credentials.
 */
export class VertexProvider {
    name = 'vertex';
    client;
    constructor(opts = {}) {
        const project = opts.project ?? resolveProject();
        const location = opts.location ?? resolveLocation();
        this.client = new GoogleGenAI({ vertexai: true, project, location });
    }
    async *stream(params) {
        const { messages, tools, systemPrompt, model, maxTokens = 8192 } = params;
        // Vertex SDK uses bare model names like "gemini-2.5-pro" (strip "google/" prefix)
        const modelId = model.replace(/^google\//, '');
        const contents = toGenAIContents(messages);
        const genAITools = tools.length > 0 ? [toGenAITools(tools)] : [];
        const responseStream = await this.client.models.generateContentStream({
            model: modelId,
            contents,
            config: {
                maxOutputTokens: maxTokens,
                systemInstruction: systemPrompt,
                ...(genAITools.length > 0 ? { tools: genAITools } : {}),
            },
        });
        let doneSent = false;
        for await (const chunk of responseStream) {
            for (const candidate of chunk.candidates ?? []) {
                for (const part of candidate.content?.parts ?? []) {
                    if (part.text) {
                        yield { type: 'text', text: part.text };
                    }
                    if (part.functionCall) {
                        yield {
                            type: 'tool_use',
                            toolCall: {
                                id: `vtx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                                name: part.functionCall.name ?? '',
                                input: (part.functionCall.args ?? {}),
                            },
                        };
                    }
                }
                const reason = candidate.finishReason;
                if (reason && reason !== 'FINISH_REASON_UNSPECIFIED' && !doneSent) {
                    doneSent = true;
                    yield {
                        type: 'done',
                        stopReason: reason === 'STOP' ? 'end_turn' : reason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn',
                    };
                }
            }
        }
        if (!doneSent)
            yield { type: 'done', stopReason: 'end_turn' };
    }
}
// ─── Format converters ────────────────────────────────────────────────────────
/** Normalized Message[] → @google/genai Content[] */
function toGenAIContents(messages) {
    const result = [];
    for (const msg of messages) {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        if (typeof msg.content === 'string') {
            result.push({ role, parts: [{ text: msg.content }] });
            continue;
        }
        const parts = [];
        for (const block of msg.content) {
            if (block.type === 'text') {
                parts.push({ text: block.text });
            }
            else if (block.type === 'tool_use') {
                parts.push({ functionCall: { name: block.name, args: block.input } });
            }
            else if (block.type === 'tool_result') {
                // functionResponse must be in a 'user' role message
                parts.push({
                    functionResponse: {
                        name: resolveToolName(block.tool_use_id, messages),
                        response: { result: block.content },
                    },
                });
            }
        }
        if (parts.length === 0)
            continue;
        const hasResponse = parts.some(p => 'functionResponse' in p);
        result.push({ role: hasResponse ? 'user' : role, parts });
    }
    return result;
}
/** Look up the original tool name for a given tool_use_id from message history */
function resolveToolName(toolUseId, messages) {
    for (const msg of messages) {
        if (typeof msg.content === 'string')
            continue;
        for (const block of msg.content) {
            if (block.type === 'tool_use' && block.id === toolUseId)
                return block.name;
        }
    }
    return 'unknown_tool';
}
/** ToolDefinition[] → @google/genai FunctionDeclarations Tool */
function toGenAITools(tools) {
    return {
        functionDeclarations: tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: {
                type: Type.OBJECT,
                properties: t.parameters.properties,
                required: t.parameters.required ?? [],
            },
        })),
    };
}
// ─── Credential helpers ───────────────────────────────────────────────────────
function resolveProject() {
    const fromEnv = process.env['VERTEX_PROJECT'] ??
        process.env['GOOGLE_CLOUD_PROJECT'] ??
        process.env['GCLOUD_PROJECT'];
    if (fromEnv)
        return fromEnv;
    try {
        const val = execSync('gcloud config get-value project 2>/dev/null', { encoding: 'utf8' }).trim();
        if (val && val !== '(unset)')
            return val;
    }
    catch { /* ignore */ }
    throw new Error('Vertex AI: cannot determine project ID.\n' +
        'Set VERTEX_PROJECT env var, or: gcloud config set project <your-project>');
}
function resolveLocation() {
    const fromEnv = process.env['VERTEX_LOCATION'] ?? process.env['GOOGLE_CLOUD_REGION'];
    if (fromEnv)
        return fromEnv;
    try {
        const val = execSync('gcloud config get-value compute/region 2>/dev/null', { encoding: 'utf8' }).trim();
        if (val && val !== '(unset)')
            return val;
    }
    catch { /* ignore */ }
    return 'us-central1';
}
//# sourceMappingURL=vertex.js.map