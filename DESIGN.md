# lite-agent — Design Document

## 1. Why This Exists

Claude Code is ~512k lines of production TypeScript built exclusively around the Anthropic SDK. It bundles React/Ink for terminal rendering, GrowthBook for feature flags, LSP integration, MCP protocol, multi-agent orchestration, voice input, OAuth, MDM policy, and dozens of other enterprise features.

**lite-agent** extracts the essential 5% — the agentic coding loop — and rebuilds it to be:

- **Vendor-agnostic**: Claude, Gemini, GPT-4, Groq, Ollama, or any OpenAI-compatible endpoint
- **~1,400 lines**: vs. 512,000 in the original
- **Zero build tooling required**: `npx tsx src/index.ts` works out of the box
- **Fully functional**: reads/writes/edits files, runs shell commands, searches codebases

---

## 2. What We Stripped From Claude Code

| Feature | Why Removed |
|---|---|
| React + Ink terminal UI | Pure stdout is simpler and universal |
| MCP protocol | Out of scope for a lightweight agent |
| LSP integration | IDE-specific, not needed for CLI |
| Multi-agent orchestration | Complexity without proportional value |
| GrowthBook feature flags | Replaced by simple env var config |
| Bun `bun:bundle` dead code elimination | Use plain TypeScript modules |
| OAuth + Keychain + JWT | Use env var API keys |
| MDM / enterprise policy | Not needed for personal/dev use |
| Context compaction strategies | Simple message history is enough |
| Voice input | Out of scope |
| Skills / plugin system | Can be added later |
| File history snapshots | Not essential |
| Sandboxed execution | Trust the user |
| Cost tracking | Out of scope |
| Session persistence | Start fresh each run |
| Image / PDF reading | Text files only (simplest case) |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      CLI (index.ts)                      │
│   Commander.js args  │  readline REPL  │  streaming out  │
└──────────────────────────────┬──────────────────────────┘
                               │
                        ┌──────▼──────┐
                        │  Agent Loop  │
                        │  (agent.ts)  │
                        └──────┬───────┘
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌────────────────┐  ┌──────────┐  ┌───────────────┐
     │ LLMProvider    │  │  Tools   │  │    Context    │
     │  (providers/)  │  │ (tools/) │  │  (context.ts) │
     └────────────────┘  └──────────┘  └───────────────┘
              │
    ┌─────────┴──────────┐
    │ AnthropicProvider  │  ← uses @anthropic-ai/sdk
    │ OpenAIProvider     │  ← uses openai (covers OpenAI, Gemini,
    └────────────────────┘    Groq, Ollama, Mistral, Together...)
```

---

## 4. Core Abstractions

### 4.1 Normalized Message Format

The internal message format mirrors Anthropic's content-block approach (since it natively supports tool_use/tool_result in content arrays). OpenAI's format is more restrictive (tool results must be separate `tool` role messages), so we normalize everything to Anthropic-style internally and convert outward.

```typescript
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

interface Message {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}
```

### 4.2 Provider Interface

```typescript
interface LLMProvider {
  readonly name: string
  stream(params: CompletionParams): AsyncGenerator<StreamChunk>
}

interface StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolCall: { id: string; name: string; input: Record<string, unknown> } }
  | { type: 'done'; stopReason: 'end_turn' | 'tool_use' | 'max_tokens' }
  | { type: 'error'; error: string }
```

Each provider's `stream()` is responsible for:
1. Converting normalized messages → provider wire format
2. Making the streaming API call
3. Accumulating streamed tool input JSON (both Anthropic and OpenAI stream tool args as partial JSON chunks)
4. Yielding normalized `StreamChunk` events

### 4.3 Tool Interface

```typescript
interface Tool {
  name: string
  description: string
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
  formatInput?(input: Record<string, unknown>): string  // human-readable label
}

interface ToolContext {
  workingDir: string
  permissionMode: 'ask' | 'auto'
  confirm(prompt: string): Promise<boolean>
}

interface ToolResult {
  content: string
  isError?: boolean
}
```

Tools are pure: they receive input + context, return a result string. No React, no streaming, no complex state.

### 4.4 Agent Loop

```
while (turns < MAX_TURNS):
  1. Stream completion from LLM
     - Yield 'text' chunks → write to stdout immediately
     - Accumulate 'tool_use' chunks
  2. Build AssistantMessage from text + tool_use blocks
  3. If no tool_use → done (model is responding conversationally)
  4. For each tool_use:
     a. Find matching Tool by name
     b. Display "[tool_name] arg..." to user
     c. Check permission if needed (destructive commands)
     d. Execute tool, get ToolResult
     e. Display ✓ or ✗
  5. Build user message with tool_result blocks
  6. Loop back to step 1
```

---

## 5. Provider Details

### 5.1 Anthropic (Claude)

Uses `@anthropic-ai/sdk` directly. The SDK's streaming API emits:
- `content_block_start` → identifies new tool_use block (name, id)
- `content_block_delta` → `text_delta` or `input_json_delta` (partial JSON)
- `content_block_stop` → parse accumulated JSON, emit normalized `tool_use` chunk
- `message_delta` → `stop_reason` → emit `done` chunk

No message format conversion needed for the tool/result blocks (Anthropic natively uses our format).

### 5.2 OpenAI-Compatible (OpenAI, Gemini, Groq, Ollama, Mistral, Together)

Uses the `openai` npm package with configurable `baseURL`. Covers a huge ecosystem:

| Provider | baseURL |
|---|---|
| OpenAI | `https://api.openai.com/v1` (default) |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| Groq | `https://api.groq.com/openai/v1` |
| Ollama (local) | `http://localhost:11434/v1` |
| Mistral | `https://api.mistral.ai/v1` |
| Together | `https://api.together.xyz/v1` |

**Message conversion** (normalized → OpenAI):

```
normalized user message with tool_results → multiple messages:
  - Each tool_result → { role: 'tool', tool_call_id, content }
  - Text blocks → { role: 'user', content }

normalized assistant message with tool_use → one message:
  - { role: 'assistant', content: text, tool_calls: [...] }
```

**Streaming**: OpenAI streams tool args via `delta.tool_calls[n].function.arguments` chunks. We accumulate these by index until `finish_reason: 'tool_calls'`.

---

## 6. Tool Details

### bash
- Executes shell commands via `child_process.exec`
- 30s default timeout, 10MB output buffer
- Destructive pattern detection (rm -rf, dd, mkfs, etc.) → confirm in `ask` mode
- Shows command before executing

### read_file
- Reads text files with line numbers (`   1 | line content`)
- Supports `offset` + `limit` for large files
- 1MB size guard with helpful message if exceeded

### write_file
- Writes/creates files, creates parent directories automatically
- Confirms before writing in `ask` mode

### edit_file
- Find-and-replace within files
- Validates `old_string` exists exactly once (or use `replace_all: true`)
- Returns clear error if string not found or found multiple times

### glob
- Pattern matching via the `glob` npm package
- Auto-excludes `node_modules` and `.git`
- Up to 200 results

### grep
- Uses `rg` (ripgrep) if available, falls back to `grep`
- Supports regex, case-insensitive, context lines, file type filtering
- Up to 500 result lines

---

## 7. Configuration

Priority order (highest to lowest):
1. CLI flags (`--provider`, `--model`, `--api-key`)
2. Environment variables (`LITE_PROVIDER`, `LITE_MODEL`, `LITE_API_KEY`, etc.)
3. Provider-specific env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`)
4. Config file at `~/.lite-agent/config.json`
5. Provider defaults (model names, base URLs)

### Config File Example

```json
{
  "provider": "anthropic",
  "model": "claude-opus-4-6",
  "permissionMode": "ask",
  "systemPromptExtra": "Always prefer TypeScript over JavaScript."
}
```

### Supported Providers & Default Models

| Provider | Model Default | Notes |
|---|---|---|
| `anthropic` | `claude-opus-4-6` | Requires `ANTHROPIC_API_KEY` |
| `openai` | `gpt-4o` | Requires `OPENAI_API_KEY` |
| `gemini` | `gemini-2.0-flash` | Requires `GEMINI_API_KEY` |
| `groq` | `llama-3.3-70b-versatile` | Requires `GROQ_API_KEY` |
| `ollama` | `qwen2.5-coder:7b` | Local, no key needed |
| custom | *(set `--model`)* | Set `--base-url` for OpenAI-compat |

---

## 8. Permission System

Two modes:
- **`ask`** (default): prompt before destructive bash commands and file writes
- **`auto`**: never prompt (trust the agent, useful in CI or automation)

Set via `--auto` flag, `LITE_AUTO=true` env var, or `"permissionMode": "auto"` in config.

During an agent turn, the main readline interface is paused. Confirmations briefly resume it to capture a `y/N` response, then re-pause.

---

## 9. Adding a New Provider

Implement `LLMProvider` and register in `providers/index.ts`:

```typescript
export class MyProvider implements LLMProvider {
  readonly name = 'myprovider'

  async *stream(params: CompletionParams): AsyncGenerator<StreamChunk> {
    // 1. Convert params.messages to your format
    // 2. Call your API with params.tools formatted as your format
    // 3. Yield StreamChunk events as they arrive
    // 4. Handle tool input streaming/accumulation
  }
}
```

Then add a case in `providers/index.ts`:
```typescript
case 'myprovider':
  return new MyProvider(config.apiKey)
```

---

## 10. Adding a New Tool

```typescript
export const myTool: Tool = {
  name: 'my_tool',
  description: 'What this tool does and when to use it',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'The input value' }
    },
    required: ['input']
  },
  formatInput(input) {
    return input.input as string  // shown as: [my_tool] the-input-value
  },
  async execute(input, ctx) {
    const value = input.input as string
    // ... do work ...
    return { content: 'result string' }
    // or on error:
    return { content: 'error message', isError: true }
  }
}
```

Register in `tools/index.ts`:
```typescript
export function getAllTools(): Tool[] {
  return [bashTool, readTool, writeTool, editTool, globTool, grepTool, myTool]
}
```

---

## 11. Comparison With Claude Code

| Aspect | Claude Code (src/) | lite-agent |
|---|---|---|
| Lines of code | ~512,000 | ~1,400 |
| Dependencies | 50+ | 4 runtime |
| UI framework | React + Ink | Plain stdout / readline |
| LLM providers | Anthropic only | Anthropic + any OpenAI-compatible |
| Terminal rendering | Full Ink tree | Streaming write to stdout |
| Permission system | Complex hooks + UI dialogs | Y/N readline prompt |
| Context compaction | Multiple strategies | Not implemented |
| Tool count | 43 | 6 |
| MCP protocol | Full support | Not implemented |
| IDE integration | VS Code + JetBrains bridge | Not implemented |
| Multi-agent | Agent swarms, coordinators | Not implemented |
| Session persistence | Full history | In-memory per session |
| File history | Snapshots + git integration | Not implemented |
| Image/PDF reading | Full support | Not implemented |
| Startup time | Optimized parallel prefetch | Instant |
| Config | MDM + Keychain + JSON | Env vars + JSON file |

The lite-agent deliberately chooses simplicity over completeness. The 6 core tools and multi-turn streaming loop cover ~90% of real coding agent use cases.
