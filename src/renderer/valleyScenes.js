// Wird Valley, seen through your own eyes: six places side by side on one
// long landscape (home, the field, the meadow, the woods, the lake, the
// hill), drawn in pixels at 320×180 each. The sky and the far hills run
// across all of them, so moving from one to the next is a pan along the
// valley. Whatever's happening in a place (crops, butterflies, the line in
// the water, the gods) is drawn on top.

import { spriteCanvas, drawCrop, drawForage, drawBug } from './valleyArt.js'

export const VW = 320
export const VH = 180
export const PLACE_ORDER = ['home', 'field', 'meadow', 'woods', 'lake', 'hill']
// Where the land meets the hills, the same in every place so they line up.
export const HORIZON = 104

const lerp = (a, b, t) => a + (b - a) * t
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const mix = (a, b, t) => { const x = hex(a); const y = hex(b); return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], t))).join(',')})` }
const hashXY = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }

// The sky through the day: [hour, top, bottom].
const SKY = [[0, '#0b1030', '#262a58'], [5, '#141a44', '#3a3a6a'], [6.5, '#5a6ab0', '#f0a888'], [8, '#6ab4ec', '#c8e6f6'], [16.5, '#6ab4ec', '#d0eaf6'], [18.5, '#6a5aa8', '#f4a064'], [20, '#2a2a68', '#7a5a8a'], [21.5, '#0b1030', '#262a58'], [24, '#0b1030', '#262a58']]
export function skyAt (h) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, t0, b0] = SKY[i]; const [h1, t1, b1] = SKY[i + 1]
    if (h >= h0 && h <= h1) { const t = (h - h0) / (h1 - h0 || 1); return [mix(t0, t1, t), mix(b0, b1, t)] }
  }
  return [SKY[0][1], SKY[0][2]]
}
export const nightness = (h) => (h < 5 ? 1 : h < 7 ? (7 - h) / 2 : h < 18.5 ? 0 : h < 21 ? (h - 18.5) / 2.5 : 1)

// --- shared layers -----------------------------------------------------------------------
function drawSky (g, cam, now, h, rainy) {
  const [top, bot] = skyAt(h)
  const gr = g.createLinearGradient(0, 0, 0, 120)
  gr.addColorStop(0, rainy ? mix('#6a7a8a', top.startsWith('rgb') ? '#6a7a8a' : top, 0) : top)
  gr.addColorStop(1, bot)
  g.fillStyle = gr
  g.fillRect(0, 0, VW, VH)
  if (rainy) { g.fillStyle = 'rgba(90,100,120,.45)'; g.fillRect(0, 0, VW, 120) }
  const n = nightness(h)
  // Stars, fixed to the sky (they barely move as you pan).
  if (n > 0.2) {
    for (let i = 0; i < 70; i++) {
      const x = ((i * 97 - cam * 0.05) % VW + VW) % VW; const y = (i * 53) % 100
      g.fillStyle = `rgba(255,255,255,${(0.3 + 0.5 * ((Math.sin(now / 700 + i) + 1) / 2)) * n})`
      g.fillRect(Math.round(x), y, 1, 1)
    }
  }
  // The sun by day, the moon by night: each crosses the sky through its
  // hours, and drifts with the sky (as the stars do) as you pan.
  const sky = cam * 0.05
  if (!rainy) {
    if (h >= 6 && h <= 20) {
      const t = (h - 6) / 14
      const x = lerp(20, VW - 20, t) - sky; const y = 70 - Math.sin(t * Math.PI) * 55
      g.fillStyle = h > 17 ? '#f8b860' : '#fff4c0'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill()
      g.fillStyle = 'rgba(255,240,200,.25)'; g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill()
    }
    if (h >= 19 || h < 7) {
      const t = ((h - 19 + 24) % 24) / 12
      const x = lerp(20, VW - 20, t) - sky; const y = 72 - Math.sin(t * Math.PI) * 52
      g.fillStyle = `rgba(240,240,224,${Math.min(1, n * 1.4)})`; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill()
      g.fillStyle = skyAt(h)[0]; g.globalAlpha = Math.min(1, n * 1.4); g.beginPath(); g.arc(x + 3, y - 2, 6, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1
    }
  }
  // Clouds drifting along the whole valley.
  const cl = rainy ? 'rgba(150,160,175,.95)' : n > 0.5 ? 'rgba(60,64,100,.6)' : 'rgba(255,255,255,.85)'
  g.fillStyle = cl
  for (let i = 0; i < 9; i++) {
    const wx = ((i * 233 + now / (900 + i * 120)) % (VW * 7)) - VW * 0.5
    const x = Math.round(wx - cam * 0.3); const y = 12 + (i * 17) % 45
    if (x < -60 || x > VW + 10) continue
    g.fillRect(x, y, 34, 6); g.fillRect(x + 6, y - 4, 20, 4); g.fillRect(x + 4, y + 6, 26, 2)
  }
}

// Far hills, a little closer hills, then the ground: they slide at
// different speeds as you pan, which gives the valley its depth.
function drawHills (g, cam, h) {
  const n = nightness(h)
  const far = mix('#7aa8c8', '#2a3460', n)
  const mid = mix('#5a9a6a', '#1e3a3a', n)
  g.fillStyle = far
  for (let x = 0; x < VW; x++) { const wx = x + cam * 0.25; const y = 78 + Math.sin(wx / 47) * 6 + Math.sin(wx / 19) * 3; g.fillRect(x, Math.round(y), 1, VH) }
  g.fillStyle = mid
  for (let x = 0; x < VW; x++) { const wx = x + cam * 0.5; const y = 92 + Math.sin(wx / 31 + 1) * 5 + Math.sin(wx / 11) * 2; g.fillRect(x, Math.round(y), 1, VH) }
}

const grass = (n) => mix('#6cb85a', '#1e3a2a', n * 0.85)
const grass2 = (n) => mix('#5aa84a', '#183020', n * 0.85)
function ground (g, ox, y, n) {
  g.fillStyle = grass(n); g.fillRect(ox, y, VW, VH - y)
  g.fillStyle = grass2(n)
  for (let i = 0; i < 120; i++) { const x = ox + Math.floor(hashXY(i, y) * VW); const yy = y + Math.floor(hashXY(y, i) * (VH - y)); g.fillRect(x, yy, 1, 1 + Math.floor((yy - y) / 30)) }
}
function flowers (g, ox, y0, count, n, seed = 1) {
  const cols = ['#f4f0f0', '#f0d040', '#e870a0', '#a080e8', '#f08a5a']
  for (let i = 0; i < count; i++) {
    const t = hashXY(i, seed)
    const y = y0 + Math.floor(Math.pow(hashXY(seed, i), 0.8) * (VH - y0))
    const x = ox + Math.floor(t * VW)
    const s = 1 + Math.floor((y - y0) / 28)
    g.fillStyle = mix(cols[i % cols.length], '#20243a', n * 0.7)
    g.fillRect(x, y, s, s)
  }
}
function tree (g, x, base, s, n, kind = 0) {
  const trunk = mix('#7a4a2a', '#2a1a14', n)
  const leaf = mix(kind ? '#2e7a3e' : '#3a8a4a', '#12281e', n)
  const leaf2 = mix('#4aa058', '#183424', n)
  g.fillStyle = trunk; g.fillRect(Math.round(x - 2 * s), Math.round(base - 14 * s), Math.round(4 * s), Math.round(14 * s))
  g.fillStyle = leaf; g.beginPath(); g.arc(x, base - 20 * s, 11 * s, 0, Math.PI * 2); g.fill()
  g.fillStyle = leaf2; g.beginPath(); g.arc(x - 3 * s, base - 23 * s, 6 * s, 0, Math.PI * 2); g.fill()
}

// A god standing in a place. Returns where they were drawn (for clicks).
function drawGod (g, id, x, base, s, now, bubble) {
  const w = 16 * 2 * s; const hgt = 24 * 2 * s
  const bob = Math.sin(now / 520 + x) > 0.3 ? 1 : 0
  g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(x, base, 9 * s, 2.5 * s, 0, 0, Math.PI * 2); g.fill()
  g.drawImage(spriteCanvas(id, 1), Math.round(x - w / 2), Math.round(base - hgt + bob), Math.round(w), Math.round(hgt))
  if (bubble) {
    const bx = Math.round(x - 6); const by = Math.round(base - hgt - 13 + Math.sin(now / 400 + x))
    g.fillStyle = '#fff'; g.fillRect(bx, by, 13, 9); g.fillRect(bx + 3, by + 9, 3, 2)
    g.fillStyle = bubble === 'bday' ? '#e85a8a' : '#5a5a7a'
    if (bubble === 'bday') { g.fillRect(bx + 3, by + 3, 7, 4); g.fillStyle = '#f0c040'; g.fillRect(bx + 6, by + 1, 1, 2) } else for (let k = 0; k < 3; k++) g.fillRect(bx + 3 + k * 3, by + 4, 1, 1)
  }
  return { x: x - w / 2, y: base - hgt, w, h: hgt }
}

// --- the places ----------------------------------------------------------------------------
// Each draws at ox (its left edge on screen) and returns its click targets.
const SCENES = {
  home (g, ox, now, c) {
    const n = c.n
    ground(g, ox, HORIZON, n)
    // The path to the door.
    g.fillStyle = mix('#d8c08a', '#3a3426', n); g.beginPath(); g.moveTo(ox + 196, 132); g.lineTo(ox + 214, 132); g.lineTo(ox + 250, 180); g.lineTo(ox + 160, 180); g.fill()
    // The farmhouse.
    const hx = ox + 150
    g.fillStyle = mix('#e8d8b8', '#5a5464', n); g.fillRect(hx, 66, 110, 66)
    g.fillStyle = mix('#c8503a', '#4a2026', n); g.beginPath(); g.moveTo(hx - 10, 70); g.lineTo(hx + 55, 30); g.lineTo(hx + 120, 70); g.fill()
    g.fillStyle = mix('#a83a2a', '#3a1820', n); for (let i = 0; i < 5; i++) g.fillRect(hx + 15 + i * 18, 52 + Math.abs(i - 2) * 5, 10, 2)
    g.fillStyle = mix('#7a7a88', '#2a2a36', n); g.fillRect(hx + 82, 36, 9, 22)
    for (let i = 0; i < 3; i++) { const k = ((now / 1600 + i / 3) % 1); g.fillStyle = `rgba(235,235,240,${0.5 * (1 - k)})`; g.beginPath(); g.arc(hx + 86 + Math.sin(k * 6 + i) * 3, 32 - k * 24, 3 + k * 5, 0, Math.PI * 2); g.fill() }
    const win = n > 0.4 ? '#f8d878' : mix('#a8d8f0', '#3a4a6a', n)
    for (const wx of [hx + 12, hx + 76]) { g.fillStyle = mix('#7a5030', '#2a1c14', n); g.fillRect(wx - 2, 84, 26, 22); g.fillStyle = win; g.fillRect(wx, 86, 22, 18); g.fillStyle = mix('#7a5030', '#2a1c14', n); g.fillRect(wx + 10, 86, 2, 18); g.fillRect(wx, 94, 22, 2) }
    g.fillStyle = mix('#7a5030', '#2a1c14', n); g.fillRect(hx + 46, 92, 18, 40)
    g.fillStyle = '#e8c048'; g.fillRect(hx + 59, 112, 2, 2)
    if (n > 0.4) { g.fillStyle = 'rgba(255,210,140,.18)'; g.beginPath(); g.arc(hx + 55, 112, 40, 0, Math.PI * 2); g.fill() }
    // The shipping bin.
    const bx = ox + 108
    g.fillStyle = mix('#7a5030', '#2a1c14', n); g.fillRect(bx, 112, 30, 22)
    g.fillStyle = mix('#a8784a', '#3a2a1c', n); g.fillRect(bx + 2, 114, 26, 7); g.fillRect(bx + 2, 123, 26, 9)
    g.fillStyle = mix('#7a5030', '#2a1c14', n); g.fillRect(bx - 2, 108, 34, 5)
    // The seed stall: a little cart with a striped awning.
    const sx = ox + 18
    g.fillStyle = mix('#7a5030', '#2a1c14', n); g.fillRect(sx + 4, 70, 3, 52); g.fillRect(sx + 70, 70, 3, 52)
    for (let i = 0; i < 7; i++) { g.fillStyle = mix(i % 2 ? '#f4f0e8' : '#4aa86a', '#262a3a', n); g.fillRect(sx + i * 11, 62, 11, 12) }
    g.fillStyle = mix('#a8784a', '#3a2a1c', n); g.fillRect(sx, 98, 78, 26)
    const crops = ['#b0305a', '#e8b82a', '#6ac85a', '#e87a2a', '#3a5ad8', '#7aa84a']
    crops.forEach((col, i) => { g.fillStyle = mix(col, '#262a3a', n * 0.8); g.fillRect(sx + 5 + i * 12, 92, 9, 7) })
    g.fillStyle = mix('#3a2a1a', '#100c08', n); g.font = 'bold 8px monospace'; g.textAlign = 'center'; g.fillText('SEEDS', sx + 39, 114)
    g.fillStyle = mix('#3a2a1a', '#100c08', n); g.beginPath(); g.arc(sx + 14, 126, 6, 0, Math.PI * 2); g.arc(sx + 64, 126, 6, 0, Math.PI * 2); g.fill()
    flowers(g, ox, 140, 40, n, 2)
    return [{ kind: 'stall', x: sx, y: 60, w: 80, h: 72 }, { kind: 'bin', x: bx - 2, y: 106, w: 34, h: 30 }, { kind: 'door', x: hx + 44, y: 90, w: 22, h: 44 }]
  },

  field (g, ox, now, c) {
    const n = c.n
    ground(g, ox, HORIZON, n)
    tree(g, ox + 20, HORIZON + 6, 1.2, n); tree(g, ox + 300, HORIZON + 4, 1.1, n, 1)
    const geo = fieldGeo(ox, c.fieldW, c.fieldH)
    // The soil, one row of pixels at a time, so every edge is a clean pixel.
    const soil = (cell, r, col) => (cell.soil === 'tilled' ? mix(cell.wet ? '#6a4428' : '#9a6a42', '#2a1c14', n * 0.8) : mix((r + col) % 2 ? '#62ae52' : '#6cb85a', '#1c3424', n * 0.85))
    const furrow = mix('#5a3a20', '#1a120c', n * 0.8)
    const furrowWet = mix('#4a2e18', '#160e08', n * 0.8)
    for (let y = geo.top; y < geo.bot; y++) {
      const r = geo.rowAt(y)
      const y0 = geo.rowY(r)
      const y1 = geo.rowY(r + 1)
      const edges = geo.edges(y)
      for (let col = 0; col < c.fieldW; col++) {
        const i = r * c.fieldW + col
        const cell = c.field[i]
        const x0 = edges[col]; const x1 = edges[col + 1]
        const tilled = cell.soil === 'tilled'
        const ridge = tilled && (y - y0) % 3 === 2
        g.fillStyle = ridge ? (cell.wet ? furrowWet : furrow) : soil(cell, r, col)
        g.fillRect(x0, y, x1 - x0, 1)
        if (c.hover === i) {
          g.fillStyle = 'rgba(255,255,255,.9)'
          if (y === y0 || y === y1 - 1) g.fillRect(x0, y, x1 - x0, 1); else { g.fillRect(x0, y, 1, 1); g.fillRect(x1 - 1, y, 1, 1) }
        }
      }
    }
    // What's on each square: nearer rows are drawn twice the size.
    for (let r = 0; r < c.fieldH; r++) {
      const s = r >= c.fieldH - 2 ? 2 : 1
      const yb = geo.rowY(r + 1) - 2
      const edges = geo.edges(yb)
      for (let col = 0; col < c.fieldW; col++) {
        const cell = c.field[r * c.fieldW + col]
        const cx = Math.round((edges[col] + edges[col + 1]) / 2)
        if (cell.decor === 'weed') { g.fillStyle = mix('#4a8a2a', '#16301a', n); g.fillRect(cx - 3 * s, yb - 4 * s, s, 4 * s); g.fillRect(cx, yb - 6 * s, s, 6 * s); g.fillRect(cx + 2 * s, yb - 3 * s, s, 3 * s) }
        if (cell.decor === 'stone') { g.fillStyle = mix('#7a7a88', '#2a2a36', n); g.fillRect(cx - 4 * s, yb - 4 * s, 8 * s, 4 * s); g.fillStyle = mix('#a8a8b0', '#3a3a46', n); g.fillRect(cx - 3 * s, yb - 5 * s, 5 * s, 3 * s) }
        if (cell.crop) { g.save(); g.translate(cx, yb); g.scale(s, s); drawCrop(g, cell, c.crops[cell.crop], -8, -13, now); g.restore() }
      }
    }
    // A scarecrow keeping watch.
    const sx = ox + 290; g.fillStyle = mix('#7a5030', '#2a1c14', n); g.fillRect(sx, 116, 3, 40); g.fillRect(sx - 10, 126, 23, 3)
    g.fillStyle = mix('#e8c860', '#3a3420', n); g.fillRect(sx - 5, 108, 13, 4); g.fillStyle = mix('#f0d8a8', '#3a342a', n); g.fillRect(sx - 3, 112, 9, 8)
    g.fillStyle = mix('#c84a3a', '#3a1a1a', n); g.fillRect(sx - 4, 120, 11, 12)
    return [{ kind: 'field', ...geo.box }]
  },

  meadow (g, ox, now, c) {
    const n = c.n
    ground(g, ox, HORIZON, n)
    tree(g, ox + 40, 106, 0.8, n); tree(g, ox + 60, 108, 0.7, n, 1); tree(g, ox + 270, 105, 0.9, n)
    flowers(g, ox, 108, 160, n, 3)
    // Tall grass in the front.
    g.fillStyle = grass2(n)
    for (let i = 0; i < 60; i++) { const x = ox + (i * 37) % VW; const hh = 8 + (i * 13) % 12; g.fillRect(x, VH - hh, 1, hh); g.fillRect(x + 2, VH - hh + 3, 1, hh - 3) }
    const hits = []
    if (c.net) {
      const t = (now - c.net.began) / 1000
      for (const b of c.net.bugs) {
        if (c.net.caught.includes(b.id)) continue
        const [fx, fy, depth] = bugPos(b, t)
        const x = ox + fx * VW; const y = 60 + fy * 110
        drawBug(g, { kind: b.kind, ...c.bugs[b.kind] }, x, y, now, depth)
        hits.push({ kind: 'bug', id: b.id, x: x - 7 * depth, y: y - 6 * depth, w: 14 * depth, h: 12 * depth })
      }
    }
    return hits
  },

  woods (g, ox, now, c) {
    const n = Math.min(1, c.n + 0.15)
    ground(g, ox, HORIZON, n)
    // A canopy overhead and trunks at every distance.
    g.fillStyle = mix('#2a6a3a', '#0c1c14', n)
    for (let x = 0; x < VW; x += 2) { const y = 22 + Math.sin(x / 13) * 6 + Math.sin(x / 5) * 2; g.fillRect(ox + x, 0, 2, Math.round(y)) }
    for (let i = 0; i < 9; i++) { const x = ox + 16 + i * 34 + (i % 2) * 9; g.fillStyle = mix('#5a3a24', '#1a120c', n); g.fillRect(x, 20, 5, 96) }
    // Light coming through the leaves, by day.
    if (n < 0.6) { g.fillStyle = `rgba(255,250,200,${0.08 * (1 - n)})`; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(ox + 40 + i * 80, 20); g.lineTo(ox + 60 + i * 80, 20); g.lineTo(ox + 90 + i * 80, 150); g.lineTo(ox + 60 + i * 80, 150); g.fill() } }
    // The stream.
    g.fillStyle = mix('#4a8ac8', '#1a2a48', n); g.fillRect(ox, 162, VW, 10)
    g.fillStyle = mix('#7ab4e8', '#2a3a5a', n); for (let i = 0; i < 8; i++) g.fillRect(ox + ((i * 47 + now / 40) % VW), 165 + (i % 3) * 2, 8, 1)
    // Ferns along the ground.
    g.fillStyle = mix('#3a8a3a', '#122a18', n)
    for (let i = 0; i < 26; i++) { const x = ox + (i * 61) % VW; const y = 118 + (i * 23) % 40; g.fillRect(x, y, 6, 2); g.fillRect(x + 2, y - 3, 2, 3); g.fillRect(x - 2, y + 2, 4, 1) }
    // Big trunks right in front of you, at the edges.
    g.fillStyle = mix('#4a2e1c', '#140e08', n); g.fillRect(ox, 0, 14, VH); g.fillRect(ox + VW - 12, 0, 12, VH)
    const hits = []
    for (const it of c.forest) {
      const y = 112 + ((it.y - 0.38) / 0.57) * 62
      const s = 1 + (y - 112) / 40
      const x = ox + 20 + it.x * (VW - 40)
      g.save(); g.translate(x, y); g.scale(s, s); drawForage(g, it.kind, -8, -12, 0)
      // Half-hidden under the leaves.
      g.fillStyle = mix('#4aa04a', '#14301c', n)
      const leaves = Math.round(it.hide * 6)
      for (let k = 0; k < leaves; k++) g.fillRect(-8 + ((k * 5 + 2) % 14), -4 + ((k * 3) % 5), 3, 2)
      g.restore()
      hits.push({ kind: 'forage', id: it.id, x: x - 9 * s, y: y - 13 * s, w: 18 * s, h: 16 * s })
    }
    return hits
  },

  lake (g, ox, now, c) {
    const n = c.n
    // The far shore, then the water.
    g.fillStyle = mix('#3a7a4a', '#12241c', n)
    for (let x = 0; x < VW; x += 3) { const y = HORIZON - 6 - Math.abs(Math.sin(x / 9)) * 6 - (x % 7 === 0 ? 4 : 0); g.fillRect(ox + x, Math.round(y), 3, HORIZON - Math.round(y)) }
    const wtop = mix('#5aa0d8', '#1a2a50', n); const wbot = mix('#3a7ab8', '#0e1a36', n)
    const gr = g.createLinearGradient(0, HORIZON, 0, VH); gr.addColorStop(0, wtop); gr.addColorStop(1, wbot)
    g.fillStyle = gr; g.fillRect(ox, HORIZON, VW, VH - HORIZON)
    // Ripples and the sun (or moon) on the water.
    g.fillStyle = `rgba(255,255,255,${0.25 * (1 - n) + 0.12})`
    for (let i = 0; i < 26; i++) { const y = HORIZON + 4 + (i * 7) % 72; const w = 4 + (y - HORIZON) / 6; const x = ((i * 71 + now / (60 + i * 3)) % (VW + 40)) - 20; g.fillRect(ox + Math.round(x), y, Math.round(w), 1) }
    if (c.rainy) { g.strokeStyle = 'rgba(220,235,255,.5)'; g.lineWidth = 0.5; for (let i = 0; i < 12; i++) { const k = ((now / 700 + i * 0.37) % 1); const x = ox + (i * 97) % VW; const y = 104 + (i * 31) % 60; g.beginPath(); g.ellipse(x, y, 2 + k * 6, (2 + k * 6) / 3, 0, 0, Math.PI * 2); g.stroke() } }
    // The near shore on either side, where people stand.
    g.fillStyle = mix('#d8c08a', '#3a3426', n)
    g.beginPath(); g.moveTo(ox, 142); g.quadraticCurveTo(ox + 70, 146, ox + 100, VH); g.lineTo(ox, VH); g.fill()
    g.beginPath(); g.moveTo(ox + VW, 142); g.quadraticCurveTo(ox + VW - 70, 146, ox + VW - 100, VH); g.lineTo(ox + VW, VH); g.fill()
    // Reeds at the edges.
    g.fillStyle = mix('#4a7a3a', '#14261a', n)
    for (let i = 0; i < 14; i++) { const x = ox + (i < 7 ? i * 5 : VW - 40 + (i - 7) * 5); const hh = 18 + (i * 7) % 14; g.fillRect(x, VH - hh - 10, 2, hh) }
    // The dock, running out from under you.
    const plank = mix('#a8784a', '#3a2a1c', n); const plank2 = mix('#7a5030', '#2a1c14', n)
    g.fillStyle = plank; g.beginPath(); g.moveTo(ox + 112, VH); g.lineTo(ox + 208, VH); g.lineTo(ox + 180, 146); g.lineTo(ox + 140, 146); g.fill()
    g.fillStyle = plank2; for (let k = 0; k < 6; k++) { const y = 146 + k * k * 1.1 + k * 3; const t = (y - 146) / (VH - 146); g.fillRect(Math.round(ox + lerp(140, 112, t)), Math.round(y), Math.round(lerp(40, 96, t)), 1) }
    g.fillRect(ox + 138, 140, 3, 10); g.fillRect(ox + 179, 140, 3, 10)
    // The line and the bobber.
    if (c.fishing) {
      const bx = ox + 162; const by = 118 + (c.fishing.phase === 'bite' ? Math.sin(now / 45) * 2 : Math.sin(now / 420))
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(ox + 176, VH); g.quadraticCurveTo(ox + 172, 110, bx, by); g.stroke()
      g.fillStyle = '#e83a3a'; g.fillRect(bx - 2, by - 3, 4, 3); g.fillStyle = '#fff'; g.fillRect(bx - 2, by, 4, 2)
      if (c.fishing.phase === 'bite') { const k = (now / 400) % 1; g.strokeStyle = `rgba(255,255,255,${1 - k})`; g.beginPath(); g.ellipse(bx, by + 2, 3 + k * 10, (3 + k * 10) / 3, 0, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 14px monospace'; g.textAlign = 'center'; g.fillText('!', bx, by - 10) }
    } else if (Math.sin(now / 2300) > 0.97) { const x = ox + 60 + (Math.floor(now / 2300) * 53) % 200; g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x, 112, 2, 1); g.fillRect(x - 2, 113, 6, 1) }
    return [{ kind: 'water', x: ox, y: HORIZON, w: VW, h: 42 }]
  },

  hill (g, ox, now, c) {
    const n = c.n
    // The hilltop you're sitting on.
    ground(g, ox, HORIZON, n)
    // The hilltop you're sitting on, rising in front of you.
    g.fillStyle = mix('#5aa84a', '#183020', n * 0.85)
    for (let x = 0; x < VW; x++) { const y = Math.round(150 - Math.sin((x / VW) * Math.PI) * 24); g.fillRect(ox + x, y, 1, VH - y) }
    flowers(g, ox, 140, 30, n, 6)
    const hits = []
    // Tonight's constellation.
    if (c.stars) {
      const pts = c.stars.map((s) => ({ ...s, sx: ox + 20 + s.x * (VW - 40), sy: 10 + s.y * 100 }))
      g.strokeStyle = 'rgba(180,210,255,.85)'; g.lineWidth = 1; g.beginPath()
      c.picked.forEach((i, k) => { const p = pts[i]; if (k) g.lineTo(p.sx, p.sy); else g.moveTo(p.sx, p.sy) })
      g.stroke()
      pts.forEach((p, i) => {
        const on = c.picked.includes(i) || c.starsDone
        g.fillStyle = on ? '#fff6c0' : `rgba(255,255,255,${0.75 + 0.25 * Math.sin(now / 400 + i)})`
        g.beginPath(); g.arc(p.sx, p.sy, on ? 3 : 2.2, 0, Math.PI * 2); g.fill()
        if (on) { g.fillStyle = 'rgba(255,246,192,.25)'; g.beginPath(); g.arc(p.sx, p.sy, 6, 0, Math.PI * 2); g.fill() }
        hits.push({ kind: 'star', i, x: p.sx - 8, y: p.sy - 12, w: 16, h: 18 })
      })
    }
    return hits
  }
}

// The field, seen from its near edge: rows get deeper toward you. All in
// whole pixels, so drawing and clicking agree exactly.
export function fieldGeo (ox, W = 10, H = 6) {
  const top = HORIZON + 6; const bot = 177
  const rowY = (r) => Math.round(top + (bot - top) * Math.pow(Math.min(r, H) / H, 1.25))
  const rowAt = (y) => { let r = 0; while (r < H - 1 && rowY(r + 1) <= y) r++; return r }
  const edges = (y) => {
    const t = (y - top) / (bot - top)
    const left = lerp(ox + 72, ox + 14, t); const right = lerp(ox + 248, ox + 306, t)
    return Array.from({ length: W + 1 }, (_, k) => Math.round(lerp(left, right, k / W)))
  }
  const cellAt = (sx, sy) => {
    const y = Math.floor(sy)
    if (y < top || y >= bot) return null
    const e = edges(y)
    const x = Math.floor(sx)
    if (x < e[0] || x >= e[W]) return null
    let col = 0
    while (col < W - 1 && x >= e[col + 1]) col++
    return rowAt(y) * W + col
  }
  return { top, bot, rowY, rowAt, edges, cellAt, box: { x: ox + 14, y: top, w: VW - 28, h: bot - top } }
}

// Where a butterfly is at t seconds into the round: drifting loops, and
// how near it is.
export function bugPos (b, t) {
  const s = b.seed % 1000
  const sp = 0.6 + b.speed * 0.5
  const x = 0.5 + 0.4 * Math.sin(t * 0.37 * sp + s) + 0.07 * Math.sin(t * 1.9 * sp + s * 3)
  const y = 0.45 + 0.35 * Math.cos(t * 0.29 * sp + s * 2) + 0.06 * Math.sin(t * 2.3 * sp + s)
  const depth = 1.4 + 1.2 * ((Math.sin(t * 0.21 + s) + 1) / 2)
  return [x, y, depth]
}

// Draw the valley as seen from camera position cam (pixels along the
// panorama). Returns the click targets in screen pixels.
export function drawValley (g, cam, now, c) {
  g.imageSmoothingEnabled = false
  const h = c.hour
  c.n = nightness(h)
  drawSky(g, cam, now, h, c.rainy)
  drawHills(g, cam, h)
  const hits = []
  PLACE_ORDER.forEach((place, i) => {
    const ox = Math.round(i * VW - cam)
    if (ox >= VW || ox <= -VW) return
    g.save(); g.beginPath(); g.rect(ox, 0, VW, VH); g.clip()
    for (const t of SCENES[place](g, ox, now, c)) hits.push({ ...t, place })
    // The gods who are here now, back to front.
    const here = c.gods.filter((x) => x.place === place).sort((a, b) => a.near - b.near)
    for (const x of here) {
      let gx = ox + 20 + x.at * (VW - 40)
      let base = (place === 'hill' ? 150 : 142) + (x.near - 1) * 22
      let near = x.near
      if (place === 'lake') {
        // On the shore to either side, or out at the end of the dock.
        if (x.at > 0.42 && x.at < 0.58) { gx = ox + 160; base = 147; near = 0.75 } else { gx = x.at < 0.5 ? ox + 66 + x.at * 50 : ox + VW - 24 - (1 - x.at) * 90; base = 166 + (x.near - 1) * 8 }
      }
      const r = drawGod(g, x.id, gx, base, near, now, x.bubble)
      hits.push({ kind: 'god', id: x.id, place, ...r })
    }
    g.restore()
  })
  // A shrub or trunk where two places meet, so they blend.
  for (let i = 1; i < PLACE_ORDER.length; i++) {
    const x = i * VW - cam
    if (x < -30 || x > VW + 30) continue
    g.fillStyle = mix('#2e6a3a', '#0e1e16', c.n); g.beginPath(); g.arc(x, VH - 6, 22, 0, Math.PI * 2); g.fill()
    g.fillStyle = mix('#3a8a4a', '#12281e', c.n); g.beginPath(); g.arc(x - 6, VH - 14, 12, 0, Math.PI * 2); g.fill()
  }
  // Whoever came along, right beside you.
  if (c.companion) {
    const s = 3.2
    g.drawImage(spriteCanvas(c.companion, 1), 6, Math.round(VH - 24 * s * 0.72), Math.round(16 * s), Math.round(24 * s))
  }
  // Rain over everything, and the dark.
  if (c.rainy) {
    g.strokeStyle = 'rgba(210,225,255,.5)'; g.lineWidth = 1; g.beginPath()
    for (let i = 0; i < 70; i++) { const rx = (i * 53 + now / 3) % VW; const ry = (i * 97 + now / 1.6) % VH; g.moveTo(rx, ry); g.lineTo(rx - 2, ry + 6) }
    g.stroke()
  }
  if (h >= 17 && h < 20) { g.fillStyle = `rgba(255,140,60,${0.1 * Math.min(1, h - 17)})`; g.fillRect(0, 0, VW, VH) }
  // Fireflies, after dark, everywhere.
  if (c.n > 0.3) {
    for (let i = 0; i < 16; i++) {
      const x = ((i * 61 + Math.sin(now / 1700 + i) * 20) - cam * 0.9) % (VW * 2)
      const xx = ((x % VW) + VW) % VW
      const y = 100 + (i * 37) % 70 + Math.cos(now / 1300 + i * 2) * 6
      const a = (Math.sin(now / 300 + i * 3) + 1) / 2
      g.fillStyle = `rgba(220,255,140,${a * c.n})`; g.fillRect(Math.round(xx), Math.round(y), 1, 1)
    }
  }
  return hits
}
