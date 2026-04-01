import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Tool } from '../types.js'

export const editTool: Tool = {
  name: 'edit_file',
  description:
    'Edit a file by replacing an exact string with new text. The old_string must match exactly (including whitespace and indentation). If old_string appears multiple times, use replace_all: true or add more context to make it unique. Always read the file first.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit',
      },
      old_string: {
        type: 'string',
        description: 'The exact text to find and replace',
      },
      new_string: {
        type: 'string',
        description: 'The text to replace it with',
      },
      replace_all: {
        type: 'boolean',
        description: 'Replace all occurrences instead of requiring exactly one (default: false)',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  formatInput(input) {
    return input['path'] as string
  },
  async execute(input, ctx) {
    const filePath = resolve(ctx.workingDir, input['path'] as string)
    const oldString = input['old_string'] as string
    const newString = input['new_string'] as string
    const replaceAll = (input['replace_all'] as boolean | undefined) ?? false

    let content: string
    try {
      content = await readFile(filePath, 'utf8')
    } catch {
      return { content: `File not found: ${filePath}`, isError: true }
    }

    const occurrences = content.split(oldString).length - 1

    if (occurrences === 0) {
      // Provide a helpful excerpt to understand what's in the file
      const firstLines = content.split('\n').slice(0, 5).join('\n')
      return {
        content:
          `old_string not found in ${filePath}.\n\n` +
          `The string you searched for:\n${oldString}\n\n` +
          `First lines of file:\n${firstLines}`,
        isError: true,
      }
    }

    if (occurrences > 1 && !replaceAll) {
      return {
        content:
          `old_string appears ${occurrences} times in ${filePath}. ` +
          `Add more surrounding context to make it unique, or set replace_all: true.`,
        isError: true,
      }
    }

    const updated = replaceAll
      ? content.split(oldString).join(newString)
      : content.replace(oldString, newString)

    if (ctx.permissionMode === 'ask') {
      const ok = await ctx.confirm(`Edit ${filePath}?`)
      if (!ok) {
        return { content: 'Edit denied by user.', isError: true }
      }
    }

    try {
      await writeFile(filePath, updated, 'utf8')
      const oldLines = content.split('\n').length
      const newLines = updated.split('\n').length
      const delta = newLines - oldLines
      const sign = delta >= 0 ? '+' : ''
      return {
        content: `Edited ${filePath} (${sign}${delta} lines, ${occurrences} replacement${occurrences > 1 ? 's' : ''})`,
      }
    } catch (err: unknown) {
      const e = err as { message: string }
      return { content: `Error writing file: ${e.message}`, isError: true }
    }
  },
}
