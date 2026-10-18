// How wirdwatcher looks: color themes (light and dark set separately), font
// presets, and a few custom touches. Pure data and functions, shared by the
// background process (which saves your choice) and the window (which shows it).
// Appearance belongs to this computer; it is never sent to friends.

// Every theme fills the same slots:
//   bg / raise         the page, and things sitting on it
//   panel / panelRaise side panels, and things sitting on them
//   line               dividers and outlines
//   text / dim / faint body text, secondary text, hints
//   accent / onAccent  buttons and highlights, and text on them
//   word               the big word
//   bad / mid / good   the rating scale: 0.0 → 2.5 → 5.0
// test/appearance.test.js checks each theme's contrast.
export const THEMES = [
  // Dark
  { id: 'inkwell', name: 'Inkwell', mode: 'dark', blurb: 'Indigo ink and marigold', colors: { bg: '#1d2030', raise: '#272b3e', panel: '#161825', panelRaise: '#222537', line: '#363b52', text: '#eeeae0', dim: '#aaaabc', faint: '#7a7e96', accent: '#f2b84b', onAccent: '#2a1d03', word: '#f2b84b', bad: '#ef7d64', mid: '#f2b84b', good: '#74d0a1' } },
  { id: 'slate', name: 'Slate', mode: 'dark', blurb: 'The original wirdwatcher colors', colors: { bg: '#353c43', raise: '#3d454d', panel: '#262b30', panelRaise: '#2d3338', line: '#4a535c', text: '#e9edec', dim: '#b0b9c0', faint: '#87929b', accent: '#e8c686', onAccent: '#3a3020', word: '#e8c686', bad: '#ed9478', mid: '#e8c686', good: '#86cbae' } },
  { id: 'espresso', name: 'Espresso', mode: 'dark', blurb: 'Dark roast and crema', colors: { bg: '#231b17', raise: '#2e2420', panel: '#1a1411', panelRaise: '#271f1b', line: '#43352d', text: '#f2e8dc', dim: '#c0afa0', faint: '#8c7a6a', accent: '#e8c49a', onAccent: '#2a1c10', word: '#e8c49a', bad: '#e58a72', mid: '#e3bf76', good: '#9ccf8f' } },
  { id: 'forest', name: 'Forest', mode: 'dark', blurb: 'Pine needles and old paper', colors: { bg: '#17221e', raise: '#20302a', panel: '#101915', panelRaise: '#1a2621', line: '#2d4038', text: '#e4ede6', dim: '#a3b8ab', faint: '#728a7e', accent: '#c3d985', onAccent: '#1c2610', word: '#efe6c8', bad: '#e9896d', mid: '#e5c46f', good: '#8fd6a5' } },
  { id: 'velvet', name: 'Velvet', mode: 'dark', blurb: 'Plum and rose', colors: { bg: '#231a2a', raise: '#2e2337', panel: '#1a1320', panelRaise: '#261d2d', line: '#3f3249', text: '#f1e9f2', dim: '#bba9bf', faint: '#8a7890', accent: '#f2a7c3', onAccent: '#3a1226', word: '#f2a7c3', bad: '#f08a74', mid: '#efc27a', good: '#84d4b0' } },
  { id: 'blackout', name: 'Blackout', mode: 'dark', blurb: 'High contrast, true black', colors: { bg: '#000000', raise: '#161616', panel: '#0b0b0b', panelRaise: '#1d1d1d', line: '#5a5a5a', text: '#ffffff', dim: '#d6d6d6', faint: '#a8a8a8', accent: '#ffd60a', onAccent: '#000000', word: '#ffd60a', bad: '#ff7b6b', mid: '#ffd60a', good: '#5ef0a0' } },
  // Light
  { id: 'paper', name: 'Paper', mode: 'light', blurb: 'Bright paper and indigo ink', colors: { bg: '#fbfaf6', raise: '#f0eee6', panel: '#f2f0e8', panelRaise: '#e6e3d8', line: '#d9d5c8', text: '#1f2130', dim: '#545869', faint: '#6e717f', accent: '#3b44b8', onAccent: '#ffffff', word: '#23286b', bad: '#c0432a', mid: '#99670a', good: '#25784f' } },
  { id: 'parchment', name: 'Parchment', mode: 'light', blurb: 'Warm vellum and oxblood, for the serif crowd', colors: { bg: '#f4efe3', raise: '#ebe4d3', panel: '#ece5d5', panelRaise: '#e1d8c4', line: '#d3c8b0', text: '#2b2419', dim: '#5f5341', faint: '#7a6d58', accent: '#7e2f24', onAccent: '#fbf3e6', word: '#2b2419', bad: '#ab3f29', mid: '#8a5f0c', good: '#356d42' } },
  { id: 'newsprint', name: 'Newsprint', mode: 'light', blurb: 'Grey stock, black type, red ink', colors: { bg: '#eeede8', raise: '#e3e2dc', panel: '#e5e4de', panelRaise: '#d9d8d1', line: '#c9c8c0', text: '#111111', dim: '#454543', faint: '#686761', accent: '#b82418', onAccent: '#ffffff', word: '#111111', bad: '#b82418', mid: '#7d5a00', good: '#1d6a43' } },
  { id: 'sage', name: 'Sage', mode: 'light', blurb: 'Soft green and deep pine', colors: { bg: '#eef2ea', raise: '#e2e9de', panel: '#e4eadf', panelRaise: '#d6dfd1', line: '#c5d0bf', text: '#1d2a22', dim: '#4a5a50', faint: '#69786e', accent: '#2c6448', onAccent: '#ffffff', word: '#1e3f2e', bad: '#ad4530', mid: '#85600c', good: '#256f49' } },
  { id: 'blush', name: 'Blush', mode: 'light', blurb: 'Rose petals and plum', colors: { bg: '#f9eff1', raise: '#f1e2e6', panel: '#f2e4e8', panelRaise: '#e8d3d9', line: '#dcc3ca', text: '#2e1d24', dim: '#664b55', faint: '#836771', accent: '#8e325a', onAccent: '#ffffff', word: '#5a1f3b', bad: '#ad3e2b', mid: '#86600c', good: '#27704d' } },
  { id: 'daylight', name: 'Daylight', mode: 'light', blurb: 'High contrast, pure white', colors: { bg: '#ffffff', raise: '#f0f0f0', panel: '#f5f5f5', panelRaise: '#e6e6e6', line: '#8a8a8a', text: '#000000', dim: '#2e2e2e', faint: '#4f4f4f', accent: '#0033cc', onAccent: '#ffffff', word: '#000000', bad: '#b3261e', mid: '#704e00', good: '#146c3a' } }
]

export const themeById = (id) => THEMES.find((t) => t.id === id)

// Fonts bundled in assets/fonts (all under the SIL Open Font License).
//   word:   weight and letter spacing for the big word and numbers
//   scale:  wide fonts set the big word a little smaller
export const FONTS = [
  { id: 'fredoka', name: 'Fredoka', family: 'Fredoka', kind: 'Rounded', word: { weight: 600, tracking: '-0.02em' } },
  { id: 'newsreader', name: 'Newsreader', family: 'Newsreader', kind: 'Serif', word: { weight: 500, tracking: '-0.025em' } },
  { id: 'source-serif', name: 'Source Serif', family: 'Source Serif 4', kind: 'Serif', word: { weight: 600, tracking: '-0.02em' } },
  { id: 'eb-garamond', name: 'EB Garamond', family: 'EB Garamond', kind: 'Serif', word: { weight: 500, tracking: '-0.01em' } },
  { id: 'fraunces', name: 'Fraunces', family: 'Fraunces', kind: 'Serif', word: { weight: 600, tracking: '-0.02em' } },
  { id: 'inter', name: 'Inter', family: 'Inter', kind: 'Sans', word: { weight: 750, tracking: '-0.045em' } },
  { id: 'bricolage', name: 'Bricolage Grotesque', family: 'Bricolage Grotesque', kind: 'Sans', word: { weight: 750, tracking: '-0.035em' } },
  { id: 'atkinson', name: 'Atkinson Hyperlegible', family: 'Atkinson Hyperlegible', kind: 'Sans', word: { weight: 700, tracking: '-0.01em' } },
  { id: 'plex-mono', name: 'IBM Plex Mono', family: 'IBM Plex Mono', kind: 'Mono', word: { weight: 700, tracking: '-0.03em' }, scale: 0.85 },
  { id: 'opendyslexic', name: 'OpenDyslexic', family: 'OpenDyslexic', kind: 'Sans', word: { weight: 700, tracking: '0' }, scale: 0.78 }
]

export const fontById = (id) => FONTS.find((f) => f.id === id)

// word: the big word and numbers. ui: buttons and labels. reading: definitions.
export const FONT_PRESETS = [
  { id: 'playful', name: 'Playful', blurb: 'Rounded and friendly, the original', word: 'fredoka', ui: 'fredoka', reading: 'source-serif' },
  { id: 'classic', name: 'Classic serif', blurb: 'Quiet and bookish, serif all the way through', word: 'newsreader', ui: 'newsreader', reading: 'newsreader' },
  { id: 'literary', name: 'Literary', blurb: 'Old-style Garamond, like a good dictionary', word: 'eb-garamond', ui: 'source-serif', reading: 'eb-garamond' },
  { id: 'editorial', name: 'Editorial', blurb: 'A soft display serif over a clean sans', word: 'fraunces', ui: 'inter', reading: 'source-serif' },
  { id: 'modern', name: 'Modern', blurb: 'Tight, heavy sans', word: 'inter', ui: 'inter', reading: 'inter' },
  { id: 'grotesk', name: 'Grotesk', blurb: 'A sans with some personality', word: 'bricolage', ui: 'inter', reading: 'inter' },
  { id: 'typewriter', name: 'Typewriter', blurb: 'Monospace everything', word: 'plex-mono', ui: 'plex-mono', reading: 'plex-mono' },
  { id: 'hyperlegible', name: 'Hyperlegible', blurb: 'Made by the Braille Institute for low-vision readers', word: 'atkinson', ui: 'atkinson', reading: 'atkinson' },
  { id: 'dyslexia', name: 'OpenDyslexic', blurb: 'Weighted letters some dyslexic readers find easier', word: 'opendyslexic', ui: 'opendyslexic', reading: 'opendyslexic' }
]

export const WORD_SIZES = { compact: 0.78, normal: 1, huge: 1.25 }
export const CORNERS = { square: [3, 4, 6], soft: [8, 14, 22], round: [12, 20, 30] }
export const TEXTURES = ['none', 'paper', 'grain']

export const DEFAULT_APPEARANCE = {
  mode: 'system', // 'system' | 'light' | 'dark'
  dark: { theme: 'inkwell', accent: null, texture: 'none' },
  light: { theme: 'paper', accent: null, texture: 'none' },
  fonts: { preset: 'playful', word: null, ui: null, reading: null }, // null: the preset's choice
  wordSize: 'normal',
  corners: 'soft',
  motion: 'full' // 'full' | 'reduced'
}

const HEX = /^#[0-9a-f]{6}$/i

function side (v, mode) {
  const d = DEFAULT_APPEARANCE[mode]
  const theme = themeById(v?.theme)
  return {
    theme: theme && theme.mode === mode ? theme.id : d.theme,
    accent: HEX.test(v?.accent) ? v.accent.toLowerCase() : null,
    texture: TEXTURES.includes(v?.texture) ? v.texture : 'none'
  }
}

// Any input → a complete, valid appearance.
export function normalizeAppearance (a = {}) {
  const preset = FONT_PRESETS.some((p) => p.id === a?.fonts?.preset) ? a.fonts.preset : DEFAULT_APPEARANCE.fonts.preset
  const font = (k) => (fontById(a?.fonts?.[k]) ? a.fonts[k] : null)
  return {
    mode: ['system', 'light', 'dark'].includes(a?.mode) ? a.mode : DEFAULT_APPEARANCE.mode,
    dark: side(a?.dark, 'dark'),
    light: side(a?.light, 'light'),
    fonts: { preset, word: font('word'), ui: font('ui'), reading: font('reading') },
    wordSize: Object.hasOwn(WORD_SIZES, a?.wordSize) ? a.wordSize : DEFAULT_APPEARANCE.wordSize,
    corners: Object.hasOwn(CORNERS, a?.corners) ? a.corners : DEFAULT_APPEARANCE.corners,
    motion: a?.motion === 'reduced' ? 'reduced' : 'full'
  }
}

// The three fonts in use, after custom picks override the preset.
export function resolveFonts (fonts) {
  const p = FONT_PRESETS.find((x) => x.id === fonts.preset) || FONT_PRESETS[0]
  return { word: fontById(fonts.word || p.word), ui: fontById(fonts.ui || p.ui), reading: fontById(fonts.reading || p.reading) }
}

// --- color math (for custom accents and the contrast checks) -------------------

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast (a, b) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

// Text color for a custom accent: whichever of near-black or white reads better.
export const onColor = (hex) => (contrast(hex, '#141414') >= contrast(hex, '#ffffff') ? '#141414' : '#ffffff')

// The theme's colors with a custom accent applied. A custom accent also
// colors the big word in dark themes, where the word already is the accent.
export function themeColors (theme, accent = null) {
  const c = { ...theme.colors }
  if (accent) {
    c.accent = accent
    c.onAccent = onColor(accent)
    if (theme.mode === 'dark') c.word = accent
  }
  return c
}

// How readable a custom accent is on its theme, for a warning in Settings.
export function accentWarning (theme, accent) {
  if (!accent) return null
  const r = contrast(accent, theme.colors.bg)
  return r < 3 ? `This color is hard to see on ${theme.name} (contrast ${r.toFixed(1)}:1). Try a ${theme.mode === 'dark' ? 'lighter' : 'darker'} one.` : null
}
