# lite-agent

A lightweight, vendor-agnostic coding agent for your terminal. Supports Claude, Gemini, GPT-4, Groq, Ollama, and any OpenAI-compatible API.

~1,400 lines of TypeScript. No framework. No build system required.

---

## Quick Start

```bash
cd lite
npm install

# With Claude (Anthropic)
ANTHROPIC_API_KEY=sk-ant-... npx tsx src/index.ts

# With Gemini
GEMINI_API_KEY=AI... npx tsx src/index.ts --provider gemini

# With GPT-4
OPENAI_API_KEY=sk-... npx tsx src/index.ts --provider openai --model gpt-4o

# With Groq (fast, free tier available)
GROQ_API_KEY=gsk_... npx tsx src/index.ts --provider groq

# With Ollama (local, no API key needed)
npx tsx src/index.ts --provider ollama --model qwen2.5-coder:7b

# Single prompt (non-interactive)
ANTHROPIC_API_KEY=sk-... npx tsx src/index.ts "explain what this repo does"
```

---

## Installation (optional, for global use)

```bash
cd lite
npm install
npm run build
npm link          # makes 'lite' available globally

# Then use from anywhere:
lite
lite --provider gemini "refactor this file"
```

---

## Supported Providers

| Provider | Flag | API Key Env Var | Default Model |
|---|---|---|---|
| Anthropic Claude | `--provider anthropic` | `ANTHROPIC_API_KEY` | `claude-opus-4-6` |
| OpenAI | `--provider openai` | `OPENAI_API_KEY` | `gpt-4o` |
| Google Gemini | `--provider gemini` | `GEMINI_API_KEY` | `gemini-2.0-flash` |
| Groq | `--provider groq` | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| Mistral | `--provider mistral` | `MISTRAL_API_KEY` | `mistral-large-latest` |
| Together AI | `--provider together` | `TOGETHER_API_KEY` | `meta-llama/Llama-3-70b-chat-hf` |
| Ollama (local) | `--provider ollama` | *(none needed)* | `qwen2.5-coder:7b` |
| Any OpenAI-compat | `--provider custom --base-url URL` | `LITE_API_KEY` | *(set `--model`)* |

---

## CLI Reference

```
lite [options] [prompt...]

Options:
  -p, --provider <name>   LLM provider (anthropic, openai, gemini, groq, ollama, ...)
  -m, --model <name>      Model to use
  -k, --api-key <key>     API key (overrides env vars)
  --base-url <url>        Base URL for OpenAI-compatible endpoints
  --auto                  Auto-approve all tool calls (no prompts)
  -c, --config <path>     Path to config file (default: ~/.lite-agent/config.json)
  --save-config           Save current flags to config file and exit
  -V, --version           Print version
  -h, --help              Show help
```

### Examples

```bash
# Interactive REPL
lite

# Single-shot with a specific model
lite -p anthropic -m claude-haiku-4-5-20251001 "what files are in src/?"

# Skip all confirmation prompts (useful for scripting)
lite --auto "add a README to this project"

# Custom OpenAI-compatible endpoint (e.g. LM Studio)
lite --provider local --base-url http://localhost:1234/v1 --model your-model

# Save provider preference so you don't have to type it every time
lite --provider gemini --model gemini-2.0-flash --save-config
```

---

## Configuration File

Stored at `~/.lite-agent/config.json`. Create manually or use `--save-config`.

```json
{
  "provider": "anthropic",
  "model": "claude-opus-4-6",
  "permissionMode": "ask",
  "systemPromptExtra": "Always prefer TypeScript. Use pnpm, not npm."
}
```

**Priority order** (highest wins):
1. CLI flags (`--provider`, `--model`, etc.)
2. `LITE_*` environment variables
3. Provider-specific env vars (`ANTHROPIC_API_KEY`, etc.)
4. `~/.lite-agent/config.json`
5. Built-in defaults

---

## Session Commands

While in the interactive REPL:

| Command | Action |
|---|---|
| `/clear` | Clear conversation history (start fresh) |
| `/history` | Show how many messages are in context |
| `/help` | Show available commands |
| `/exit` or `/quit` | Exit |
| `Ctrl+C` | Exit |

---

## Available Tools

The agent can use these tools to complete tasks:

| Tool | What it does |
|---|---|
| `bash` | Run any shell command |
| `read_file` | Read a file with line numbers; supports `offset` and `limit` |
| `write_file` | Create or overwrite a file |
| `edit_file` | Find-and-replace within a file (safe: requires unique match) |
| `glob` | Find files by pattern (`**/*.ts`, `src/**/*.{js,ts}`) |
| `grep` | Search file contents with regex (uses ripgrep if available) |

---

## Permission Modes

**`ask` (default)**: Prompts before:
- Destructive shell commands (`rm -rf`, `dd if=`, etc.)
- File writes and edits

**`auto`**: Never prompts. Use for scripting or when you trust the task fully.
```bash
lite --auto "refactor all imports to use absolute paths"
```

Set permanently in config:
```json
{ "permissionMode": "auto" }
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `LITE_PROVIDER` | Provider name (overrides config) |
| `LITE_MODEL` | Model name (overrides config) |
| `LITE_API_KEY` | API key for any provider |
| `LITE_BASE_URL` | Custom base URL |
| `LITE_AUTO` | Set to `true` for auto-approve mode |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GROQ_API_KEY` | Groq API key |
| `MISTRAL_API_KEY` | Mistral API key |

---

## Running Tests

```bash
npm test
# or individually:
npx tsx --test src/tests/tools.test.ts
npx tsx --test src/tests/agent.test.ts
npx tsx --test src/tests/providers.test.ts
```

Tests use Node.js 18+'s built-in `node:test` runner — no extra test framework needed.

---

## Example Workflows

### Explore a codebase
```
> what's the overall architecture of this project?
> find all TypeScript files that export a class
> show me how authentication works
```

### Make a code change
```
> read src/utils/format.ts
> add a formatDate function that takes a Date and returns ISO string
> run the tests to make sure nothing broke
```

### Debug a failing test
```
> run npm test and show me what failed
> read the failing test file
> fix the bug
> run the tests again
```

### Git workflow
```
> show me what changed since the last commit
> stage all changes and write a commit message
> push to origin
```

---

## Adding a New Provider

1. Implement `LLMProvider` in `src/providers/yourprovider.ts`:

```typescript
import type { LLMProvider, CompletionParams, StreamChunk } from '../types.js'

export class YourProvider implements LLMProvider {
  readonly name = 'yourprovider'

  async *stream(params: CompletionParams): AsyncGenerator<StreamChunk> {
    // 1. Convert params.messages to your API's format
    // 2. Make streaming API call
    // 3. Yield StreamChunk events:
    //    { type: 'text', text: '...' }
    //    { type: 'tool_use', toolCall: { id, name, input } }
    //    { type: 'done', stopReason: 'end_turn' }
  }
}
```

2. Register it in `src/providers/index.ts`:

```typescript
case 'yourprovider':
  return new YourProvider(config.apiKey)
```

3. Use it:

```bash
lite --provider yourprovider --model your-model-name
```

---

## Adding a New Tool

```typescript
// src/tools/mytool.ts
import type { Tool } from '../types.js'

export const myTool: Tool = {
  name: 'my_tool',
  description: 'Clear description of what this tool does and when to use it.',
  parameters: {
    type: 'object',
    properties: {
      value: { type: 'string', description: 'Input description' },
    },
    required: ['value'],
  },
  formatInput(input) {
    return input['value'] as string  // shown as: [my_tool] the-value
  },
  async execute(input, ctx) {
    // ctx.workingDir — current directory
    // ctx.confirm(prompt) — ask user for Y/N
    return { content: 'result string' }
    // or: return { content: 'error message', isError: true }
  },
}
```

Register in `src/tools/index.ts`:
```typescript
import { myTool } from './mytool.js'
export function getAllTools() {
  return [bashTool, readTool, writeTool, editTool, globTool, grepTool, myTool]
}
```

---

## Architecture

See [DESIGN.md](./DESIGN.md) for the full architecture document.

```
src/
├── index.ts          CLI entrypoint + readline REPL
├── agent.ts          Core agent loop (stream → tools → loop)
├── types.ts          Shared types (Message, Tool, LLMProvider, ...)
├── config.ts         Config file + env var loading
├── context.ts        System context (git status, cwd, OS)
├── providers/
│   ├── anthropic.ts  Anthropic/Claude (streaming tool calls)
│   ├── openai.ts     OpenAI-compatible (covers Gemini, Groq, Ollama, ...)
│   └── index.ts      Provider factory
└── tools/
    ├── bash.ts       Shell execution
    ├── read.ts       File reading with line numbers
    ├── write.ts      File writing/creation
    ├── edit.ts       Find-and-replace edits
    ├── glob.ts       File pattern matching
    ├── grep.ts       Content search (ripgrep/grep)
    └── index.ts      Tool registry
```
