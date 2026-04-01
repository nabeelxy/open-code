import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { Tool } from '../types.js'

const execAsync = promisify(exec)

const DESTRUCTIVE_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*r[a-zA-Z]*)\b/,  // rm -rf, rm -fr, rm -f
  /\bdd\s+if=/,
  /\bmkfs\b/,
  /\bformat\s/i,
  /\bshred\b/,
  /\bwipefs\b/,
  /\bfdisk\b/,
  />\s*\/dev\//,
  /\bdropdb\b/,
  /\bdrop\s+database\b/i,
]

function isDestructive(cmd: string): boolean {
  return DESTRUCTIVE_PATTERNS.some(p => p.test(cmd))
}

function formatCommand(cmd: string): string {
  return cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd
}

export const bashTool: Tool = {
  name: 'bash',
  description:
    'Execute a shell command and return its output. Use for running scripts, installing packages, running tests, git operations, and any system task. The command runs in the current working directory.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
      },
    },
    required: ['command'],
  },
  formatInput(input) {
    return formatCommand(input['command'] as string)
  },
  async execute(input, ctx) {
    const command = input['command'] as string
    const timeout = (input['timeout'] as number | undefined) ?? 30_000

    if (isDestructive(command)) {
      const ok = await ctx.confirm(`Allow potentially destructive command:\n  ${command}`)
      if (!ok) {
        return { content: 'Command denied by user.', isError: true }
      }
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: ctx.workingDir,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      })

      const parts = [stdout.trim(), stderr.trim()].filter(Boolean)
      return { content: parts.join('\n') || '(no output)' }
    } catch (err: unknown) {
      const e = err as { code?: number; stderr?: string; message?: string; killed?: boolean }
      if (e.killed) {
        return {
          content: `Command timed out after ${timeout}ms`,
          isError: true,
        }
      }
      const msg = [e.stderr?.trim(), e.message].filter(Boolean).join('\n')
      return { content: `Exit ${e.code ?? 1}: ${msg}`, isError: true }
    }
  },
}
