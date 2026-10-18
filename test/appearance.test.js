import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { THEMES, FONTS, FONT_PRESETS, normalizeAppearance, resolveFonts, contrast, themeColors, onColor, DEFAULT_APPEARANCE } from '../src/shared/appearance.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('every theme is readable (WCAG contrast)', () => {
  for (const t of THEMES) {
    const c = t.colors
    const check = (a, b, min, what) => assert.ok(contrast(c[a], c[b]) >= min, `${t.name}: ${what} ${a} on ${b} is ${contrast(c[a], c[b]).toFixed(2)}, needs ${min}`)
    check('text', 'bg', 7, 'body text')
    check('text', 'panel', 7, 'body text')
    check('dim', 'bg', 4.5, 'secondary text')
    check('dim', 'panel', 4.5, 'secondary text')
    check('faint', 'bg', 3, 'hints')
    check('word', 'bg', 4.5, 'the word')
    check('onAccent', 'accent', 4.5, 'button text')
    for (const r of ['bad', 'mid', 'good']) check(r, 'bg', 3, 'rating color')
    if (t.mode === 'light') check('accent', 'bg', 4.5, 'accent text')
    else check('accent', 'bg', 3, 'accent')
  }
})

test('there are light and dark themes, and both defaults exist', () => {
  assert.ok(THEMES.filter((t) => t.mode === 'dark').length >= 5)
  assert.ok(THEMES.filter((t) => t.mode === 'light').length >= 5)
  assert.equal(THEMES.find((t) => t.id === DEFAULT_APPEARANCE.dark.theme).mode, 'dark')
  assert.equal(THEMES.find((t) => t.id === DEFAULT_APPEARANCE.light.theme).mode, 'light')
})

test('every font is bundled with its license', () => {
  for (const f of FONTS) {
    const dir = path.join(root, 'assets', 'fonts', f.id)
    assert.ok(fs.existsSync(path.join(dir, 'LICENSE')), `${f.id} license`)
    assert.ok(fs.readdirSync(dir).some((x) => /\.(woff2|ttf)$/.test(x)), `${f.id} files`)
    assert.ok(fs.readFileSync(path.join(root, 'renderer', 'styles.css'), 'utf8').includes(`font-family: "${f.family}"`), `${f.id} @font-face`)
  }
  for (const p of FONT_PRESETS) for (const k of ['word', 'ui', 'reading']) assert.ok(FONTS.some((f) => f.id === p[k]), `${p.id}.${k}`)
})

test('appearance is normalized, light and dark kept apart', () => {
  const a = normalizeAppearance({ mode: 'dark', dark: { theme: 'paper', accent: '#ABCDEF' }, light: { theme: 'sage', texture: 'paper' }, fonts: { preset: 'classic', word: 'fraunces', ui: 'nope' }, wordSize: 'huge', corners: 'x' })
  assert.equal(a.mode, 'dark')
  assert.equal(a.dark.theme, 'inkwell', 'a light theme can’t be the dark theme')
  assert.equal(a.dark.accent, '#abcdef')
  assert.equal(a.light.theme, 'sage')
  assert.equal(a.light.texture, 'paper')
  assert.deepEqual(a.fonts, { preset: 'classic', word: 'fraunces', ui: null, reading: null })
  assert.equal(resolveFonts(a.fonts).word.id, 'fraunces')
  assert.equal(resolveFonts(a.fonts).reading.id, 'newsreader')
  assert.equal(a.wordSize, 'huge')
  assert.equal(a.corners, 'soft')
  assert.deepEqual(normalizeAppearance(null), DEFAULT_APPEARANCE)
})

test('custom accents get readable button text', () => {
  assert.equal(onColor('#ffe066'), '#141414')
  assert.equal(onColor('#2233aa'), '#ffffff')
  const c = themeColors(THEMES.find((t) => t.id === 'inkwell'), '#88ccff')
  assert.equal(c.word, '#88ccff')
  assert.ok(contrast(c.onAccent, c.accent) >= 4.5)
})
