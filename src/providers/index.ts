import type { Config, LLMProvider } from '../types.js'
import { AnthropicProvider } from './anthropic.js'
import { OpenAIProvider } from './openai.js'
import { VertexProvider } from './vertex.js'

export function createProvider(config: Config): LLMProvider {
  const { provider, apiKey, baseUrl } = config

  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey)

    case 'openai':
      return new OpenAIProvider({ name: 'openai', apiKey, baseUrl })

    case 'gemini':
      return new OpenAIProvider({
        name: 'gemini',
        apiKey: apiKey ?? process.env['GEMINI_API_KEY'],
        baseUrl: baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta/openai/',
      })

    case 'groq':
      return new OpenAIProvider({
        name: 'groq',
        apiKey: apiKey ?? process.env['GROQ_API_KEY'],
        baseUrl: baseUrl ?? 'https://api.groq.com/openai/v1',
      })

    case 'mistral':
      return new OpenAIProvider({
        name: 'mistral',
        apiKey: apiKey ?? process.env['MISTRAL_API_KEY'],
        baseUrl: baseUrl ?? 'https://api.mistral.ai/v1',
      })

    case 'together':
      return new OpenAIProvider({
        name: 'together',
        apiKey: apiKey ?? process.env['TOGETHER_API_KEY'],
        baseUrl: baseUrl ?? 'https://api.together.xyz/v1',
      })

    case 'ollama':
      return new OpenAIProvider({
        name: 'ollama',
        apiKey: 'ollama', // Ollama accepts any non-empty key
        baseUrl: baseUrl ?? 'http://localhost:11434/v1',
      })

    case 'vertex':
      // Native Google Vertex AI SDK — uses gcloud ADC, no API key needed
      return new VertexProvider({
        project: process.env['VERTEX_PROJECT'],
        location: process.env['VERTEX_LOCATION'],
      })

    default:
      // Generic OpenAI-compatible endpoint
      if (!baseUrl) {
        throw new Error(
          `Unknown provider '${provider}'. For OpenAI-compatible endpoints set --base-url.\n` +
            `Known providers: anthropic, openai, gemini, groq, mistral, together, ollama, vertex`,
        )
      }
      return new OpenAIProvider({ name: provider, apiKey, baseUrl })
  }
}
