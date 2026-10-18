// Celebrations: confetti for a 5.0, a smaller sparkle for 4.5 and up. Drawn
// on one canvas over the window, colored from the current theme, and
// skipped when motion is reduced.

let canvas = null
let parts = []
let frame = null

const calm = () => document.documentElement.classList.contains('calm') || window.matchMedia('(prefers-reduced-motion: reduce)').matches

function themeColors () {
  const cs = getComputedStyle(document.documentElement)
  return ['--accent', '--good', '--mid', '--word', '--bad'].map((v) => cs.getPropertyValue(v).trim()).filter(Boolean)
}

function ensureCanvas () {
  if (canvas) return canvas
  canvas = document.createElement('canvas')
  canvas.className = 'fx-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  const size = () => { canvas.width = window.innerWidth * devicePixelRatio; canvas.height = window.innerHeight * devicePixelRatio }
  size()
  window.addEventListener('resize', size)
  return canvas
}

function tick () {
  const c = canvas.getContext('2d')
  const dpr = devicePixelRatio
  c.clearRect(0, 0, canvas.width, canvas.height)
  const now = performance.now()
  parts = parts.filter((p) => now - p.born < p.life)
  for (const p of parts) {
    const t = (now - p.born) / 1000
    const x = p.x + p.vx * t
    const y = p.y + p.vy * t + 0.5 * p.g * t * t
    const fade = 1 - (now - p.born) / p.life
    c.save()
    c.globalAlpha = Math.max(0, Math.min(1, fade * 1.6))
    c.translate(x * dpr, y * dpr)
    c.rotate(p.spin * t + p.rot)
    c.fillStyle = p.color
    if (p.shape === 'star') {
      c.beginPath()
      for (let i = 0; i < 8; i++) { const r = (i % 2 ? 2 : 6) * dpr * p.size; c.lineTo(Math.cos(i * Math.PI / 4) * r, Math.sin(i * Math.PI / 4) * r) }
      c.fill()
    } else if (p.shape === 'dot') {
      c.beginPath(); c.arc(0, 0, 3.5 * dpr * p.size, 0, Math.PI * 2); c.fill()
    } else {
      c.scale(1, Math.cos(t * p.flip))
      c.fillRect(-5 * dpr * p.size, -3 * dpr * p.size, 10 * dpr * p.size, 6 * dpr * p.size)
    }
    c.restore()
  }
  frame = parts.length ? requestAnimationFrame(tick) : null
  if (!parts.length) c.clearRect(0, 0, canvas.width, canvas.height)
}

// How a rating reacts, by band. animations: 'all' | 'ends' | 'off'.
export function fxFor (r, animations = 'all') {
  if (animations === 'off' || r === null || r === undefined) return null
  const kind = r === 5 ? 'perfect' : r >= 4.5 ? 'great' : r === 0 ? 'zero' : r <= 0.5 ? 'crumble' : r >= 3.5 ? 'good' : r >= 2.5 ? 'fine' : r >= 1.5 ? 'meh' : 'wilt'
  if (animations === 'ends' && !['perfect', 'great', 'zero', 'crumble'].includes(kind)) return null
  return kind
}

// The burst that goes with a reaction, if any.
export const burstFor = (kind) => ({ perfect: 'confetti', great: 'confetti-small', good: 'sparkle' })[kind] || null

// kind: 'confetti' (a 5.0), 'confetti-small' (4.5 and up) or 'sparkle'. x, y: page coordinates.
export function burst (x, y, kind = 'confetti') {
  if (calm()) return
  ensureCanvas()
  const colors = themeColors()
  const now = performance.now()
  const small = kind === 'confetti-small'
  if (small) kind = 'confetti'
  const n = kind === 'confetti' ? (small ? 50 : 110) : 18
  for (let i = 0; i < n; i++) {
    const a = kind === 'confetti' ? -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * (small ? 0.9 : 1.3) : Math.random() * Math.PI * 2
    const speed = kind === 'confetti' ? (small ? 280 + Math.random() * 380 : 380 + Math.random() * 620) : 60 + Math.random() * 140
    parts.push({
      x, y, born: now + (kind === 'confetti' ? Math.random() * 120 : 0),
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      g: kind === 'confetti' ? 1300 : 60,
      life: kind === 'confetti' ? 1800 + Math.random() * 900 : 700 + Math.random() * 300,
      rot: Math.random() * 6, spin: (Math.random() - 0.5) * 14, flip: 4 + Math.random() * 8,
      size: kind === 'confetti' ? 0.8 + Math.random() * 0.6 : 0.6 + Math.random() * 0.5,
      shape: kind === 'confetti' ? (Math.random() < 0.7 ? 'rect' : 'dot') : 'star',
      color: colors[i % colors.length]
    })
  }
  if (!frame) frame = requestAnimationFrame(tick)
}

// Centre of an element, for bursting from it.
export function centerOf (el) {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}
