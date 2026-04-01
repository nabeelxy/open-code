import { stat } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const MAX_FILE_BYTES = 1024 * 1024; // 1 MB
const MAX_LINES = 2000;
export const readTool = {
    name: 'read_file',
    description: 'Read the contents of a file. Returns text with line numbers. Use offset and limit to read sections of large files. Always read a file before editing it.',
    parameters: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'Path to the file (absolute or relative to working directory)',
            },
            offset: {
                type: 'number',
                description: 'Line number to start reading from (1-indexed, default: 1)',
            },
            limit: {
                type: 'number',
                description: `Maximum number of lines to return (default: ${MAX_LINES})`,
            },
        },
        required: ['path'],
    },
    formatInput(input) {
        return input['path'];
    },
    async execute(input, ctx) {
        const filePath = resolve(ctx.workingDir, input['path']);
        const requestedOffset = Math.max(0, (input['offset'] ?? 1) - 1);
        const requestedLimit = Math.min(input['limit'] ?? MAX_LINES, MAX_LINES);
        let stats;
        try {
            stats = await stat(filePath);
        }
        catch {
            return { content: `File not found: ${filePath}`, isError: true };
        }
        if (!stats.isFile()) {
            return { content: `Not a file: ${filePath}`, isError: true };
        }
        if (stats.size > MAX_FILE_BYTES) {
            return {
                content: `File is too large (${Math.round(stats.size / 1024)} KB). ` +
                    `Use offset and limit to read specific sections.`,
                isError: false,
            };
        }
        let raw;
        try {
            raw = await readFile(filePath, 'utf8');
        }
        catch (err) {
            const e = err;
            return { content: `Error reading file: ${e.message}`, isError: true };
        }
        const lines = raw.split('\n');
        const slice = lines.slice(requestedOffset, requestedOffset + requestedLimit);
        const padWidth = String(lines.length).length;
        const numbered = slice
            .map((line, i) => `${String(requestedOffset + i + 1).padStart(padWidth)} | ${line}`)
            .join('\n');
        const remaining = lines.length - requestedOffset - requestedLimit;
        const footer = remaining > 0
            ? `\n\n... ${remaining} more lines (use offset=${requestedOffset + requestedLimit + 1} to continue)`
            : '';
        return { content: `File: ${filePath}\n\n${numbered}${footer}` };
    },
};
//# sourceMappingURL=read.js.map