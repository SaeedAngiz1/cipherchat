/**
 * Build-time smoke test for the production CSS bundle.
 *
 * Guards against the exact failure mode this repo just hit: a missing or
 * broken `postcss.config.js` causes Vite to skip Tailwind's processor
 * entirely, so the emitted stylesheet ships as the raw `@tailwind base;`
 * directives (~280 bytes) and every page renders fully unstyled.
 *
 * Strategy:
 *   1. Run `vite build` (skipping when `SKIP_CSS_SMOKE=1`, forcing when
 *      `FORCE_CSS_SMOKE=1`, OR when `dist/assets/*.css` is fresher than
 *      every file that can affect CSS output — `src/**\/*.{css,ts,tsx,
 *      html}` plus every postcss + tailwind config filename in the
 *      project plus `index.html`).
 *   2. Assert at least one `dist/assets/*.css` exists, and its total
 *      size clears the 15 KB floor.
 *   3. Assert Tailwind v3's unconditional preflight CSS variable
 *      `--tw-border-spacing-x` is present in the bundle.
 *   4. Assert that two utility classes this project literally uses
 *      (`min-h-screen`, `bg-slate-50`) appear as Tailwind selectors.
 *      Regexes are pre-compiled LITERALS — no `new RegExp(...)` from
 *      template literals, so there is zero escape-surface for Vitest to
 *      ever misinterpret. Each regex accepts any whitespace between the
 *      selector name and `{` so the assertion survives both the default
 *      minified output AND a teammate toggling `build.cssMinify: false`.
 *
 * Known follow-ups NOT shipped in this test:
 *   - Move the build to Vitest `globalSetup` so `vitest --threads > 1`
 *     does not race-concurrently build four times. Tracked separately.
 *   - Read `build.outDir` from `vite.config.*` so custom output dirs
 *     are honoured. Tracked separately.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll } from 'vitest'

const REQUIRE = createRequire(import.meta.url)

/**
 * Anchor relative to THIS file's URL, not `process.cwd()`. The file
 * lives in `<root>/test/`; `<root>/` is its parent. The URL API is
 * portable across Node, vitest workers, monorepos, and `--root`. This
 * is the same path Vite/Vitest used to compile this file, so it never
 * depends on wherever the user happened to launch vitest from.
 *   `new URL('..', import.meta.url)`  →  file://<root>/
 *   `fileURLToPath(...)`               →  <root>/string path on this OS
 */
const HERE = fileURLToPath(new URL('..', import.meta.url))
const DIST_CSS_DIR = join(HERE, 'dist', 'assets')
const SRC_DIR = join(HERE, 'src')

/** Every filename that, when changed, can invalidate the cached dist. */
const CONFIG_FILES = [
  'tailwind.config.js',
  'tailwind.config.ts',
  'tailwind.config.cjs',
  'tailwind.config.mjs',
  'postcss.config.js',
  'postcss.config.cjs',
  'postcss.config.mjs',
  'postcss.config.ts',
  '.postcssrc',
  '.postcssrc.json',
  '.postcssrc.js',
  '.postcssrc.cjs',
  '.postcssrc.mjs',
  'index.html',
] as const

function walk(
  dir: string,
  onFile: (full: string) => void,
): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue // avoid ELOOP
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, onFile)
    else onFile(full)
  }
}

/** Newest mtime among every file that can affect the CSS output. */
function newestSourceMtime(): number {
  let newest = 0
  for (const rel of CONFIG_FILES) {
    const full = join(HERE, rel)
    if (existsSync(full)) newest = Math.max(newest, statSync(full).mtimeMs)
  }
  if (existsSync(SRC_DIR)) {
    walk(SRC_DIR, (full) => {
      // Only CSS-bearing extensions can change the Tailwind output.
      if (!/\.(css|tsx?|html)$/.test(full)) return
      newest = Math.max(newest, statSync(full).mtimeMs)
    })
  }
  return newest
}

function newestBundledCssMtime(): number {
  if (!existsSync(DIST_CSS_DIR)) return 0
  let newest = 0
  for (const name of readdirSync(DIST_CSS_DIR)) {
    if (!name.endsWith('.css')) continue
    newest = Math.max(newest, statSync(join(DIST_CSS_DIR, name)).mtimeMs)
  }
  return newest
}

function shouldSkipBuild(): { skip: boolean; reason: string } {
  if (process.env.SKIP_CSS_SMOKE === '1') {
    return { skip: true, reason: 'SKIP_CSS_SMOKE=1' }
  }
  if (process.env.FORCE_CSS_SMOKE === '1') {
    return { skip: false, reason: 'FORCE_CSS_SMOKE=1' }
  }
  const src = newestSourceMtime()
  const dist = newestBundledCssMtime()
  if (dist > src) return { skip: true, reason: `dist newer (${dist} > ${src})` }
  return { skip: false, reason: `rebuilding (dist ${dist} <= src ${src})` }
}

interface CssBundle {
  name: string
  content: string
}

function readCssBundles(): CssBundle[] {
  if (!existsSync(DIST_CSS_DIR)) return []
  return readdirSync(DIST_CSS_DIR)
    .filter((n) => n.endsWith('.css'))
    .map((name) => ({
      name,
      content: readFileSync(join(DIST_CSS_DIR, name), 'utf8'),
    }))
}

beforeAll(() => {
  const decision = shouldSkipBuild()
  // eslint-disable-next-line no-console
  console.log(
    `[css-smoke] ${decision.skip ? 'skip' : 'RUN'}: ${decision.reason}; HERE=${HERE}; DIST=${DIST_CSS_DIR}`,
  )
  if (decision.skip) return
  const bin = REQUIRE.resolve('vite/bin/vite.js')
  execFileSync(process.execPath, [bin, 'build'], {
    cwd: HERE,
    stdio: 'pipe',
    // +10 s headroom at the vitest layer for SIGTERM teardown + the
    // final dist write & rename.
    timeout: 120_000,
  })
}, 130_000)

// Pre-compiled regex literals: explicit, no `new RegExp` template-literal
// escape pitfalls. Each matches the Tailwind selector followed by any
// whitespace and an opening brace, so they survive CSSnano minification
// AND `build.cssMinify: false`.
const CLASS_PATTERNS: ReadonlyArray<{ cls: string; re: RegExp }> = [
  { cls: 'min-h-screen', re: /\.min-h-screen\s*\{/ },
  { cls: 'bg-slate-50', re: /\.bg-slate-50\s*\{/ },
]

const SIZE_FLOOR_BYTES = 15_000

describe('production CSS bundle (Tailwind survival)', () => {
  it('produces at least one non-empty CSS file', () => {
    const bundles = readCssBundles()
    if (bundles.length === 0) {
      throw new Error(`No CSS files at ${DIST_CSS_DIR}. Build didn't run?`)
    }
    const totalBytes = bundles.reduce((n, b) => n + b.content.length, 0)
    // Tailwind v3 + content globs satisfied: ~28–40 KB. Broken build
    // (postcss missing): ~280 B. 15 KB is comfortably above the failure
    // size and far below the healthy size.
    expect(totalBytes).toBeGreaterThan(SIZE_FLOOR_BYTES)
  })

  it('contains an unconditional Tailwind v3 preflight variable', () => {
    const blob = readCssBundles()
      .map((b) => b.content)
      .join('\n')
    // Always emitted by preflight on `*, ::before, ::after`. Conditional
    // variables like `--tw-translate-x` only appear when at least one
    // transform utility is in source — DON'T assert on those here.
    expect(blob).toContain('--tw-border-spacing-x')
  })

  it('contains the project literal utility classes', () => {
    const blob = readCssBundles()
      .map((b) => b.content)
      .join('\n')
    // Collect-then-throw so a single run reports ALL missing classes
    // instead of stopping at the first one.
    const missing = CLASS_PATTERNS.filter(({ re }) => !re.test(blob)).map(
      ({ cls }) => `.${cls}`,
    )
    expect(
      missing,
      `missing utility classes: ${missing.join(', ') || '(none)'}`,
    ).toEqual([])
  })
})
