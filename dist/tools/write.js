import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
export const writeTool = {
    name: 'write_file',
    description: 'Write content to a file, creating it if it does not exist and overwriting it if it does. Creates parent directories automatically. Read the file first before overwriting existing files.',
    parameters: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'Path to write to (absolute or relative to working directory)',
            },
            content: {
                type: 'string',
                description: 'Full content to write to the file',
            },
        },
        required: ['path', 'content'],
    },
    formatInput(input) {
        return input['path'];
    },
    async execute(input, ctx) {
        const filePath = resolve(ctx.workingDir, input['path']);
        const content = input['content'];
        if (ctx.permissionMode === 'ask') {
            const ok = await ctx.confirm(`Write to ${filePath}?`);
            if (!ok) {
                return { content: 'Write denied by user.', isError: true };
            }
        }
        try {
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, content, 'utf8');
            const lines = content.split('\n').length;
            return { content: `Written: ${filePath} (${lines} lines)` };
        }
        catch (err) {
            const e = err;
            return { content: `Error writing file: ${e.message}`, isError: true };
        }
    },
};
//# sourceMappingURL=write.js.map