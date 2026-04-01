import Anthropic from '@anthropic-ai/sdk'
import type { CompletionParams, LLMProvider, Message, StreamChunk } from '../types.js'

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic'
  private client: Anthropic

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey })
  }

  async *stream(params: CompletionParams): AsyncGenerator<StreamChunk> {
    const { messages, tools, systemPrompt, model, maxTokens = 8192 } = params

    // Accumulate tool input JSON chunks keyed by content block index
    const toolAccum: Record<number, { id: string; name: string; chunks: string[] }> = {}

    const stream = this.client.messages.stream({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: this.toAnthropicMessages(messages),
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool['input_schema'],
      })),
    })

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_start':
          if (event.content_block.type === 'tool_use') {
            toolAccum[event.index] = {
              id: event.content_block.id,
              name: event.content_block.name,
              chunks: [],
            }
          }
          break

        case 'content_block_delta':
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text }
          } else if (event.delta.type === 'input_json_delta' && toolAccum[event.index]) {
            toolAccum[event.index].chunks.push(event.delta.partial_json)
          }
          break

        case 'content_block_stop': {
          const tool = toolAccum[event.index]
          if (tool) {
            const raw = tool.chunks.join('')
            const input = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
            yield { type: 'tool_use', toolCall: { id: tool.id, name: tool.name, input } }
            delete toolAccum[event.index]
          }
          break
        }

        case 'message_delta':
          yield {
            type: 'done',
            stopReason: event.delta.stop_reason ?? 'end_turn',
          }
          break

        default:
          // Other events (message_start, message_stop, ping, etc.) are ignored
          break
      }
    }
  }

  /** Convert normalized messages → Anthropic MessageParam array */
  private toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages.map(msg => ({
      role: msg.role,
      content:
        typeof msg.content === 'string'
          ? msg.content
          : msg.content.map(block => {
              if (block.type === 'text') return { type: 'text' as const, text: block.text }
              if (block.type === 'tool_use')
                return {
                  type: 'tool_use' as const,
                  id: block.id,
                  name: block.name,
                  input: block.input,
                }
              // tool_result
              return {
                type: 'tool_result' as const,
                tool_use_id: block.tool_use_id,
                content: block.content,
                is_error: block.is_error,
              }
            }),
    }))
  }
}
