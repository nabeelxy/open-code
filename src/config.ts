import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Config } from './types.js'

const CONFIG_DIR = join(homedir(), '.open-code')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

// Default model and base URL per provider
const PROVIDER_DEFAULTS: Record<string, { model: string; baseUrl?: string }> = {
  anthropic: { model: 'claude-opus-4-6' },
  openai: { model: 'gpt-4o' },
  gemini: {
    model: 'gemini-2.0-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  },
  groq: {
    model: 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
  },
  mistral: {
    model: 'mistral-large-latest',
    baseUrl: 'https://api.mistral.ai/v1',
  },
  together: {
    model: 'meta-llama/Llama-3-70b-chat-hf',
    baseUrl: 'https://api.together.xyz/v1',
  },
  ollama: {
    model: 'qwen2.5-coder:7b',
    baseUrl: 'http://localhost:11434/v1',
  },
}

export async function loadConfig(configPath?: string): Promise<Config> {
  let fileConfig: Partial<Config> = {}

  const path = configPath ? resolve(configPath) : CONFIG_FILE
  try {
    const raw = await readFile(path, 'utf8')
    fileConfig = JSON.parse(raw) as Partial<Config>
  } catch {
    // Config file not found — use defaults
  }

  const provider = process.env['LITE_PROVIDER'] ?? fileConfig.provider ?? 'anthropic'
  const defaults = PROVIDER_DEFAULTS[provider] ?? {}

  // API key: LITE_API_KEY takes precedence, then provider-specific env vars
  const apiKey =
    process.env['LITE_API_KEY'] ??
    fileConfig.apiKey ??
    process.env['ANTHROPIC_API_KEY'] ??
    process.env['OPENAI_API_KEY'] ??
    process.env['GEMINI_API_KEY'] ??
    process.env['GROQ_API_KEY'] ??
    process.env['MISTRAL_API_KEY'] ??
    process.env['TOGETHER_API_KEY']

  const permissionMode: 'ask' | 'auto' | 'permissive' =
    process.env['LITE_AUTO'] === 'true'
      ? 'auto'
      : process.env['LITE_AUTO_MODE'] === 'true'
      ? 'permissive'
      : (fileConfig.permissionMode ?? 'ask')

  return {
    provider,
    model: process.env['LITE_MODEL'] ?? fileConfig.model ?? defaults.model ?? 'claude-opus-4-6',
    apiKey,
    baseUrl: process.env['LITE_BASE_URL'] ?? fileConfig.baseUrl ?? defaults.baseUrl,
    maxTokens: fileConfig.maxTokens ?? 8192,
    permissionMode,
    systemPromptExtra: fileConfig.systemPromptExtra,
  }
}

export async function saveConfig(config: Partial<Config>): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
}
