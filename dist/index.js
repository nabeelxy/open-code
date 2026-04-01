#!/usr/bin/env node
import * as readline from 'node:readline';
import { Command } from 'commander';
import chalk from 'chalk';
import { runAgent } from './agent.js';
import { loadConfig, saveConfig } from './config.js';
import { getSystemContext } from './context.js';
import { createProvider } from './providers/index.js';
import { getAllTools } from './tools/index.js';
const VERSION = '0.1.0';
// ─── CLI setup ────────────────────────────────────────────────────────────────
const program = new Command();
program
    .name('open-code')
    .description('Lightweight vendor-agnostic coding agent')
    .version(VERSION)
    .option('-p, --provider <name>', 'LLM provider (anthropic, openai, gemini, groq, ollama, ...)')
    .option('-m, --model <name>', 'Model to use')
    .option('-k, --api-key <key>', 'API key')
    .option('--base-url <url>', 'Base URL for OpenAI-compatible providers')
    .option('--auto', 'Auto-approve all tool calls including destructive commands (no prompts)')
    .option('--auto-mode', 'Auto-approve file reads/writes; still prompt for destructive shell commands')
    .option('-c, --config <path>', 'Path to config file')
    .option('--save-config', 'Save current flags to ~/.open-code/config.json and exit')
    .argument('[prompt...]', 'Run a single prompt non-interactively and exit');
program.parse();
// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const opts = program.opts();
    const promptArgs = program.args;
    const config = await loadConfig(opts.config);
    // CLI flags override config
    if (opts.provider)
        config.provider = opts.provider;
    if (opts.model)
        config.model = opts.model;
    if (opts.apiKey)
        config.apiKey = opts.apiKey;
    if (opts.baseUrl)
        config.baseUrl = opts.baseUrl;
    if (opts.auto)
        config.permissionMode = 'auto';
    if (opts.autoMode)
        config.permissionMode = 'permissive';
    // --save-config: write current merged config and exit
    if (opts.saveConfig) {
        await saveConfig(config);
        console.log(chalk.green(`Config saved to ~/.open-code/config.json`));
        process.exit(0);
    }
    // Validate we have an API key where needed
    if (config.provider !== 'ollama' && config.provider !== 'vertex' && !config.apiKey) {
        console.error(chalk.red(`No API key found for provider '${config.provider}'.\n` +
            `Set ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, ` +
            `or LITE_API_KEY, or use --api-key.\n` +
            `For Ollama (local), use --provider ollama.`));
        process.exit(1);
    }
    let provider;
    try {
        provider = createProvider(config);
    }
    catch (err) {
        console.error(chalk.red(`Provider error: ${err.message}`));
        process.exit(1);
    }
    const tools = getAllTools();
    const cwd = process.cwd();
    const systemContext = await getSystemContext(cwd);
    const messages = [];
    // ── Build readline interface for REPL + confirmations ─────────────────────
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
    });
    // Confirmation function: briefly resumes rl for a Y/N answer
    const confirm = async (prompt) => {
        if (config.permissionMode === 'auto')
            return true;
        return new Promise(resolve => {
            rl.resume();
            rl.question(chalk.yellow(`\n⚠  ${prompt} [y/N] `), answer => {
                rl.pause();
                resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
            });
        });
    };
    const agentCtx = {
        provider,
        tools,
        messages,
        systemPrompt: buildSystemPrompt(systemContext, config.systemPromptExtra),
        model: config.model,
        maxTokens: config.maxTokens ?? 8192,
        toolCtx: {
            workingDir: cwd,
            permissionMode: config.permissionMode ?? 'ask',
            confirm,
        },
    };
    // ── Non-interactive: single prompt then exit ───────────────────────────────
    if (promptArgs.length > 0) {
        const prompt = promptArgs.join(' ');
        printHeader(config);
        try {
            await runAgent(prompt, agentCtx, text => process.stdout.write(text));
            console.log();
        }
        catch (err) {
            console.error(chalk.red(`\nError: ${err.message}`));
            process.exit(1);
        }
        rl.close();
        process.exit(0);
    }
    // ── Interactive REPL ───────────────────────────────────────────────────────
    printHeader(config);
    console.log(chalk.dim(`Type your message. Commands: /clear  /help  /exit  Ctrl+C\n`));
    rl.setPrompt(chalk.cyan('> '));
    rl.prompt();
    rl.on('line', async (line) => {
        const input = line.trim();
        if (!input) {
            rl.prompt();
            return;
        }
        // Slash commands and bare exit words
        if (input.startsWith('/')) {
            handleSlashCommand(input, messages, rl);
            return;
        }
        const lower = input.toLowerCase();
        if (lower === 'exit' || lower === 'quit' || lower === 'q' || lower === 'bye') {
            console.log(chalk.dim('Goodbye!'));
            process.exit(0);
        }
        rl.pause();
        console.log();
        try {
            await runAgent(input, agentCtx, text => process.stdout.write(text));
            console.log('\n');
        }
        catch (err) {
            console.error(chalk.red(`\nError: ${err.message}\n`));
        }
        finally {
            rl.resume();
            rl.prompt();
        }
    });
    rl.on('close', () => {
        console.log(chalk.dim('\nGoodbye!'));
        process.exit(0);
    });
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function printHeader(config) {
    console.log(chalk.bold.blue('open-code') +
        chalk.dim(` v${VERSION}`) +
        '  ' +
        chalk.dim(`${config.provider} / ${config.model}`) +
        (config.permissionMode === 'auto'
            ? '  ' + chalk.yellow('[auto]')
            : config.permissionMode === 'permissive'
                ? '  ' + chalk.yellow('[auto-mode]')
                : ''));
    console.log(chalk.dim(`cwd: ${process.cwd()}`));
    console.log();
}
function handleSlashCommand(input, messages, rl) {
    const cmd = input.split(' ')[0]?.toLowerCase();
    switch (cmd) {
        case '/exit':
        case '/quit':
        case '/q':
            console.log(chalk.dim('Goodbye!'));
            rl.close();
            process.exit(0);
            break;
        case '/clear':
            messages.length = 0;
            console.log(chalk.dim('Conversation cleared.\n'));
            break;
        case '/history':
            if (messages.length === 0) {
                console.log(chalk.dim('No messages yet.\n'));
            }
            else {
                console.log(chalk.dim(`${messages.length} messages in history.\n`));
            }
            break;
        case '/help':
            console.log(chalk.dim(`
Commands:
  /clear    Clear conversation history
  /history  Show message count
  /exit     Exit (also: /quit, /q, Ctrl+C)
  /help     Show this help

Tips:
  - Ask me to read, write, or edit any file
  - Ask me to run shell commands or tests
  - Ask me to search code with grep or glob patterns
  - I remember context within a session (/clear to reset)
`));
            break;
        default:
            console.log(chalk.dim(`Unknown command: ${cmd}. Type /help for commands.\n`));
    }
    rl.prompt();
}
function buildSystemPrompt(systemContext, extra) {
    const base = `You are a helpful, concise coding assistant running in the terminal. You help with software engineering tasks: reading and writing files, running commands, searching codebases, debugging, and making code changes.

${systemContext}

Guidelines:
- Be concise. Skip preamble and unnecessary explanation.
- Always read a file before editing it.
- Prefer small targeted edits over large rewrites.
- When running commands, show the user what you're doing.
- If something is unclear, ask before acting.
- When you make changes, briefly summarize what you did.`;
    return extra ? `${base}\n\nAdditional instructions:\n${extra}` : base;
}
// ─── Entry point ──────────────────────────────────────────────────────────────
main().catch(err => {
    console.error(chalk.red(`Fatal: ${err.message}`));
    process.exit(1);
});
//# sourceMappingURL=index.js.map