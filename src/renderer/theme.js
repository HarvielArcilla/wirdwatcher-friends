// Applies an appearance to the window: the light or dark theme (following the
// system when asked), fonts, corners, texture and motion.
import { themeById, themeColors, resolveFonts, CORNERS, WORD_SIZES } from '../shared/appearance.js'

const dark = window.matchMedia('(prefers-color-scheme: dark)')

export const schemeFor = (a) => (a.mode === 'system' ? (dark.matches ? 'dark' : 'light') : a.mode)

const VARS = { bg: '--bg', raise: '--raise', panel: '--panel', panelRaise: '--panel-raise', line: '--line', text: '--text', dim: '--dim', faint: '--faint', accent: '--accent', onAccent: '--on-accent', word: '--word', bad: '--bad', mid: '--mid', good: '--good' }
const stack = (f) => `"${f.family}", ${f.kind === 'Serif' ? 'Georgia, serif' : f.kind === 'Mono' ? 'ui-monospace, monospace' : 'system-ui, sans-serif'}`

// Sets the CSS variables on an element (the page, or a preview card).
export function paint (el, a, scheme = schemeFor(a)) {
  const side = a[scheme]
  const theme = themeById(side.theme)
  const c = themeColors(theme, side.accent)
  for (const [k, v] of Object.entries(VARS)) el.style.setProperty(v, c[k])
  el.style.setProperty('--shadow', scheme === 'dark' ? 'rgba(0, 0, 0, .38)' : 'rgba(40, 32, 20, .14)')
  const f = resolveFonts(a.fonts)
  el.style.setProperty('--font-ui', stack(f.ui))
  el.style.setProperty('--font-word', stack(f.word))
  el.style.setProperty('--font-read', stack(f.reading))
  el.style.setProperty('--word-weight', String(f.word.word.weight))
  el.style.setProperty('--word-tracking', f.word.word.tracking)
  const [sm, md, lg] = CORNERS[a.corners]
  el.style.setProperty('--r-sm', `${sm}px`)
  el.style.setProperty('--r-md', `${md}px`)
  el.style.setProperty('--r-lg', `${lg}px`)
  return { scheme, theme, fonts: f }
}

export function applyAppearance (a) {
  const { scheme, fonts } = paint(document.documentElement, a)
  document.documentElement.style.colorScheme = scheme
  document.body.dataset.scheme = scheme
  const texture = a[scheme].texture
  if (texture === 'none') delete document.body.dataset.texture
  else document.body.dataset.texture = texture
  document.documentElement.classList.toggle('calm', a.motion === 'reduced')
  window.__wordScale = WORD_SIZES[a.wordSize] * (fonts.word.scale || 1)
}

// Calls fn when the system switches between light and dark.
export function onSystemScheme (fn) {
  dark.addEventListener('change', fn)
  return () => dark.removeEventListener('change', fn)
}
