import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { Tool } from '../types.js'

export const writeTool: Tool = {
  name: 'write_file',
  description:
    'Write content to a file, creating it if it does not exist and overwriting it if it does. Creates parent directories automatically. Read the file first before overwriting existing files.',
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
    return input['path'] as string
  },
  async execute(input, ctx) {
    const filePath = resolve(ctx.workingDir, input['path'] as string)
    const content = input['content'] as string

    if (ctx.permissionMode === 'ask') {
      const ok = await ctx.confirm(`Write to ${filePath}?`)
      if (!ok) {
        return { content: 'Write denied by user.', isError: true }
      }
    }

    try {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, content, 'utf8')
      const lines = content.split('\n').length
      return { content: `Written: ${filePath} (${lines} lines)` }
    } catch (err: unknown) {
      const e = err as { message: string }
      return { content: `Error writing file: ${e.message}`, isError: true }
    }
  },
}
