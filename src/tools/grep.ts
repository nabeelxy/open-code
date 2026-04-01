import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import type { Tool } from '../types.js'

const execAsync = promisify(exec)
const MAX_OUTPUT_LINES = 500

/** Returns true if `rg` (ripgrep) is available on PATH */
async function hasRipgrep(): Promise<boolean> {
  try {
    await execAsync('rg --version')
    return true
  } catch {
    return false
  }
}

export const grepTool: Tool = {
  name: 'grep',
  description:
    'Search for a regex pattern in files. Uses ripgrep (rg) when available, otherwise falls back to grep. Returns matching lines with file paths and line numbers.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression to search for',
      },
      path: {
        type: 'string',
        description: 'File or directory to search (default: working directory)',
      },
      glob: {
        type: 'string',
        description: 'File pattern filter (e.g., "*.ts", "*.{js,ts}")',
      },
      case_insensitive: {
        type: 'boolean',
        description: 'Perform case-insensitive search (default: false)',
      },
      context: {
        type: 'number',
        description: 'Number of context lines to show around each match',
      },
    },
    required: ['pattern'],
  },
  formatInput(input) {
    const path = input['path'] ? ` in ${input['path']}` : ''
    return `"${input['pattern'] as string}"${path}`
  },
  async execute(input, ctx) {
    const pattern = input['pattern'] as string
    const searchPath = input['path']
      ? resolve(ctx.workingDir, input['path'] as string)
      : ctx.workingDir
    const fileGlob = input['glob'] as string | undefined
    const caseFlag = input['case_insensitive'] ? '-i' : ''
    const contextFlag = input['context'] ? `-C ${input['context'] as number}` : ''

    const useRg = await hasRipgrep()
    let cmd: string

    if (useRg) {
      const globFlag = fileGlob ? `--glob ${JSON.stringify(fileGlob)}` : ''
      cmd = [
        'rg',
        '--line-number',
        '--no-heading',
        '--color=never',
        caseFlag,
        contextFlag,
        globFlag,
        '-e',
        JSON.stringify(pattern),
        JSON.stringify(searchPath),
      ]
        .filter(Boolean)
        .join(' ')
    } else {
      const includeFlag = fileGlob ? `--include=${JSON.stringify(fileGlob)}` : ''
      cmd = [
        'grep',
        '-r',
        '-n',
        '--color=never',
        caseFlag,
        contextFlag,
        includeFlag,
        '-e',
        JSON.stringify(pattern),
        JSON.stringify(searchPath),
      ]
        .filter(Boolean)
        .join(' ')
    }

    try {
      const { stdout } = await execAsync(cmd, {
        cwd: ctx.workingDir,
        maxBuffer: 5 * 1024 * 1024, // 5 MB
      })

      const lines = stdout.trim().split('\n').filter(Boolean)
      if (lines.length === 0) return { content: 'No matches found.' }

      const truncated = lines.slice(0, MAX_OUTPUT_LINES)
      const footer =
        lines.length > MAX_OUTPUT_LINES
          ? `\n... ${lines.length - MAX_OUTPUT_LINES} more matches (refine your pattern)`
          : ''

      return { content: truncated.join('\n') + footer }
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string; stderr?: string }
      // Exit code 1 = no matches (both rg and grep)
      if (e.code === 1) return { content: 'No matches found.' }
      return { content: `Search error: ${e.stderr ?? e.message}`, isError: true }
    }
  },
}
