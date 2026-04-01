/**
 * Agent loop integration tests using a mock provider.
 *
 * Run with: npx tsx --test src/tests/agent.test.ts
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { AgentContext } from '../agent.js'
import { runAgent } from '../agent.js'
import type { LLMProvider, Message, StreamChunk, Tool, ToolContext } from '../types.js'

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/** Builds a mock provider that yields the given sequence of chunks */
function mockProvider(chunks: StreamChunk[]): LLMProvider {
  return {
    name: 'mock',
    async *stream() {
      for (const chunk of chunks) yield chunk
    },
  }
}

/** Builds a mock provider that first calls a tool, then responds with text */
function mockProviderWithToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  finalText: string,
): LLMProvider {
  let call = 0
  return {
    name: 'mock',
    async *stream() {
      if (call === 0) {
        call++
        yield { type: 'tool_use', toolCall: { id: 'tc1', name: toolName, input: toolInput } }
        yield { type: 'done', stopReason: 'tool_use' }
      } else {
        yield { type: 'text', text: finalText }
        yield { type: 'done', stopReason: 'end_turn' }
      }
    },
  }
}

const noopTool: ToolContext = {
  workingDir: '/tmp',
  permissionMode: 'auto',
  confirm: async () => true,
}

function makeCtx(provider: LLMProvider, tools: Tool[] = []): AgentContext {
  return {
    provider,
    tools,
    messages: [],
    systemPrompt: 'You are a test assistant.',
    model: 'test-model',
    maxTokens: 1024,
    toolCtx: noopTool,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('agent loop', () => {
  it('appends user message to history', async () => {
    const ctx = makeCtx(mockProvider([{ type: 'done', stopReason: 'end_turn' }]))
    await runAgent('hello', ctx, () => {})
    assert.equal(ctx.messages[0]?.role, 'user')
    const content = ctx.messages[0]?.content
    assert.equal(typeof content === 'string' ? content : '', 'hello')
  })

  it('streams text chunks to onText callback', async () => {
    const chunks: string[] = []
    const ctx = makeCtx(
      mockProvider([
        { type: 'text', text: 'Hello' },
        { type: 'text', text: ' world' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    )
    await runAgent('hi', ctx, text => chunks.push(text))
    assert.deepEqual(chunks, ['Hello', ' world'])
  })

  it('adds assistant message after streaming', async () => {
    const ctx = makeCtx(
      mockProvider([
        { type: 'text', text: 'response text' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    )
    await runAgent('hi', ctx, () => {})
    const assistant = ctx.messages.find((m: Message) => m.role === 'assistant')
    assert.ok(assistant, 'no assistant message found')
    const content = assistant.content
    assert.ok(Array.isArray(content))
    const textBlock = (content as Array<{ type: string; text?: string }>).find(b => b.type === 'text')
    assert.ok(textBlock && 'text' in textBlock && textBlock.text === 'response text')
  })

  it('executes a tool and feeds result back', async () => {
    const executedWith: Record<string, unknown>[] = []
    const echoTool: Tool = {
      name: 'echo_test',
      description: 'echoes the value',
      parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
      async execute(input) {
        executedWith.push(input)
        return { content: `echo: ${input['value']}` }
      },
    }

    const ctx = makeCtx(
      mockProviderWithToolCall('echo_test', { value: 'hello' }, 'Done.'),
      [echoTool],
    )

    const textOut: string[] = []
    await runAgent('call the tool', ctx, text => textOut.push(text))

    // Tool was executed
    assert.equal(executedWith.length, 1)
    assert.equal(executedWith[0]?.['value'], 'hello')

    // Tool result was added as user message
    const toolResultMsg = ctx.messages.find((m: Message) => {
      if (m.role !== 'user') return false
      const c = m.content
      return Array.isArray(c) && c.some(b => b.type === 'tool_result')
    })
    assert.ok(toolResultMsg, 'no tool result message found')

    // Final text response present
    assert.ok(textOut.includes('Done.'))
  })

  it('handles unknown tool gracefully', async () => {
    const ctx = makeCtx(
      mockProviderWithToolCall('nonexistent_tool', {}, 'Handled.'),
      [], // no tools registered
    )
    await runAgent('call unknown tool', ctx, () => {})

    const errorMsg = ctx.messages.find((m: Message) => {
      if (m.role !== 'user') return false
      const c = m.content
      return (
        Array.isArray(c) &&
        c.some(b => b.type === 'tool_result' && 'is_error' in b && b.is_error === true)
      )
    })
    assert.ok(errorMsg, 'expected an error tool_result message')
  })

  it('handles provider errors gracefully', async () => {
    const ctx = makeCtx(
      mockProvider([{ type: 'error', error: 'rate limit exceeded' }]),
    )
    const out: string[] = []
    await runAgent('hi', ctx, text => out.push(text))
    assert.ok(out.join('').toLowerCase().includes('error') || out.join('').includes('rate limit'))
  })

  it('stops after MAX_TURNS if tools keep being called', async () => {
    // Provider always returns a tool call, never a final response
    let callCount = 0
    const loopProvider: LLMProvider = {
      name: 'loop',
      async *stream() {
        callCount++
        yield { type: 'tool_use', toolCall: { id: `tc${callCount}`, name: 'noop', input: {} } }
        yield { type: 'done', stopReason: 'tool_use' }
      },
    }
    const noopT: Tool = {
      name: 'noop',
      description: 'does nothing',
      parameters: { type: 'object', properties: {} },
      async execute() { return { content: 'ok' } },
    }

    const ctx = makeCtx(loopProvider, [noopT])
    // Should not hang; completes after MAX_TURNS (50)
    await runAgent('loop', ctx, () => {})
    assert.ok(callCount <= 51, `expected at most 51 iterations, got ${callCount}`)
  })
})

// ─── Message format tests ─────────────────────────────────────────────────────

describe('message accumulation', () => {
  it('accumulates multiple text chunks into one assistant content block', async () => {
    const ctx = makeCtx(
      mockProvider([
        { type: 'text', text: 'part1' },
        { type: 'text', text: 'part2' },
        { type: 'text', text: 'part3' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    )
    await runAgent('hi', ctx, () => {})
    const assistant = ctx.messages.find((m: Message) => m.role === 'assistant')!
    const content = assistant.content as Array<{ type: string; text?: string }>
    const textBlock = content.find(b => b.type === 'text')
    assert.equal(textBlock?.text, 'part1part2part3')
  })

  it('handles empty response gracefully', async () => {
    const ctx = makeCtx(mockProvider([{ type: 'done', stopReason: 'end_turn' }]))
    await runAgent('hi', ctx, () => {})
    // Should not throw and should have at minimum the user + assistant messages
    assert.ok(ctx.messages.length >= 1)
  })
})
