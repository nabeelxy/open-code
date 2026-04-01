/**
 * Tool unit tests — run with: node --test src/tests/tools.test.ts
 * (Node.js 18+ built-in test runner, no extra dependencies)
 *
 * Or with tsx: npx tsx --test src/tests/tools.test.ts
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { bashTool } from '../tools/bash.js'
import { editTool } from '../tools/edit.js'
import { globTool } from '../tools/glob.js'
import { grepTool } from '../tools/grep.js'
import { readTool } from '../tools/read.js'
import { writeTool } from '../tools/write.js'
import type { ToolContext } from '../types.js'

// ─── Test fixtures ────────────────────────────────────────────────────────────

let testDir: string

const autoCtx: ToolContext = {
  workingDir: '',          // set in before()
  permissionMode: 'auto', // never prompt during tests
  confirm: async () => true,
}

before(async () => {
  testDir = join(tmpdir(), `open-code-test-${Date.now()}`)
  await mkdir(testDir, { recursive: true })
  autoCtx.workingDir = testDir
})

after(async () => {
  await rm(testDir, { recursive: true, force: true })
})

// ─── bash tool ────────────────────────────────────────────────────────────────

describe('bash tool', () => {
  it('runs a simple command and returns stdout', async () => {
    const result = await bashTool.execute({ command: 'echo hello' }, autoCtx)
    assert.equal(result.isError, undefined)
    assert.equal(result.content.trim(), 'hello')
  })

  it('returns stderr merged with stdout', async () => {
    const result = await bashTool.execute(
      { command: 'echo out && echo err >&2' },
      autoCtx,
    )
    assert.ok(result.content.includes('out'))
    assert.ok(result.content.includes('err'))
  })

  it('reports non-zero exit codes as errors', async () => {
    const result = await bashTool.execute({ command: 'exit 42' }, autoCtx)
    assert.equal(result.isError, true)
    assert.ok(result.content.includes('42'))
  })

  it('respects timeout', async () => {
    const result = await bashTool.execute(
      { command: 'sleep 10', timeout: 100 },
      autoCtx,
    )
    assert.equal(result.isError, true)
    assert.ok(result.content.toLowerCase().includes('timed out') || result.content.includes('100'))
  })

  it('formatInput truncates long commands', () => {
    const long = 'a'.repeat(100)
    const label = bashTool.formatInput!({ command: long })
    assert.ok(label.length <= 63) // 60 chars + '...'
  })
})

// ─── read_file tool ───────────────────────────────────────────────────────────

describe('read_file tool', () => {
  const filename = 'read-test.txt'
  const content = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')

  before(async () => {
    await writeFile(join(testDir, filename), content, 'utf8')
  })

  it('reads a file with line numbers', async () => {
    const result = await readTool.execute({ path: filename }, autoCtx)
    assert.equal(result.isError, undefined)
    assert.ok(result.content.includes('line 1'))
    assert.ok(result.content.includes('line 20'))
    // Line numbers present
    assert.ok(result.content.includes(' 1 |') || result.content.includes(' 1|'))
  })

  it('respects offset and limit', async () => {
    const result = await readTool.execute({ path: filename, offset: 5, limit: 3 }, autoCtx)
    assert.ok(result.content.includes('line 5'))
    assert.ok(result.content.includes('line 6'))
    assert.ok(result.content.includes('line 7'))
    assert.ok(!result.content.includes('line 4'))
    assert.ok(!result.content.includes('line 8'))
  })

  it('returns error for missing file', async () => {
    const result = await readTool.execute({ path: 'no-such-file.txt' }, autoCtx)
    assert.equal(result.isError, true)
    assert.ok(result.content.includes('not found'))
  })

  it('formatInput returns the path', () => {
    const label = readTool.formatInput!({ path: 'src/main.ts' })
    assert.equal(label, 'src/main.ts')
  })
})

// ─── write_file tool ──────────────────────────────────────────────────────────

describe('write_file tool', () => {
  it('creates a new file', async () => {
    const result = await writeTool.execute(
      { path: 'write-test.txt', content: 'hello world' },
      autoCtx,
    )
    assert.equal(result.isError, undefined)
    assert.ok(result.content.includes('write-test.txt'))
  })

  it('overwrites an existing file', async () => {
    const path = 'write-overwrite.txt'
    await writeTool.execute({ path, content: 'original' }, autoCtx)
    const result = await writeTool.execute({ path, content: 'updated' }, autoCtx)
    assert.equal(result.isError, undefined)

    // Verify content was updated
    const read = await readTool.execute({ path }, autoCtx)
    assert.ok(read.content.includes('updated'))
  })

  it('creates parent directories automatically', async () => {
    const result = await writeTool.execute(
      { path: 'deep/nested/dir/file.txt', content: 'nested content' },
      autoCtx,
    )
    assert.equal(result.isError, undefined)
    assert.ok(result.content.includes('deep/nested/dir/file.txt'))
  })
})

// ─── edit_file tool ───────────────────────────────────────────────────────────

describe('edit_file tool', () => {
  const filename = 'edit-test.ts'

  before(async () => {
    await writeFile(
      join(testDir, filename),
      `function greet(name: string) {\n  return \`Hello, \${name}!\`\n}\n`,
      'utf8',
    )
  })

  it('replaces a unique string', async () => {
    const result = await editTool.execute(
      { path: filename, old_string: 'greet', new_string: 'sayHello' },
      autoCtx,
    )
    assert.equal(result.isError, undefined)
    assert.ok(result.content.includes('edit-test.ts'))

    const read = await readTool.execute({ path: filename }, autoCtx)
    assert.ok(read.content.includes('sayHello'))
    assert.ok(!read.content.includes('greet'))
  })

  it('errors when old_string is not found', async () => {
    const result = await editTool.execute(
      { path: filename, old_string: 'nonexistent_string_xyz', new_string: 'replacement' },
      autoCtx,
    )
    assert.equal(result.isError, true)
    assert.ok(result.content.includes('not found'))
  })

  it('errors on ambiguous match without replace_all', async () => {
    const path = 'dup-test.txt'
    await writeFile(join(testDir, path), 'foo\nfoo\nfoo\n', 'utf8')
    const result = await editTool.execute(
      { path, old_string: 'foo', new_string: 'bar' },
      autoCtx,
    )
    assert.equal(result.isError, true)
    assert.ok(result.content.includes('3') || result.content.includes('times'))
  })

  it('replace_all replaces all occurrences', async () => {
    const path = 'all-test.txt'
    await writeFile(join(testDir, path), 'cat cat cat\n', 'utf8')
    const result = await editTool.execute(
      { path, old_string: 'cat', new_string: 'dog', replace_all: true },
      autoCtx,
    )
    assert.equal(result.isError, undefined)

    const read = await readTool.execute({ path }, autoCtx)
    assert.ok(read.content.includes('dog dog dog'))
    assert.ok(!read.content.includes('cat'))
  })
})

// ─── glob tool ────────────────────────────────────────────────────────────────

describe('glob tool', () => {
  before(async () => {
    await writeFile(join(testDir, 'a.ts'), '', 'utf8')
    await writeFile(join(testDir, 'b.ts'), '', 'utf8')
    await writeFile(join(testDir, 'c.js'), '', 'utf8')
    await mkdir(join(testDir, 'sub'), { recursive: true })
    await writeFile(join(testDir, 'sub', 'd.ts'), '', 'utf8')
  })

  it('matches files by extension', async () => {
    const result = await globTool.execute({ pattern: '*.ts' }, autoCtx)
    assert.equal(result.isError, undefined)
    assert.ok(result.content.includes('a.ts'))
    assert.ok(result.content.includes('b.ts'))
    assert.ok(!result.content.includes('c.js'))
  })

  it('matches files recursively', async () => {
    const result = await globTool.execute({ pattern: '**/*.ts' }, autoCtx)
    assert.ok(result.content.includes('sub/d.ts') || result.content.includes('sub\\d.ts'))
  })

  it('returns message when no files match', async () => {
    const result = await globTool.execute({ pattern: '*.xyz' }, autoCtx)
    assert.ok(result.content.includes('No files found'))
  })

  it('formatInput returns the pattern', () => {
    assert.equal(globTool.formatInput!({ pattern: '**/*.ts' }), '**/*.ts')
  })
})

// ─── grep tool ────────────────────────────────────────────────────────────────

describe('grep tool', () => {
  const filename = 'grep-test.txt'

  before(async () => {
    await writeFile(
      join(testDir, filename),
      'apple\nbanana\napricot\ncherry\n',
      'utf8',
    )
  })

  it('finds matching lines', async () => {
    const result = await grepTool.execute(
      { pattern: 'ap', path: filename },
      autoCtx,
    )
    assert.equal(result.isError, undefined)
    assert.ok(result.content.includes('apple') || result.content.includes('apricot'))
  })

  it('reports no matches cleanly', async () => {
    const result = await grepTool.execute(
      { pattern: 'xyz123nothere', path: filename },
      autoCtx,
    )
    assert.ok(result.content.includes('No matches') || result.content.includes('no match'))
  })

  it('formatInput shows pattern and path', () => {
    const label = grepTool.formatInput!({ pattern: 'foo', path: 'src/' })
    assert.ok(label.includes('foo'))
    assert.ok(label.includes('src/'))
  })
})
