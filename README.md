# open-code

A lightweight, vendor-agnostic coding agent for your terminal. Supports Claude, Gemini (including Vertex AI), GPT-4, Groq, Ollama, and any OpenAI-compatible API.

~1,600 lines of TypeScript (plus ~650 lines of tests). No framework. No build system required for development.

---

## Installation

```bash
git clone <repo>
cd open-code
npm install -g .   # builds TypeScript and links the 'open-code' binary globally
```

Then use from anywhere:

```bash
open-code
open-code --provider gemini "refactor this file"
```

### Dev mode (no global install)

```bash
npm install
npx tsx src/index.ts
```

---

## Quick Start

```bash
# With Claude (Anthropic)
ANTHROPIC_API_KEY=sk-ant-... open-code

# With Gemini
GEMINI_API_KEY=AI... open-code --provider gemini

# With GPT-4
OPENAI_API_KEY=sk-... open-code --provider openai --model gpt-4o

# With Groq (fast, free tier available)
GROQ_API_KEY=gsk_... open-code --provider groq

# With Vertex AI (uses gcloud Application Default Credentials)
open-code --provider vertex --model gemini-2.5-pro

# With Ollama (local, no API key needed)
open-code --provider ollama --model qwen2.5-coder:7b

# Single prompt (non-interactive)
ANTHROPIC_API_KEY=sk-ant-... open-code "explain what this repo does"
```

---

## Supported Providers

| Provider | Flag | API Key Env Var | Default Model |
|---|---|---|---|
| Anthropic Claude | `--provider anthropic` | `ANTHROPIC_API_KEY` | `claude-opus-4-6` |
| OpenAI | `--provider openai` | `OPENAI_API_KEY` | `gpt-4o` |
| Google Gemini | `--provider gemini` | `GEMINI_API_KEY` | `gemini-2.0-flash` |
| Google Vertex AI | `--provider vertex` | *(gcloud ADC)* | `gemini-2.0-flash` |
| Groq | `--provider groq` | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| Mistral | `--provider mistral` | `MISTRAL_API_KEY` | `mistral-large-latest` |
| Together AI | `--provider together` | `TOGETHER_API_KEY` | `meta-llama/Llama-3-70b-chat-hf` |
| Ollama (local) | `--provider ollama` | *(none needed)* | `qwen2.5-coder:7b` |
| Any OpenAI-compat | `--base-url <URL>` | `LITE_API_KEY` | *(set `--model`)* |

### Vertex AI setup

Vertex AI uses [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials) — no API key needed.

```bash
gcloud auth application-default login
open-code --provider vertex --model gemini-2.5-pro

# Or set project explicitly:
VERTEX_PROJECT=my-project open-code --provider vertex
VERTEX_LOCATION=us-east4 open-code --provider vertex   # default: us-central1
```

---

## CLI Reference

```
open-code [options] [prompt...]

Options:
  -p, --provider <name>   LLM provider (anthropic, openai, gemini, vertex, groq, ollama, ...)
  -m, --model <name>      Model to use
  -k, --api-key <key>     API key (overrides env vars)
  --base-url <url>        Base URL for OpenAI-compatible endpoints
  --auto                  Auto-approve all tool calls including destructive commands (no prompts)
  --auto-mode             Auto-approve file reads/writes; still prompt for destructive shell commands
  -c, --config <path>     Path to config file (default: ~/.open-code/config.json)
  --save-config           Save current flags to config file and exit
  -V, --version           Print version
  -h, --help              Show help
```

### Examples

```bash
# Interactive REPL
open-code

# Single-shot with a specific model
open-code -p anthropic -m claude-haiku-4-5-20251001 "what files are in src/?"

# Auto-approve file reads/writes (bash destructive commands still prompt)
open-code --auto-mode "update all import paths"

# Skip all confirmation prompts (useful for scripting)
open-code --auto "add a README to this project"

# Custom OpenAI-compatible endpoint (e.g. LM Studio)
open-code --base-url http://localhost:1234/v1 --model your-model

# Save provider preference so you don't have to type it every time
open-code --provider gemini --model gemini-2.0-flash --save-config
```

---

## Configuration File

Stored at `~/.open-code/config.json`. Create manually or use `--save-config`.

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
4. `~/.open-code/config.json`
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
| `exit`, `quit`, `q`, `bye` | Exit (bare words also work) |
| `Ctrl+C` | Exit |

---

## Available Tools

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

**`auto-mode`**: Auto-approves file reads/writes; still prompts for destructive shell commands.
```bash
open-code --auto-mode "update all import paths to use absolute paths"
```

**`auto`**: Never prompts. Use for scripting or when you trust the task fully.
```bash
open-code --auto "refactor all imports to use absolute paths"
```

Set permanently in config:
```json
{ "permissionMode": "auto-mode" }
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `LITE_PROVIDER` | Provider name (overrides config) |
| `LITE_MODEL` | Model name (overrides config) |
| `LITE_API_KEY` | API key for any provider |
| `LITE_BASE_URL` | Custom base URL |
| `LITE_AUTO` | Set to `true` for full auto-approve mode |
| `LITE_AUTO_MODE` | Set to `true` for auto-approve file ops only |
| `VERTEX_PROJECT` | GCP project ID for Vertex AI |
| `VERTEX_LOCATION` | GCP region for Vertex AI (default: `us-central1`) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GROQ_API_KEY` | Groq API key |
| `MISTRAL_API_KEY` | Mistral API key |
| `TOGETHER_API_KEY` | Together AI API key |

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
open-code --provider yourprovider --model your-model-name
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
│   ├── anthropic.ts  Anthropic/Claude (native SDK, streaming tool calls)
│   ├── openai.ts     OpenAI-compatible (Gemini, Groq, Ollama, Mistral, ...)
│   ├── vertex.ts     Google Vertex AI (native @google/genai SDK, ADC auth)
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
