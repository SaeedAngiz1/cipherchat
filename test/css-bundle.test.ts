/**
 * Build-time smoke test for the production CSS bundle.
 *
 * Guards the exact failure mode this repo just shipped a fix for: a missing
 * or broken postcss.config.js caused Vite to skip Tailwind's processor.
 * The emitted stylesheet then shipped as the raw @tailwind base directives
 * text (~280 bytes) and every page rendered fully unstyled.
 *
 * Env vars:
 *   SKIP_CSS_SMOKE=1   skip the build entirely.
 *   FORCE_CSS_SMOKE=1  always rebuild, ignoring the freshness check.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// URL-relative project root: works regardless of where vitest was launched
// from, what --root is set to, or whether a globalSetup shifted cwd.
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DIST_CSS_DIR = join(ROOT, 'dist', 'assets')

// Files whose modification must invalidate the cached dist bundle.
// Hard-listed (not globbed) so the cache logic never silently misses a
// config rename. The src/ walk at the bottom catches all source files.
const STYLE_AFFECTING_FILES = [
  'package.json',
  'package-lock.json',
  '.env',
  '.env.local',
  'vite.config.js',
  'vite.config.ts',
  'postcss.config.js',
  'postcss.config.cjs',
  'postcss.config.mjs',
  'postcss.config.ts',
  '.postcssrc.json',
  '.postcssrc.cjs',
  '.postcssrc.js',
  '.postcssrc.ts',
  'tailwind.config.js',
  'tailwind.config.cjs',
  'tailwind.config.mjs',
  'tailwind.config.ts',
  'src/index.css',
  'index.html',
  'tsconfig.json',
]

const BUILD_TIMEOUT_MS = 120_000
const MIN_CSS_BYTES = 15_000
const SKIP_ENV = 'SKIP_CSS_SMOKE'
const FORCE_ENV = 'FORCE_CSS_SMOKE'

function isTruthy(v) {
  return v === '1' || v === 'true' || v === 'yes'
}

function listBundles() {
  if (!existsSync(DIST_CSS_DIR)) return []
  return readdirSync(DIST_CSS_DIR)
    .filter((n) => n.endsWith('.css'))
    .map((n) => join(DIST_CSS_DIR, n))
}

function walkSrc(root) {
  const out = []
  const stack = [join(root, 'src')]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      // Guard against a symlinked subdirectory walking out of `src/`.
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) stack.push(full)
      else if (/\.(ts|tsx|css|html)$/.test(e.name)) out.push(full)
    }
  }
  return out
}

function shouldRunBuild() {
  if (isTruthy(process.env[SKIP_ENV])) {
    return { run: false, reason: SKIP_ENV + ' is set' }
  }
  if (isTruthy(process.env[FORCE_ENV])) {
    return { run: true, reason: FORCE_ENV + ' is set (forcing rebuild)' }
  }
  const bundles = listBundles()
  if (bundles.length === 0) {
    return { run: true, reason: 'no CSS files in dist/assets yet' }
  }
  const newest = Math.max(...bundles.map((b) => statSync(b).mtimeMs))
  const candidates = STYLE_AFFECTING_FILES
    .map((rel) => join(ROOT, rel))
    .filter(existsSync)
  const walked = walkSrc(ROOT)
  for (let i = 0; i < walked.length; i++) candidates.push(walked[i])
  for (let i = 0; i < candidates.length; i++) {
    if (statSync(candidates[i]).mtimeMs > newest) {
      return {
        run: true,
        reason: 'source changed since last build: ' + candidates[i].slice(ROOT.length + 1),
      }
    }
  }
  return { run: false, reason: 'dist is fresh relative to all sources' }
}

function runViteBuild() {
  const req = createRequire(import.meta.url)
  const viteBin = req.resolve('vite/bin/vite.js')
  try {
    execFileSync(process.execPath, [viteBin, 'build'], {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: BUILD_TIMEOUT_MS,
    })
  } catch (err) {
    const e = err
    const out = []
    if (e.stdout) out.push(e.stdout.toString())
    if (e.stderr) out.push(e.stderr.toString())
    const combined = out.join('\n')
    const tail = combined.split('\n').slice(-20).join('\n')
    throw new Error(
      'vite build failed. Last 20 lines of output:\n' + tail + '\n' + (e.message || ''),
    )
  }
}

// Matches rule-form CSS class selectors: `.cls{` (minified) or `.cls {` (pretty).
function classRulePattern(cls) {
  const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp('\\.' + escaped + '\\s*\\{')
}

beforeAll(() => {
  const decision = shouldRunBuild()
  // Skip the always-on log in CI — fail-loud messages still surface via vitest.
  if (process.env.CI !== 'true') {
    console.log(
      '[css-bundle smoke] build decision: ' +
        (decision.run ? 'run' : 'skip') +
        ' (' + decision.reason + ')',
    )
  }
  if (decision.run) runViteBuild()
}, BUILD_TIMEOUT_MS + 10_000)

describe('production CSS bundle (Tailwind smoke)', () => {
  it('contains a non-trivially sized CSS file', () => {
    const bundles = listBundles()
    expect(bundles.length).toBeGreaterThan(0)
    const total = bundles.reduce((acc, p) => acc + statSync(p).size, 0)
    // Working Tailwind v3 + utility scans: ~30 KB. Broken config: ~280 B.
    expect(total).toBeGreaterThan(MIN_CSS_BYTES)
  })

  it('contains Tailwind v3 preflight CSS variables', () => {
    // Always emitted by Tailwind v3 preflight on `*,::before,::after`.
    const blob = listBundles()
      .map((b) => readFileSync(b, 'utf8'))
      .join('\n')
    expect(blob).toContain('--tw-border-spacing-x')
  })

  it('emits utility classes that source files use', () => {
    const blob = listBundles()
      .map((b) => readFileSync(b, 'utf8'))
      .join('\n')
    // Anchored to real usage in App.tsx / Layout variants — keeps the test
    // honest about catching a tailwind content-scan regression.
    for (const cls of ['min-h-screen', 'bg-slate-50']) {
      expect(blob).toMatch(classRulePattern(cls))
    }
  })
})
