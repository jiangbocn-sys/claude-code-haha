#!/usr/bin/env bun

import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = process.cwd()
const roots = ['src/server', 'src/tools', 'src/utils']
const excludedFiles = new Set([
  // These suites are not stable enough for the default PR gate yet. Keep them
  // out of CI until they are fixed or moved to a maintainer-only workflow.
  'src/server/__tests__/cron-scheduler.test.ts',
  'src/server/__tests__/providers-real.test.ts',
  'src/server/__tests__/tasks.test.ts',
  'src/server/__tests__/e2e/business-flow.test.ts',
  'src/server/__tests__/e2e/full-flow.test.ts',
])

function normalize(path: string) {
  return relative(root, path).split(sep).join('/')
}

function walk(path: string, files: string[]) {
  const stat = statSync(path)

  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      walk(join(path, entry), files)
    }
    return
  }

  if (!stat.isFile()) {
    return
  }

  const normalized = normalize(path)
  if (normalized.endsWith('.test.ts') && !excludedFiles.has(normalized)) {
    files.push(normalized)
  }
}

const testFiles: string[] = []
for (const testRoot of roots) {
  walk(join(root, testRoot), testFiles)
}

testFiles.sort()

if (testFiles.length === 0) {
  console.log('No server-side test files found.')
  process.exit(0)
}

const proc = Bun.spawn(['bun', 'test', ...testFiles], {
  cwd: root,
  stdout: 'inherit',
  stderr: 'inherit',
})

process.exit(await proc.exited)
