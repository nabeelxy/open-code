/**
 * Provider message-conversion unit tests.
 *
 * These tests exercise the internal toOpenAIMessages() conversion without
 * making real API calls, using the exported helper (accessed via a thin
 * test-only subclass).
 *
 * Run with: npx tsx --test src/tests/providers.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../providers/openai.js';
// ─── Test-only subclass that exposes the private conversion method ─────────────
class TestableOpenAIProvider extends OpenAIProvider {
    convert(messages) {
        // Access private method via type cast for testing
        return this.toOpenAIMessages(messages);
    }
}
const provider = new TestableOpenAIProvider({ name: 'test', apiKey: 'test' });
// ─── Tests ────────────────────────────────────────────────────────────────────
describe('OpenAIProvider message conversion', () => {
    it('converts a plain string user message', () => {
        const messages = [{ role: 'user', content: 'hello' }];
        const result = provider.convert(messages);
        assert.equal(result.length, 1);
        assert.equal(result[0]?.role, 'user');
        assert.equal(result[0]?.content, 'hello');
    });
    it('converts a plain string assistant message', () => {
        const messages = [{ role: 'assistant', content: 'hi there' }];
        const result = provider.convert(messages);
        assert.equal(result[0]?.role, 'assistant');
        assert.equal(result[0]?.content, 'hi there');
    });
    it('converts tool_result blocks to tool role messages', () => {
        const messages = [
            {
                role: 'user',
                content: [
                    { type: 'tool_result', tool_use_id: 'tc1', content: 'file contents here' },
                ],
            },
        ];
        const result = provider.convert(messages);
        assert.equal(result.length, 1);
        assert.equal(result[0]?.role, 'tool');
        assert.equal(result[0]?.tool_call_id, 'tc1');
        assert.equal(result[0]?.content, 'file contents here');
    });
    it('converts tool_use blocks to assistant tool_calls', () => {
        const messages = [
            {
                role: 'assistant',
                content: [
                    { type: 'text', text: 'Let me read that.' },
                    {
                        type: 'tool_use',
                        id: 'tc1',
                        name: 'read_file',
                        input: { path: 'src/index.ts' },
                    },
                ],
            },
        ];
        const result = provider.convert(messages);
        assert.equal(result.length, 1);
        assert.equal(result[0]?.role, 'assistant');
        assert.equal(result[0]?.content, 'Let me read that.');
        assert.ok(result[0]?.tool_calls);
        assert.equal(result[0]?.tool_calls?.[0]?.id, 'tc1');
        assert.equal(result[0]?.tool_calls?.[0]?.function.name, 'read_file');
        const args = JSON.parse(result[0]?.tool_calls?.[0]?.function.arguments ?? '{}');
        assert.equal(args.path, 'src/index.ts');
    });
    it('handles mixed user message with text and tool_result', () => {
        const messages = [
            {
                role: 'user',
                content: [
                    { type: 'tool_result', tool_use_id: 'tc1', content: 'result' },
                    { type: 'text', text: 'follow up question' },
                ],
            },
        ];
        const result = provider.convert(messages);
        // tool_result becomes a 'tool' message, text becomes a 'user' message
        const roles = result.map(m => m.role);
        assert.ok(roles.includes('tool'), 'expected a tool message');
        assert.ok(roles.includes('user'), 'expected a user text message');
    });
    it('handles multi-turn conversation', () => {
        const messages = [
            { role: 'user', content: 'Read file x' },
            {
                role: 'assistant',
                content: [
                    { type: 'tool_use', id: 'tc1', name: 'read_file', input: { path: 'x.ts' } },
                ],
            },
            {
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: 'tc1', content: 'x content' }],
            },
            { role: 'assistant', content: 'Here is x: ...' },
        ];
        const result = provider.convert(messages);
        const roles = result.map(m => m.role);
        assert.deepEqual(roles, ['user', 'assistant', 'tool', 'assistant']);
    });
});
describe('config loading', () => {
    it('loads LITE_PROVIDER from environment', async () => {
        // Dynamic import to test env var reading
        const originalProvider = process.env['LITE_PROVIDER'];
        process.env['LITE_PROVIDER'] = 'openai';
        const { loadConfig } = await import('../config.js');
        const config = await loadConfig();
        assert.equal(config.provider, 'openai');
        // Restore
        if (originalProvider === undefined) {
            delete process.env['LITE_PROVIDER'];
        }
        else {
            process.env['LITE_PROVIDER'] = originalProvider;
        }
    });
});
//# sourceMappingURL=providers.test.js.map