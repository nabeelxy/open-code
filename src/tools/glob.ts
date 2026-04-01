import { glob } from 'glob'
import { resolve } from 'node:path'
import type { Tool } from '../types.js'

const MAX_RESULTS = 200

export const globTool: Tool = {
  name: 'glob',
  description:
    'Find files matching a glob pattern. Returns a sorted list of matching paths relative to the search directory. Use this to explore the project structure or find specific file types.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description:
          'Glob pattern to match (e.g., "**/*.ts", "src/**/*.{js,ts}", "*.json")',
      },
      cwd: {
        type: 'string',
        description:
          'Directory to search from (default: working directory)',
      },
    },
    required: ['pattern'],
  },
  formatInput(input) {
    return input['pattern'] as string
  },
  async execute(input, ctx) {
    const pattern = input['pattern'] as string
    const searchDir = input['cwd']
      ? resolve(ctx.workingDir, input['cwd'] as string)
      : ctx.workingDir

    try {
      const files = await glob(pattern, {
        cwd: searchDir,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
      })

      if (files.length === 0) {
        return { content: `No files found matching: ${pattern}` }
      }

      const sorted = [...files].sort()
      const truncated = sorted.slice(0, MAX_RESULTS)
      const footer =
        sorted.length > MAX_RESULTS
          ? `\n... and ${sorted.length - MAX_RESULTS} more (pattern is too broad)`
          : ''

      return {
        content: `${truncated.length} file(s) found:\n${truncated.join('\n')}${footer}`,
      }
    } catch (err: unknown) {
      const e = err as { message: string }
      return { content: `Glob error: ${e.message}`, isError: true }
    }
  },
}
