// CSS for the looks that are described by data (src/shared/cosmetics-more.js),
// written once when the app starts, using the same class names the
// hand-made looks use, so they work everywhere those do.
import { COSMETICS } from '../shared/cosmetics.js'

const ring = (colors) => `conic-gradient(${colors.join(', ')})`

export function lookCss () {
  const out = []
  for (const c of COSMETICS) {
    if (c.kind === 'cardBack' && c.back) {
      out.push(`.card.locked .back.cb-${c.id}, .mini-back.cb-${c.id} { background: ${c.back}; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.5); }`)
    } else if (c.kind === 'frame' && c.ring) {
      const mask = 'radial-gradient(circle, transparent 60%, #000 62%)'
      out.push(`.frame-${c.id} .frame-art { inset: -6px; background: ${ring(c.ring)}; -webkit-mask: ${mask}; mask: ${mask};${c.spin ? ' animation: spin 7s linear infinite;' : ''} }`)
    } else if (c.kind === 'name' && c.grad) {
      out.push(`.nm-${c.id} { background: linear-gradient(90deg, ${c.grad.join(', ')}); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent !important; font-weight: 700;${c.move ? ' animation: slide 4s linear infinite;' : ''} }`)
    } else if (c.kind === 'table' && c.felt) {
      out.push(`.felt-${c.id} .felt { background: ${c.felt}; box-shadow: inset 0 0 0 10px ${c.rim}, inset 0 0 0 12px rgba(255,255,255,.35), 0 30px 60px var(--shadow); }`)
      if (c.dark) out.push(`.felt-${c.id} .felt-center { --word: #fbf6e8; --text: #fbf6e8; --dim: #e6dcc6; --faint: #c9bfa8; --read-text: #f1e9d6; color: var(--text); text-shadow: 0 1px 3px rgba(0,0,0,.45); }`)
    }
  }
  out.push('html.calm [class*="frame-f-"] .frame-art, html.calm [class*="nm-n-"] { animation: none !important; }')
  return out.join('\n')
}

if (typeof document !== 'undefined' && !document.getElementById('look-styles')) {
  const el = document.createElement('style')
  el.id = 'look-styles'
  el.textContent = lookCss()
  document.head.appendChild(el)
}
