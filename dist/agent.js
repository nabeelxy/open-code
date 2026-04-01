import chalk from 'chalk';
const MAX_TURNS = 50;
/**
 * Run one user turn through the agent loop.
 *
 * Streams the LLM response to stdout in real-time. Executes tool calls
 * and feeds results back until the model stops calling tools.
 *
 * @param userInput - The user's message
 * @param ctx - Shared agent context (messages array is mutated)
 * @param onText - Called with each text chunk as it streams
 */
export async function runAgent(userInput, ctx, onText) {
    ctx.messages.push({ role: 'user', content: userInput });
    for (let turn = 0; turn < MAX_TURNS; turn++) {
        const toolCalls = [];
        let textBuffer = '';
        // ── Stream from LLM ────────────────────────────────────────────────────
        for await (const chunk of ctx.provider.stream({
            messages: ctx.messages,
            tools: ctx.tools.map(t => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            })),
            systemPrompt: ctx.systemPrompt,
            model: ctx.model,
            maxTokens: ctx.maxTokens,
        })) {
            if (chunk.type === 'text' && chunk.text) {
                onText(chunk.text);
                textBuffer += chunk.text;
            }
            else if (chunk.type === 'tool_use' && chunk.toolCall) {
                toolCalls.push(chunk.toolCall);
            }
            else if (chunk.type === 'error') {
                onText(chalk.red(`\nProvider error: ${chunk.error}\n`));
                return;
            }
        }
        // ── Persist assistant turn ─────────────────────────────────────────────
        const assistantContent = [];
        if (textBuffer)
            assistantContent.push({ type: 'text', text: textBuffer });
        for (const tc of toolCalls) {
            assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        }
        ctx.messages.push({ role: 'assistant', content: assistantContent });
        // ── No tool calls → model is done ─────────────────────────────────────
        if (toolCalls.length === 0)
            break;
        // ── Execute tools ──────────────────────────────────────────────────────
        onText('\n');
        const toolResults = [];
        for (const tc of toolCalls) {
            const tool = ctx.tools.find(t => t.name === tc.name);
            if (!tool) {
                onText(chalk.dim(`[${tc.name}] `) + chalk.red('✗ unknown tool\n'));
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: tc.id,
                    content: `Error: tool '${tc.name}' is not available.`,
                    is_error: true,
                });
                continue;
            }
            // Display what's being executed
            const label = tool.formatInput ? tool.formatInput(tc.input) : '';
            process.stdout.write(chalk.dim(`[${tc.name}]`) + (label ? ` ${chalk.cyan(label)}` : '') + ' ');
            try {
                const result = await tool.execute(tc.input, ctx.toolCtx);
                process.stdout.write(result.isError ? chalk.red('✗') : chalk.green('✓'));
                process.stdout.write('\n');
                // Show tool output to the user (trimmed to avoid walls of text)
                if (result.content && result.content !== '(no output)') {
                    const lines = result.content.split('\n');
                    const preview = lines.length > 20
                        ? lines.slice(0, 20).join('\n') + chalk.dim(`\n... (${lines.length - 20} more lines)`)
                        : result.content;
                    process.stdout.write(chalk.dim(preview) + '\n\n');
                }
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: tc.id,
                    content: result.content,
                    is_error: result.isError,
                });
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                process.stdout.write(chalk.red('✗\n'));
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: tc.id,
                    content: `Unexpected error: ${msg}`,
                    is_error: true,
                });
            }
        }
        // Feed tool results back to the model
        ctx.messages.push({ role: 'user', content: toolResults });
    }
}
//# sourceMappingURL=agent.js.map