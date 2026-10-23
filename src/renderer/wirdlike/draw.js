// Drawing Wirdlike: the room (cached), everything in it, particles and the
// heads-up display, onto a canvas in room units (600 × 360) scaled to fit.
// All the art is drawn here in code: paper, ink, books and punctuation.

import { TILE, COLS, ROWS, WALL, ROOM_W, ROOM_H, T, CHAPTERS, FLOORS, HEADS, character } from '../../shared/wirdlike/content.js'
import { FOES } from '../../shared/wirdlike/foes.js'
import { tearColor } from '../../shared/wirdlike/engine.js'
import { TRANSFORMS, describe } from '../../shared/wirdlike/items.js'

const IX = WALL
const CX = ROOM_W / 2
const CY = ROOM_H / 2
const TAU = Math.PI * 2
const FONT = '"Fredoka", system-ui, sans-serif'
const SERIF = '"Newsreader", Georgia, serif'
const hashN = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

// --- particles ---------------------------------------------------------------------
export class Fx {
  constructor () { this.parts = []; this.shake = 0; this.decals = new Map(); this.flash = 0; this.hurtFlash = 0 }
  decalCanvas (key) {
    let c = this.decals.get(key)
    if (!c) { c = document.createElement('canvas'); c.width = ROOM_W; c.height = ROOM_H; this.decals.set(key, c) }
    return c
  }

  clearDecals () { this.decals.clear() }
  add (p) { if (this.parts.length < 900) this.parts.push(p) }
  burst (x, y, col, n = 8, spd = 120, size = 3, life = 0.5, grav = 0) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU; const s = spd * (0.4 + Math.random() * 0.8); this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - grav * 0.3, g: grav, col, size: size * (0.6 + Math.random() * 0.8), life, max: life, k: 'dot' }) }
  }

  // An ink splat that stays on the floor of this room.
  splat (key, x, y, col, r) {
    const c = this.decalCanvas(key).getContext('2d')
    c.save()
    c.globalAlpha = 0.5
    c.fillStyle = col
    c.beginPath()
    c.arc(x, y, r * 0.8, 0, TAU)
    for (let i = 0; i < 7; i++) { const a = Math.random() * TAU; const d = r * (0.8 + Math.random() * 0.9); c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.15 + Math.random() * 0.25), 0, TAU) }
    c.fill()
    c.restore()
  }

  step (dt) {
    for (const p of this.parts) { p.life -= dt; p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt; if (p.g) p.vy += p.g * dt; if (p.drag) { p.vx *= Math.pow(p.drag, dt); p.vy *= Math.pow(p.drag, dt) } }
    this.parts = this.parts.filter((p) => p.life > 0)
    this.shake = Math.max(0, this.shake - dt * 30)
    this.flash = Math.max(0, this.flash - dt * 2)
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3)
  }

  draw (ctx) {
    for (const p of this.parts) {
      const k = p.life / p.max
      ctx.globalAlpha = Math.min(1, k * 1.5)
      if (p.k === 'dot') { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, TAU); ctx.fill() } else if (p.k === 'ring') { ctx.strokeStyle = p.col; ctx.lineWidth = 3 * k + 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.15 - k * 0.9) + 2, 0, TAU); ctx.stroke() } else if (p.k === 'text') { ctx.fillStyle = p.col; ctx.font = `700 ${p.size}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(p.text, p.x, p.y) } else if (p.k === 'bolt') {
        ctx.strokeStyle = '#fff6a0'; ctx.lineWidth = 3; ctx.shadowColor = '#ffe14a'; ctx.shadowBlur = 10; ctx.beginPath()
        const [[x1, y1], [x2, y2]] = p.pts; ctx.moveTo(x1, y1)
        for (let i = 1; i < 6; i++) ctx.lineTo(x1 + (x2 - x1) * (i / 6) + (Math.random() - 0.5) * 14, y1 + (y2 - y1) * (i / 6) + (Math.random() - 0.5) * 14)
        ctx.lineTo(x2, y2); ctx.stroke(); ctx.shadowBlur = 0
      } else if (p.k === 'chip') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 9); ctx.fillStyle = p.col; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore() } else if (p.k === 'heart') { heart(ctx, p.x, p.y, 7, '#ff5a6a') } else if (p.k === 'print') { ctx.fillStyle = 'rgba(80,80,120,.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4, 6, 0, 0, TAU); ctx.fill() }
    }
    ctx.globalAlpha = 1
  }
}

// --- the room ------------------------------------------------------------------------
const roomCache = new Map()
export function clearRoomCache () { roomCache.clear() }

function paperGrain (c, w, h, col, n = 600, a = 0.05) {
  c.fillStyle = col
  for (let i = 0; i < n; i++) { c.globalAlpha = a * Math.random(); c.fillRect(hashN(i) * w, hashN(i + 9999) * h, 2, 2) }
  c.globalAlpha = 1
}

function drawFloor (c, th, chId) {
  c.fillStyle = th.floor
  c.fillRect(IX, IX, COLS * TILE, ROWS * TILE)
  c.save()
  c.beginPath(); c.rect(IX, IX, COLS * TILE, ROWS * TILE); c.clip()
  if (chId === 'margins') {
    c.strokeStyle = th.line; c.lineWidth = 1.2
    for (let y = IX + 22; y < IX + ROWS * TILE; y += 22) { c.beginPath(); c.moveTo(IX, y); c.lineTo(IX + COLS * TILE, y); c.stroke() }
    c.strokeStyle = th.accent; c.lineWidth = 2
    c.beginPath(); c.moveTo(IX + 52, IX); c.lineTo(IX + 52, IX + ROWS * TILE); c.stroke()
    paperGrain(c, ROOM_W, ROOM_H, '#8a7a5a')
  } else if (chId === 'index') {
    for (let y = 0; y < ROWS * 2; y++) for (let x = 0; x < COLS; x++) { c.fillStyle = (x + y) % 2 ? '#e2cca8' : '#ead8b8'; c.fillRect(IX + x * TILE + (y % 2) * 20, IX + y * 20, TILE, 20) }
    c.strokeStyle = 'rgba(120,80,40,.18)'; c.lineWidth = 1
    for (let y = IX; y < IX + ROWS * TILE; y += 20) { c.beginPath(); c.moveTo(IX, y); c.lineTo(IX + COLS * TILE, y); c.stroke() }
  } else if (chId === 'stacks') {
    for (let y = 0; y < ROWS * 2; y++) {
      for (let x = -1; x < COLS / 2 + 1; x++) {
        const w = 80; const ox = (y % 2) * 40
        c.fillStyle = `hsl(25, ${30 + hashN(x * 31 + y) * 10}%, ${20 + hashN(x + y * 7) * 7}%)`
        c.fillRect(IX + x * w + ox, IX + y * 20, w - 1, 19)
      }
    }
  } else if (chId === 'archive') {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { c.fillStyle = `hsl(222, 16%, ${26 + hashN(x * 13 + y * 7) * 6}%)`; c.fillRect(IX + x * TILE + 1, IX + y * TILE + 1, TILE - 2, TILE - 2) }
  } else if (chId === 'press') {
    c.fillStyle = '#3e3e42'
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { c.fillStyle = (x + y) % 2 ? '#47474b' : '#424246'; c.fillRect(IX + x * TILE, IX + y * TILE, TILE, TILE); c.fillStyle = '#5a5a60'; for (const [dx, dy] of [[4, 4], [TILE - 6, 4], [4, TILE - 6], [TILE - 6, TILE - 6]]) c.fillRect(IX + x * TILE + dx, IX + y * TILE + dy, 2, 2) }
    paperGrain(c, ROOM_W, ROOM_H, '#000', 400, 0.2)
  } else {
    c.font = `600 14px ${SERIF}`
    const letters = 'abcdefghijklmnopqrstuvwxyz'
    for (let i = 0; i < 90; i++) { c.globalAlpha = 0.05 + hashN(i) * 0.08; c.fillStyle = '#b8a8ff'; c.fillText(letters[Math.floor(hashN(i * 3) * 26)], IX + hashN(i * 7) * COLS * TILE, IX + hashN(i * 11) * ROWS * TILE) }
    c.globalAlpha = 1
  }
  // A soft shadow under the walls.
  const g = c.createLinearGradient(0, IX, 0, IX + 24)
  g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = g; c.fillRect(IX, IX, COLS * TILE, 24)
  const g2 = c.createLinearGradient(IX, 0, IX + 18, 0)
  g2.addColorStop(0, 'rgba(0,0,0,.18)'); g2.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = g2; c.fillRect(IX, IX, 18, ROWS * TILE)
  const g3 = c.createLinearGradient(IX + COLS * TILE, 0, IX + COLS * TILE - 18, 0)
  g3.addColorStop(0, 'rgba(0,0,0,.18)'); g3.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = g3; c.fillRect(IX + COLS * TILE - 18, IX, 18, ROWS * TILE)
  c.restore()
}

function drawWalls (c, th, chId) {
  c.fillStyle = th.wallDark
  c.fillRect(0, 0, ROOM_W, ROOM_H)
  c.fillStyle = th.wall
  c.fillRect(6, 6, ROOM_W - 12, ROOM_H - 12)
  if (chId === 'stacks' || chId === 'index' || chId === 'archive') {
    // Shelves of books (or drawers, or boxes) along the walls.
    const spine = (x, y, w, h, i) => {
      const hues = chId === 'archive' ? [210, 220, 30, 200] : [0, 25, 40, 120, 200, 280, 15]
      c.fillStyle = chId === 'index' ? (i % 2 ? '#7a4a24' : '#8a5a32') : `hsl(${hues[i % hues.length]}, ${chId === 'archive' ? 15 : 45}%, ${chId === 'archive' ? 40 : 32 + hashN(i) * 14}%)`
      c.fillRect(x, y, w, h)
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x, y, w, 2)
      if (chId === 'index') { c.fillStyle = '#d8b060'; c.fillRect(x + w / 2 - 4, y + h / 2 - 1, 8, 3) } else { c.fillStyle = 'rgba(255,230,160,.4)'; c.fillRect(x + 2, y + h * 0.3, w - 4, 2) }
    }
    let i = 0
    for (let x = 8; x < ROOM_W - 8;) { const w = chId === 'index' ? 34 : 8 + hashN(i) * 9; spine(x, 8, w - 1, WALL - 14, i++); spine(x, ROOM_H - WALL + 6, w - 1, WALL - 14, i++); x += w }
    for (let y = WALL; y < ROOM_H - WALL;) { const h = chId === 'index' ? 26 : 8 + hashN(i) * 9; spine(8, y, WALL - 14, h - 1, i++); spine(ROOM_W - WALL + 6, y, WALL - 14, h - 1, i++); y += h }
  } else if (chId === 'margins') {
    // The edge of a page: deckled, with a fold shadow.
    c.fillStyle = '#e8dcc0'
    c.fillRect(8, 8, ROOM_W - 16, ROOM_H - 16)
    paperGrain(c, ROOM_W, ROOM_H, '#6a5a3a', 900, 0.06)
    c.strokeStyle = '#c8b890'; c.lineWidth = 1
    for (let y = 14; y < ROOM_H; y += 9) { c.beginPath(); c.moveTo(8, y); c.lineTo(WALL - 4, y); c.moveTo(ROOM_W - WALL + 4, y); c.lineTo(ROOM_W - 8, y); c.stroke() }
  } else if (chId === 'press') {
    c.fillStyle = '#34343a'; c.fillRect(8, 8, ROOM_W - 16, ROOM_H - 16)
    for (let x = 30; x < ROOM_W; x += 60) { c.fillStyle = '#5a5a62'; c.beginPath(); c.arc(x, 20, 10, 0, TAU); c.arc(x, ROOM_H - 20, 10, 0, TAU); c.fill(); c.fillStyle = '#2a2a2e'; c.beginPath(); c.arc(x, 20, 4, 0, TAU); c.arc(x, ROOM_H - 20, 4, 0, TAU); c.fill() }
    c.fillStyle = 'rgba(0,0,0,.6)'
    for (let i = 0; i < 18; i++) { const x = hashN(i) * ROOM_W; c.fillRect(x, WALL - 6, 3, 6 + hashN(i + 3) * 14) }
  } else {
    const g = c.createRadialGradient(CX, CY, 100, CX, CY, 400)
    g.addColorStop(0, '#16141e'); g.addColorStop(1, '#000')
    c.fillStyle = g; c.fillRect(0, 0, ROOM_W, ROOM_H)
  }
  // The inner lip.
  c.fillStyle = 'rgba(0,0,0,.25)'
  c.fillRect(IX - 4, IX - 4, COLS * TILE + 8, 4)
  c.fillRect(IX - 4, IX - 4, 4, ROWS * TILE + 8)
  c.fillStyle = 'rgba(255,255,255,.08)'
  c.fillRect(IX - 4, IX + ROWS * TILE, COLS * TILE + 8, 4)
  c.fillRect(IX + COLS * TILE, IX - 4, 4, ROWS * TILE + 8)
}

function roomBackground (run, room) {
  const th = CHAPTERS[FLOORS[run.fi].ch]
  const k = `${run.seed}:${run.fi}:${room.key}`
  let c = roomCache.get(k)
  if (c) return c
  c = document.createElement('canvas')
  c.width = ROOM_W; c.height = ROOM_H
  const g = c.getContext('2d')
  drawWalls(g, th, th.id)
  drawFloor(g, th, th.id)
  // The first room teaches the keys, written on the floor.
  if (room.type === 'start' && run.fi === 0) {
    g.fillStyle = 'rgba(43,48,80,.55)'
    g.font = `500 15px ${SERIF}`; g.textAlign = 'center'
    g.fillText('W A S D  to move', CX, CY - 52)
    g.fillText('← ↑ → ↓  to shoot ink', CX, CY - 30)
    g.fillText('E  to set off a bang   ·   Space  to use a word', CX, CY + 60)
    g.fillText('Esc  to pause', CX, CY + 82)
  }
  roomCache.set(k, c)
  return c
}

// --- tiles ------------------------------------------------------------------------
const BLOCK_COLS = { margins: ['#e8b850', '#7ab8e8', '#e87a7a', '#8ad08a'], index: ['#c89860', '#b07848', '#d8b078'], stacks: ['#a86a3a', '#8a5a2a', '#c88a4a'], archive: ['#8a96aa', '#7a86a0', '#9aa6ba'], press: ['#6a6a72', '#7a7a82'], unwritten: ['#3a3450', '#2a2440'] }
function drawTile (c, t, x, y, i, chId, time) {
  const s = TILE
  if (t === T.BLOCK || t === T.TINTED) {
    const cols = BLOCK_COLS[chId]
    const col = cols[i % cols.length]
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x + 3, y + 6, s - 4, s - 4)
    c.fillStyle = shade(col, -0.25); c.fillRect(x + 2, y + 8, s - 4, s - 10)
    c.fillStyle = col; c.fillRect(x + 2, y + 2, s - 4, s - 10)
    c.fillStyle = shade(col, 0.25); c.fillRect(x + 2, y + 2, s - 4, 4)
    c.strokeStyle = shade(col, -0.4); c.lineWidth = 1.5; c.strokeRect(x + 6, y + 6, s - 12, s - 18)
    c.fillStyle = shade(col, -0.5); c.font = `700 18px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.fillText('ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(hashN(i * 3.7) * 26)], x + s / 2, y + s / 2 - 3)
    if (t === T.TINTED) { c.strokeStyle = '#c84a8a'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 8, y + 8); c.lineTo(x + s - 8, y + s - 14); c.moveTo(x + s - 8, y + 8); c.lineTo(x + 8, y + s - 14); c.stroke() }
  } else if (t === T.METAL) {
    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x + 3, y + 6, s - 4, s - 4)
    c.fillStyle = '#6a7080'; c.fillRect(x + 2, y + 8, s - 4, s - 10)
    c.fillStyle = '#9aa0b0'; c.fillRect(x + 2, y + 2, s - 4, s - 10)
    c.fillStyle = '#c8ccd8'; c.fillRect(x + 2, y + 2, s - 4, 3)
    c.fillStyle = '#5a6070'; for (const [dx, dy] of [[6, 6], [s - 9, 6], [6, s - 15], [s - 9, s - 15]]) c.fillRect(x + dx, y + dy, 3, 3)
  } else if (t === T.POT) {
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x + s / 2, y + s - 6, 13, 5, 0, 0, TAU); c.fill()
    c.fillStyle = '#20264a'; c.beginPath(); c.moveTo(x + 9, y + s - 8); c.lineTo(x + 11, y + 14); c.lineTo(x + s - 11, y + 14); c.lineTo(x + s - 9, y + s - 8); c.closePath(); c.fill()
    c.fillStyle = '#3a4280'; c.fillRect(x + 13, y + 16, 4, s - 26)
    c.fillStyle = '#1a1a1a'; c.fillRect(x + 14, y + 8, s - 28, 7)
    c.fillStyle = '#c8a050'; c.fillRect(x + 13, y + 13, s - 26, 2)
  } else if (t === T.PIT) {
    c.fillStyle = chId === 'margins' ? '#1e2440' : '#0a0a12'
    c.beginPath(); roundRect(c, x + 2, y + 2, s - 4, s - 4, 9); c.fill()
    c.strokeStyle = 'rgba(120,140,220,.25)'; c.lineWidth = 1.5
    c.beginPath(); c.ellipse(x + s / 2, y + s / 2, 8 + Math.sin(time * 2 + i) * 2, 4, 0, 0, TAU); c.stroke()
  } else if (t === T.SPIKE) {
    for (const [dx, dy] of [[8, 10], [22, 8], [12, 24], [26, 26]]) { c.strokeStyle = '#9aa0b0'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x + dx, y + dy + 6); c.lineTo(x + dx, y + dy); c.lineTo(x + dx + 9, y + dy); c.lineTo(x + dx + 9, y + dy + 6); c.stroke(); c.strokeStyle = '#e8ecf4'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + dx, y + dy); c.lineTo(x + dx + 9, y + dy); c.stroke() }
  } else if (t === T.FIRE) {
    c.fillStyle = '#f4ecd8'; c.save(); c.translate(x + s / 2, y + s - 10); c.rotate(-0.15); c.fillRect(-12, -6, 24, 10); c.restore()
    for (let k = 0; k < 3; k++) {
      const fx = x + s / 2 + (k - 1) * 6; const h = 14 + Math.sin(time * 9 + k * 2 + i) * 4
      c.fillStyle = k === 1 ? '#ffd040' : '#ff7a2a'
      c.beginPath(); c.moveTo(fx - 5, y + s - 12); c.quadraticCurveTo(fx - 4, y + s - 12 - h * 0.6, fx, y + s - 12 - h); c.quadraticCurveTo(fx + 4, y + s - 12 - h * 0.6, fx + 5, y + s - 12); c.fill()
    }
  }
}

function roundRect (c, x, y, w, h, r) { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath() }
function shade (hex, k) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255; let g = (n >> 8) & 255; let b = n & 255
  if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k } else { r *= 1 + k; g *= 1 + k; b *= 1 + k }
  return `rgb(${r | 0},${g | 0},${b | 0})`
}

// --- doors --------------------------------------------------------------------------
const DOOR_COLS = { normal: ['#7a5a3a', '#5a3e24'], treasure: ['#e8b830', '#a87a10'], shop: ['#4a9a5a', '#2a6a3a'], boss: ['#b83030', '#701818'], library: ['#4a6aba', '#2a3a7a'], curse: ['#6a2a7a', '#3a1048'], miniboss: ['#a85a2a', '#6a3418'], secret: ['#3a3a3a', '#1a1a1a'], deal: ['#f4ecd8', '#c8b890'] }
function drawDoor (c, d, door, open, time) {
  const rot = { n: 0, e: Math.PI / 2, s: Math.PI, w: -Math.PI / 2 }[d]
  const at = { n: [CX, IX - 2], s: [CX, ROOM_H - IX + 2], w: [IX - 2, CY], e: [ROOM_W - IX + 2, CY] }[d]
  c.save()
  c.translate(at[0], at[1])
  c.rotate(rot)
  if (door.kind === 'secret') {
    c.fillStyle = '#000'; c.beginPath(); c.ellipse(0, -8, 20, 16, 0, Math.PI, 0); c.fill()
    c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 2; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 8, -2); c.lineTo(i * 10, -26); c.stroke() }
    c.restore(); return
  }
  let [col, dark] = DOOR_COLS[door.kind] || DOOR_COLS.normal
  if (door.kind === 'deal' && door.deal === 'nemesis') { col = '#5a1a1a'; dark = '#2a0808' }
  c.fillStyle = dark
  c.beginPath(); c.moveTo(-30, 4); c.lineTo(-30, -24); c.quadraticCurveTo(0, -46, 30, -24); c.lineTo(30, 4); c.fill()
  c.fillStyle = col
  c.beginPath(); c.moveTo(-25, 4); c.lineTo(-25, -22); c.quadraticCurveTo(0, -40, 25, -22); c.lineTo(25, 4); c.fill()
  c.fillStyle = '#0a0a10'
  c.beginPath(); c.moveTo(-18, 6); c.lineTo(-18, -18); c.quadraticCurveTo(0, -31, 18, -18); c.lineTo(18, 6); c.fill()
  if (!open || door.locked) {
    // Closed: two panels, like the covers of a book.
    c.fillStyle = shade(col, -0.15)
    c.fillRect(-18, -20, 17.5, 26); c.fillRect(0.5, -20, 17.5, 26)
    c.fillStyle = shade(col, 0.2); c.fillRect(-2, -20, 4, 26)
  }
  if (door.locked) { c.fillStyle = '#d83a3a'; c.beginPath(); c.moveTo(-6, -20); c.lineTo(6, -20); c.lineTo(6, -4); c.lineTo(0, -8); c.lineTo(-6, -4); c.fill() }
  const mark = { treasure: '★', shop: '₲', boss: '☠', library: '📖', curse: '✖', miniboss: '!', deal: door.deal === 'nemesis' ? '♠' : '♥' }[door.kind]
  if (mark) { c.fillStyle = door.kind === 'deal' ? (door.deal === 'nemesis' ? '#e04848' : '#ff6a9a') : '#fff6d8'; c.font = `700 12px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.save(); c.translate(0, -26); c.rotate(-rot); c.fillText(mark, 0, 0); c.restore() }
  c.restore()
}

/* global Path2D */
// --- characters ---------------------------------------------------------------------
const pathCache = new Map()
const P = (d) => { let p = pathCache.get(d); if (!p) { p = new Path2D(d); pathCache.set(d, p) } return p }
export function drawHead (c, id, color, x, y, size, flip = false, blink = false) {
  const shapes = HEADS[id] || HEADS.wirdo
  c.save()
  c.translate(x, y)
  c.scale((flip ? -1 : 1) * size / 64, size / 64)
  c.translate(-32, -32)
  for (const s of shapes) {
    const isEye = blink && (s.fill === '#fff' || s.fill === '#16162a')
    if (isEye) continue
    if (s.fill) { c.fillStyle = s.fill === '$c' ? color : s.fill; c.fill(P(s.d)) }
    if (s.stroke) { c.strokeStyle = s.stroke === '$c' ? color : s.stroke; c.lineWidth = s.w; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(P(s.d)) }
  }
  if (blink) { c.strokeStyle = '#16162a'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(20, 33); c.quadraticCurveTo(25, 36, 30, 33); c.moveTo(34, 33); c.quadraticCurveTo(39, 36, 44, 33); c.stroke() }
  c.restore()
}

function drawPlayer (c, run, time) {
  const p = run.p
  const ch = character(run.char)
  const moving = Math.hypot(p.vx, p.vy) > 20
  const bob = moving ? Math.abs(Math.sin(time * 14)) * 2 : Math.sin(time * 3) * 0.6
  const fly = p.flight ? 6 + Math.sin(time * 5) * 2 : 0
  if (p.inv > 0 && Math.floor(time * 20) % 2 === 0) c.globalAlpha = 0.35
  const s = p.stats.size
  // Shadow.
  c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(p.x, p.y + 10 * s, 11 * s, 4 * s, 0, 0, TAU); c.fill()
  c.save()
  c.translate(p.x, p.y - fly)
  c.scale(s, s)
  if (p.transforms.length) { c.shadowColor = '#ffe9a0'; c.shadowBlur = 12 }
  if (p.flight) { c.fillStyle = 'rgba(255,255,255,.85)'; for (const sgn of [-1, 1]) { c.save(); c.scale(sgn, 1); c.rotate(Math.sin(time * 18) * 0.4); c.beginPath(); c.ellipse(13, -6, 9, 4, -0.5, 0, TAU); c.fill(); c.restore() } }
  // Body: a little rounded stem with feet.
  const col = ch.color
  c.fillStyle = shade(col, -0.25)
  const step = moving ? Math.sin(time * 14) * 3 : 0
  c.beginPath(); c.ellipse(-5 + step, 9 - bob * 0.2, 4.5, 3, 0, 0, TAU); c.ellipse(5 - step, 9 - bob * 0.2, 4.5, 3, 0, 0, TAU); c.fill()
  c.fillStyle = col
  c.beginPath(); roundRect(c, -8, -6 - bob, 16, 15, 6); c.fill()
  c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(-5, -4 - bob, 3, 9)
  c.shadowBlur = 0
  // Head turns with your shots (or your feet).
  const lookX = Math.abs(p.aimX) > 0.3 && p.fireCd > 0 ? p.aimX : p.faceX
  const blink = Math.floor(time * 0.7 + p.x * 0.001) % 7 === 0 && (time * 0.7) % 1 < 0.12
  drawHead(c, ch.id, col, lookX * 2, -18 - bob, 30, lookX < -0.2, blink)
  c.restore()
  c.globalAlpha = 1
  if (p.buffs.shield > 0) { c.strokeStyle = `rgba(160,200,255,${0.5 + Math.sin(time * 10) * 0.2})`; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y - 10, 26, 0, TAU); c.stroke() }
  if (p.aegisUp) { c.strokeStyle = 'rgba(138,180,232,.5)'; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y - 10, 22, 0, TAU); c.stroke() }
}

// --- enemies -------------------------------------------------------------------------
function eyes (c, x, y, r, look = 0, angry = false) {
  for (const s of [-1, 1]) {
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x + s * r * 0.9, y, r * 0.7, r * 0.8, 0, 0, TAU); c.fill()
    c.fillStyle = '#111'; c.beginPath(); c.arc(x + s * r * 0.9 + look * r * 0.25, y + r * 0.1, r * 0.38, 0, TAU); c.fill()
    if (angry) { c.strokeStyle = '#111'; c.lineWidth = Math.max(1, r * 0.3); c.beginPath(); c.moveTo(x + s * r * 0.3, y - r * 0.9); c.lineTo(x + s * r * 1.5, y - r * 1.3); c.stroke() }
  }
}

const CHAMP = { red: '#ff4a4a', blue: '#4a8aff', gold: '#f2c23e', green: '#5ad05a' }
function drawFoe (c, e, run, time) {
  const def = FOES[e.id]
  const art = def.art || { k: 'blob', col: def.color }
  if (art.k === 'none' || e.dead) return
  const p = run.p
  const look = Math.sign(p.x - e.x)
  const z = e.z || 0
  if (e.hidden) {
    c.fillStyle = '#6a5040'; c.beginPath(); c.ellipse(e.x, e.y + 6, 12, 5, 0, 0, TAU); c.fill()
    c.fillStyle = '#4a3428'; for (let i = 0; i < 4; i++) c.fillRect(e.x - 10 + i * 6, e.y + 2 + Math.sin(time * 9 + i) * 2, 3, 3)
    return
  }
  c.save()
  c.globalAlpha = e.fade ?? 1
  // Shadow.
  if (!def.boss || art.k !== 'pen') { c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(e.x, e.y + e.r * 0.8, e.r * 0.9, e.r * 0.35, 0, 0, TAU); c.fill() }
  c.translate(e.x, e.y - z - (e.fly ? 6 + Math.sin(time * 4 + e.x) * 3 : 0))
  if (e.champion) { c.shadowColor = CHAMP[e.champion]; c.shadowBlur = 14 }
  if (e.st.freeze) { c.fillStyle = 'rgba(180,230,255,.6)'; c.fillRect(-e.r - 3, -e.r - 3, e.r * 2 + 6, e.r * 2 + 6) }
  const r = e.r
  const text = art.fromData ? e.data.text || art.text : art.text
  switch (art.k) {
    case 'blob': {
      const w = 1 + Math.sin(time * 6 + e.x) * 0.06
      c.fillStyle = art.col
      c.beginPath(); c.ellipse(0, 0, r * w, r / w, 0, 0, TAU); c.fill()
      c.beginPath(); c.arc(r * 0.6, -r * 0.5, r * 0.35, 0, TAU); c.arc(-r * 0.7, r * 0.3, r * 0.3, 0, TAU); c.fill()
      eyes(c, 0, -r * 0.15, r * 0.32, look, true)
      break
    }
    case 'glyph': {
      const size = r * 2.4 * (art.size || 1)
      c.font = `800 ${size}px ${art.ch === 'K' ? SERIF : FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'
      if (art.spin) c.rotate(time * 2)
      c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,.85)'; c.strokeText(art.ch, 0, 0)
      c.fillStyle = art.col; c.fillText(art.ch, 0, 0)
      if (art.spin) c.rotate(-time * 2)
      eyes(c, 0, art.ch === ',' || art.ch === '’' ? -r * 0.6 : -r * 0.1, Math.max(2.2, r * 0.25), look, Boolean(def.boss))
      break
    }
    case 'word': {
      c.font = `800 ${art.small ? 11 : 14}px ${FONT}`
      const w = Math.max(r * 2, c.measureText(text).width + 14)
      const h = art.wide ? r * 1.6 : r * 1.7
      let bg = art.bg
      if (art.hotCold) bg = e.data.hot ? '#d8602a' : '#3a8ac8'
      if (art.twoTone) bg = e.data.hot ? '#c8502a' : '#3a7ab8'
      if (e.id === 'homoWord' && e.data.right) { c.shadowColor = '#fff6a0'; c.shadowBlur = 18 }
      c.fillStyle = shade(bg, -0.3)
      c.beginPath(); art.blob ? c.ellipse(0, 3, w / 2 + 4, h / 2 + 4, 0, 0, TAU) : roundRect(c, -w / 2, -h / 2 + 3, w, h, 8); c.fill()
      c.fillStyle = bg
      c.beginPath(); art.blob ? c.ellipse(0, 0, w / 2 + (Math.sin(time * 5) * 2), h / 2 + 2, 0, 0, TAU) : roundRect(c, -w / 2, -h / 2, w, h, 8); c.fill()
      c.shadowBlur = 0
      c.fillStyle = art.col; c.textAlign = 'center'; c.textBaseline = 'middle'
      c.fillText(text, 0, h * 0.14)
      eyes(c, 0, -h * 0.3, Math.max(2.5, r * 0.18), look, Boolean(def.boss) && !def.mini)
      if (art.spoon) { c.fillStyle = '#c8ccd8'; c.save(); c.rotate(Math.sin(time * 3) * 0.4); c.fillRect(w / 2 - 2, -2, 18, 4); c.beginPath(); c.ellipse(w / 2 + 20, 0, 7, 5, 0, 0, TAU); c.fill(); c.restore() }
      break
    }
    case 'fluff': {
      c.fillStyle = art.col
      for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + time; c.beginPath(); c.arc(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.6, r * 0.5, 0, TAU); c.fill() }
      c.beginPath(); c.ellipse(-r * 0.5, -r * 1.1, 3, 7, -0.3, 0, TAU); c.ellipse(r * 0.5, -r * 1.1, 3, 7, 0.3, 0, TAU); c.fill()
      eyes(c, 0, -r * 0.1, 2.6, look)
      break
    }
    case 'moth': {
      const f = Math.sin(time * 22) * 0.5 + 0.6
      c.fillStyle = art.col
      for (const s of [-1, 1]) { c.save(); c.scale(s * f, 1); c.beginPath(); c.ellipse(r * 0.7, -2, r * 0.8, r * 0.6, 0.4, 0, TAU); c.fill(); c.restore() }
      c.fillStyle = '#6a5a40'; c.beginPath(); c.ellipse(0, 0, 3, r * 0.6, 0, 0, TAU); c.fill()
      eyes(c, 0, -r * 0.4, 1.8, look)
      break
    }
    case 'worm': {
      c.fillStyle = art.col
      for (let i = 2; i >= 0; i--) { c.beginPath(); c.arc(0, i * 6, r * (0.9 - i * 0.12), 0, TAU); c.fill() }
      eyes(c, 0, -2, 2.8, look, true)
      c.fillStyle = '#8a3a4a'; c.beginPath(); c.arc(0, 5, 3, 0, Math.PI); c.fill()
      break
    }
    case 'fish': {
      const a = Math.atan2(p.y - e.y, p.x - e.x)
      c.rotate(a)
      c.fillStyle = art.col
      c.beginPath(); c.ellipse(0, 0, r * 1.3, r * 0.55, 0, 0, TAU); c.fill()
      c.beginPath(); c.moveTo(-r * 1.2, 0); c.lineTo(-r * 2, -5); c.lineTo(-r * 2, 5); c.fill()
      c.strokeStyle = art.col; c.lineWidth = 1; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(r, 0); c.lineTo(r * 1.9, s * 6 + Math.sin(time * 20) * 2); c.stroke() }
      c.fillStyle = '#111'; c.beginPath(); c.arc(r * 0.7, -2, 1.5, 0, TAU); c.fill()
      break
    }
    case 'quill': {
      c.rotate(Math.sin(time * 2) * 0.2 - 0.6)
      c.fillStyle = art.col
      c.beginPath(); c.moveTo(0, r * 1.4); c.quadraticCurveTo(-r * 0.9, -r * 0.2, 0, -r * 1.5); c.quadraticCurveTo(r * 0.9, -r * 0.2, 0, r * 1.4); c.fill()
      c.strokeStyle = '#8a7a5a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, r * 1.6); c.lineTo(0, -r * 1.4); c.stroke()
      c.rotate(-(Math.sin(time * 2) * 0.2 - 0.6))
      eyes(c, 0, -r * 0.2, 2.4, look, true)
      break
    }
    case 'bookend': {
      c.fillStyle = '#5a5e6a'; c.fillRect(-r, r * 0.4, r * 2, r * 0.6); c.fillRect(-r, -r, r * 0.6, r * 2)
      c.fillStyle = art.col; c.fillRect(-r * 0.3, -r * 0.8, r * 1.2, r * 1.3)
      eyes(c, r * 0.3, -r * 0.3, 2.6, look, true)
      break
    }
    case 'capital': {
      c.font = `800 ${r * 2.6}px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'
      c.lineWidth = 5; c.strokeStyle = '#e8ecf4'; c.strokeText(e.data.ch || 'A', 0, 0)
      c.fillStyle = art.col; c.fillText(e.data.ch || 'A', 0, 0)
      eyes(c, 0, -r * 0.1, 3.4, look, true)
      break
    }
    case 'stamp': {
      c.fillStyle = '#6a4a2a'; c.fillRect(-4, -r * 1.3, 8, r * 0.8); c.beginPath(); c.arc(0, -r * 1.4, 7, 0, TAU); c.fill()
      c.fillStyle = '#3a3a3a'; c.fillRect(-r, -r * 0.5, r * 2, r * 0.8)
      c.fillStyle = art.col; c.fillRect(-r * 0.9, r * 0.3, r * 1.8, r * 0.45)
      eyes(c, 0, -r * 0.1, 2.8, look, true)
      break
    }
    case 'eraser': {
      if (e.data.wind > 0) c.translate(Math.sin(time * 60) * 2, 0)
      c.fillStyle = art.col; c.beginPath(); roundRect(c, -r * 1.2, -r * 0.7, r * 2.4, r * 1.4, 5); c.fill()
      c.fillStyle = '#4a7ac8'; c.fillRect(r * 0.2, -r * 0.7, r * 0.7, r * 1.4)
      eyes(c, -r * 0.4, -r * 0.1, 2.8, look, true)
      break
    }
    case 'ghost': {
      const big = art.big ? 1.3 : 1
      c.fillStyle = art.col
      c.beginPath(); c.arc(0, -r * 0.2 * big, r * big, Math.PI, 0)
      for (let i = 0; i <= 4; i++) c.lineTo(r * big - (i * 2 * r * big) / 4, r * big * (0.7 + (i % 2) * 0.25 + Math.sin(time * 6 + i) * 0.08))
      c.closePath(); c.fill()
      c.fillStyle = '#2a2a3a'; c.beginPath(); c.ellipse(-r * 0.35, -r * 0.3, 2.6 * big, 4 * big, 0, 0, TAU); c.ellipse(r * 0.35, -r * 0.3, 2.6 * big, 4 * big, 0, 0, TAU); c.fill()
      if (art.big) { c.fillStyle = '#2a2a3a'; c.font = `600 9px ${SERIF}`; c.textAlign = 'center'; c.fillText('(by whom?)', 0, r * 0.4) }
      break
    }
    case 'bar': {
      c.fillStyle = art.col; c.fillRect(-r * 1.5, -r * 0.55, r * 3, r * 1.1)
      c.fillStyle = '#e8e8e8'; c.beginPath(); c.arc(-r * 0.5, -1, 2.6, 0, TAU); c.arc(r * 0.5, -1, 2.6, 0, TAU); c.fill()
      c.fillStyle = '#e04848'; c.beginPath(); c.arc(-r * 0.5 + look, -1, 1.3, 0, TAU); c.arc(r * 0.5 + look, -1, 1.3, 0, TAU); c.fill()
      break
    }
    case 'lorem': {
      c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(-r * 1.6 + 4, -r + 6, r * 3.2, r * 2)
      c.fillStyle = art.col; c.fillRect(-r * 1.6, -r, r * 3.2, r * 2)
      c.strokeStyle = '#9a9a9a'; c.lineWidth = 1; c.strokeRect(-r * 1.6, -r, r * 3.2, r * 2)
      c.fillStyle = '#6a6a6a'; c.font = `500 8px ${SERIF}`; c.textAlign = 'left'
      const lines = ['Lorem ipsum dolor sit', 'amet, consectetur', 'adipiscing elit, sed', 'do eiusmod tempor']
      lines.forEach((l, i) => c.fillText(l, -r * 1.45, -r * 0.35 + i * 10))
      eyes(c, 0, -r * 0.65, 4, look, true)
      break
    }
    case 'tile': {
      c.fillStyle = '#c8a878'; c.beginPath(); roundRect(c, -r, -r + 3, r * 2, r * 2, 4); c.fill()
      c.fillStyle = art.col; c.beginPath(); roundRect(c, -r, -r, r * 2, r * 2, 4); c.fill()
      c.fillStyle = '#3a2a1a'; c.font = `800 ${r * 1.3}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e.data.l || '?', 0, 1)
      break
    }
    case 'rex': {
      const f = look < 0 ? -1 : 1
      c.scale(f, 1)
      c.fillStyle = shade(art.col, -0.2)
      c.beginPath(); c.moveTo(-r * 0.6, r * 0.2); c.quadraticCurveTo(-r * 1.8, r * 0.3 + Math.sin(time * 3) * 4, -r * 2.1, -r * 0.2); c.quadraticCurveTo(-r * 1.4, r * 0.7, -r * 0.4, r * 0.7); c.fill()
      c.fillStyle = art.col
      c.beginPath(); c.ellipse(0, r * 0.1, r * 0.95, r * 0.75, 0, 0, TAU); c.fill()
      c.beginPath(); c.ellipse(r * 0.75, -r * 0.6, r * 0.65, r * 0.42, -0.2, 0, TAU); c.fill()
      c.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(r * 0.75 + i * 6, -r * 0.35); c.lineTo(r * 0.78 + i * 6, -r * 0.25); c.lineTo(r * 0.81 + i * 6, -r * 0.35); c.fill() }
      c.fillStyle = shade(art.col, -0.25); c.fillRect(r * 0.2, r * 0.1, 8, 4); c.fillRect(-r * 0.4, r * 0.7, 9, 10); c.fillRect(r * 0.2, r * 0.7, 9, 10)
      c.fillStyle = '#fff'; c.beginPath(); c.arc(r * 0.95, -r * 0.75, 5, 0, TAU); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(r * 1.0, -r * 0.75, 2.5, 0, TAU); c.fill()
      // A book of synonyms under one arm.
      c.fillStyle = '#c84a3a'; c.fillRect(-r * 0.2, -r * 0.1, 14, 18); c.fillStyle = '#f4ecd8'; c.fillRect(-r * 0.2 + 12, -r * 0.1 + 1, 2, 16)
      break
    }
    case 'pen': {
      const a = Math.atan2(p.y - e.y, p.x - e.x)
      c.rotate(a - Math.PI / 2)
      c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(-r * 0.4 + 6, -r * 1.8 + 8, r * 0.8, r * 3)
      c.fillStyle = art.col; c.beginPath(); roundRect(c, -r * 0.45, -r * 2, r * 0.9, r * 2.8, 8); c.fill()
      c.fillStyle = shade(art.col, 0.3); c.fillRect(-r * 0.3, -r * 1.9, 4, r * 2.5)
      c.fillStyle = '#e8ecf4'; c.fillRect(-r * 0.47, -r * 2.1, r * 0.94, 10); c.fillRect(r * 0.3, -r * 2, 5, r * 1.3)
      c.fillStyle = '#d8d0c0'; c.beginPath(); c.moveTo(-r * 0.45, r * 0.8); c.lineTo(r * 0.45, r * 0.8); c.lineTo(0, r * 1.6); c.fill()
      c.fillStyle = art.col; c.beginPath(); c.moveTo(-4, r * 1.35); c.lineTo(4, r * 1.35); c.lineTo(0, r * 1.62); c.fill()
      c.rotate(-(a - Math.PI / 2))
      eyes(c, 0, -r * 0.4, 5, look, true)
      break
    }
    case 'auto': {
      c.fillStyle = shade(art.col, -0.3); c.beginPath(); roundRect(c, -r * 1.4, -r + 4, r * 2.8, r * 1.8, 12); c.fill()
      c.fillStyle = art.col; c.beginPath(); roundRect(c, -r * 1.4, -r, r * 2.8, r * 1.8, 12); c.fill()
      c.beginPath(); c.moveTo(-r * 0.4, r * 0.8); c.lineTo(-r * 0.8, r * 1.4); c.lineTo(0, r * 0.8); c.fill()
      c.fillStyle = '#fff'; c.font = `700 12px ${FONT}`; c.textAlign = 'center'
      c.fillText(Math.floor(time * 2) % 2 ? 'did you mean' : 'did you mean|', 0, r * 0.45)
      eyes(c, 0, -r * 0.3, 5, look, true)
      break
    }
  }
  c.shadowBlur = 0
  // Status: burning, poisoned, charmed, frightened, slowed; a white flash when hit.
  if (e.st.burn) { c.fillStyle = '#ff8a2a'; for (let i = 0; i < 3; i++) { c.globalAlpha = 0.7; c.beginPath(); c.arc((i - 1) * r * 0.5, -r - 2 - ((time * 40 + i * 9) % 12), 2.5, 0, TAU); c.fill() } }
  if (e.st.poison) { c.fillStyle = 'rgba(120,210,80,.35)'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill() }
  if (e.st.charm) { c.globalAlpha = 1; heart(c, 0, -r - 10, 6, '#ff6aa8') }
  if (e.st.fear) { c.globalAlpha = 1; c.fillStyle = '#8a5aaa'; c.font = `700 12px ${FONT}`; c.textAlign = 'center'; c.fillText('!?', 0, -r - 6) }
  if (e.st.slow) { c.strokeStyle = 'rgba(120,200,255,.7)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r + 2, 0, TAU); c.stroke() }
  if (e.flash > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.55; c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over' }
  c.restore()
  if (e.data.rope) { c.strokeStyle = '#8a7a5a'; c.lineWidth = 2; c.beginPath(); c.moveTo(CX, IX - 30); c.lineTo(e.x, e.y - e.r); c.stroke() }
}

function heart (c, x, y, s, col) {
  c.fillStyle = col
  c.beginPath()
  c.moveTo(x, y + s * 0.9)
  c.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35)
  c.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9)
  c.fill()
}

// --- pickups, pedestals, bangs ---------------------------------------------------
function drawPick (c, k, time) {
  const bob = Math.sin(time * 4 + k.x) * 1.5
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(k.x, k.y + 8, 8, 3, 0, 0, TAU); c.fill()
  const y = k.y + bob
  switch (k.kind) {
    case 'heart': heart(c, k.x, y, 9, '#e8364a'); c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.arc(k.x - 4, y - 3, 2, 0, TAU); c.fill(); break
    case 'half': c.save(); c.beginPath(); c.rect(k.x - 12, y - 12, 12, 24); c.clip(); heart(c, k.x, y, 9, '#e8364a'); c.restore(); break
    case 'soul': heart(c, k.x, y, 9, '#7aaaf0'); c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(k.x - 4, y - 3, 2, 0, TAU); c.fill(); break
    case 'glyph': case 'glyph5': {
      const big = k.kind === 'glyph5'
      const sx = Math.abs(Math.cos(time * 3 + k.x))
      c.fillStyle = big ? '#c8ccd8' : '#f2c23e'; c.beginPath(); c.ellipse(k.x, y, 8 * sx + 1, 8, 0, 0, TAU); c.fill()
      c.fillStyle = big ? '#8a90a0' : '#b07a12'; c.font = `800 ${big ? 9 : 10}px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'
      if (sx > 0.4) c.fillText(big ? '5' : 'g', k.x, y + 0.5)
      break
    }
    case 'bang': case 'bang2':
      for (let i = 0; i < (k.kind === 'bang2' ? 2 : 1); i++) {
        const ox = k.kind === 'bang2' ? (i ? 6 : -6) : 0
        c.fillStyle = '#1a1a24'; c.beginPath(); c.arc(k.x + ox, y + 1, 8, 0, TAU); c.fill()
        c.fillStyle = '#fff'; c.font = `800 11px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', k.x + ox, y + 1.5)
        c.strokeStyle = '#c8a050'; c.lineWidth = 2; c.beginPath(); c.moveTo(k.x + ox + 4, y - 6); c.lineTo(k.x + ox + 7, y - 10); c.stroke()
      }
      break
    case 'mark':
      c.fillStyle = '#d83a3a'; c.beginPath(); c.moveTo(k.x - 5, y - 9); c.lineTo(k.x + 5, y - 9); c.lineTo(k.x + 5, y + 9); c.lineTo(k.x, y + 5); c.lineTo(k.x - 5, y + 9); c.fill()
      c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(k.x - 3, y - 9, 2, 14)
      break
    case 'charge':
      c.fillStyle = '#3a3a42'; c.beginPath(); roundRect(c, k.x - 6, y - 10, 12, 20, 3); c.fill()
      c.fillStyle = '#ffe14a'; c.beginPath(); c.moveTo(k.x + 1, y - 7); c.lineTo(k.x - 3, y + 1); c.lineTo(k.x, y + 1); c.lineTo(k.x - 1, y + 7); c.lineTo(k.x + 3, y - 1); c.lineTo(k.x, y - 1); c.fill()
      break
  }
  if (k.price) { c.fillStyle = '#fff6d8'; c.font = `700 11px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 3; c.strokeText(`${k.price}g`, k.x, k.y + 24); c.fillText(`${k.price}g`, k.x, k.y + 24) }
}

const FLAVOR = { blessed: '#f2c23e', cursed: '#9a4ad8' }
export function wordTile (c, item, x, y, time, scale = 1) {
  const label = item.word.length > 14 ? `${item.word.slice(0, 13)}…` : item.word
  c.font = `700 ${12 * scale}px ${FONT}`
  const w = Math.max(30 * scale, c.measureText(label).width + 16 * scale)
  const h = 20 * scale
  const glow = FLAVOR[item.flavor] || item.color
  c.save()
  c.shadowColor = glow; c.shadowBlur = 12 + Math.sin(time * 3) * 4
  c.fillStyle = item.active ? '#24284a' : '#fffaf0'
  c.beginPath(); roundRect(c, x - w / 2, y - h / 2, w, h, 6 * scale); c.fill()
  c.shadowBlur = 0
  c.lineWidth = 2 * scale; c.strokeStyle = glow
  c.beginPath(); roundRect(c, x - w / 2, y - h / 2, w, h, 6 * scale); c.stroke()
  c.fillStyle = item.active ? '#fffaf0' : '#24284a'; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillText(label, x, y + 1 * scale)
  // Quality: dots under the word.
  for (let i = 0; i < item.q; i++) { c.fillStyle = glow; c.beginPath(); c.arc(x - (item.q - 1) * 3 * scale + i * 6 * scale, y + h / 2 + 4 * scale, 1.6 * scale, 0, TAU); c.fill() }
  c.restore()
}

function drawPed (c, s, time) {
  // A lectern.
  c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(s.x, s.y + 12, 16, 5, 0, 0, TAU); c.fill()
  c.fillStyle = '#6a4a2a'; c.fillRect(s.x - 4, s.y - 4, 8, 16)
  c.fillStyle = '#8a6a42'; c.beginPath(); c.moveTo(s.x - 15, s.y - 2); c.lineTo(s.x + 15, s.y - 2); c.lineTo(s.x + 11, s.y - 10); c.lineTo(s.x - 11, s.y - 10); c.fill()
  c.fillStyle = '#5a3a1e'; c.fillRect(s.x - 12, s.y + 10, 24, 4)
  if (!s.item) return
  wordTile(c, s.item, s.x, s.y - 28 + Math.sin(time * 2.5 + s.x) * 3, time)
  const label = s.price ? `${s.price}g` : s.cost ? `${'♥'.repeat(s.cost / 2)}` : null
  if (label) { c.font = `700 12px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(label, s.x, s.y + 28); c.fillStyle = s.cost ? '#e8364a' : '#fff6d8'; c.fillText(label, s.x, s.y + 28) }
}

// What a word on a pedestal does: its name, what it means, its effects, and
// what it costs.
const FLAVOR_TEXT = { blessed: 'Blessed: a word you love', cursed: 'Cursed: a word you can’t stand' }
const KIND_TEXT = { n: 'noun · carried', v: 'verb · use with Space', a: 'adjective · changes your ink', s: 'adjective · changes your ink', r: 'adverb · makes you better' }
function wrap (c, text, width) {
  const words = String(text).split(' ')
  const lines = []
  let line = ''
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (c.measureText(t).width > width && line) { lines.push(line); line = w } else line = t }
  if (line) lines.push(line)
  return lines
}
function wordCard (c, s, alpha) {
  const it = s.item
  const W2 = 210
  const effects = describe(it)
  c.save()
  c.globalAlpha = alpha
  c.font = `500 10.5px ${SERIF}`
  const def = it.def ? wrap(c, it.def, W2 - 20).slice(0, 2) : []
  const lines = [...effects.slice(0, 5)]
  const h = 44 + def.length * 13 + lines.length * 14 + (it.flavor ? 14 : 0) + (s.price || s.cost ? 14 : 0)
  let x = s.x - W2 / 2
  let y = s.y - 52 - h
  if (y < 8) y = s.y + 34
  x = Math.max(8, Math.min(ROOM_W - W2 - 8, x))
  c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 10
  c.fillStyle = '#fffaf0'; c.beginPath(); roundRect(c, x, y, W2, h, 8); c.fill()
  c.shadowBlur = 0
  c.strokeStyle = FLAVOR[it.flavor] || it.color || '#a9b0c8'; c.lineWidth = 2; c.stroke()
  c.textAlign = 'left'; c.textBaseline = 'alphabetic'
  c.fillStyle = '#24284a'; c.font = `700 15px ${FONT}`; c.fillText(it.word, x + 10, y + 19)
  c.fillStyle = '#8a8aa0'; c.font = `500 9.5px ${FONT}`; c.fillText(`${KIND_TEXT[it.pos] || 'word'}${it.q ? ` · ${'★'.repeat(it.q)}` : ''}`, x + 10, y + 32)
  let yy = y + 46
  c.fillStyle = '#5a5a70'; c.font = `italic 500 10.5px ${SERIF}`
  for (const l of def) { c.fillText(l, x + 10, yy); yy += 13 }
  c.font = `600 11px ${FONT}`
  for (const l of lines) { c.fillStyle = /down|Costs/.test(l) ? '#b83a3a' : '#2a6a4a'; c.fillText(`• ${l}`, x + 10, yy + 2); yy += 14 }
  if (it.flavor) { c.fillStyle = it.flavor === 'blessed' ? '#a87a10' : '#7a3ab8'; c.font = `700 10px ${FONT}`; c.fillText(FLAVOR_TEXT[it.flavor], x + 10, yy + 3); yy += 14 }
  if (s.price || s.cost) { c.fillStyle = '#24284a'; c.font = `700 10.5px ${FONT}`; c.fillText(s.price ? `${s.price} glyphs` : `Costs ${s.cost / 2} heart${s.cost === 2 ? '' : 's'} for good`, x + 10, yy + 3) }
  c.restore()
}

function drawTrap (c, trap, time) {
  if (!trap) return
  if (trap.kind === 'hatch') {
    c.fillStyle = '#0a0a10'; c.beginPath(); roundRect(c, trap.x - 22, trap.y - 15, 44, 30, 6); c.fill()
    c.strokeStyle = '#6a4a2a'; c.lineWidth = 4; c.beginPath(); roundRect(c, trap.x - 22, trap.y - 15, 44, 30, 6); c.stroke()
    c.strokeStyle = '#8a6a42'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(trap.x - 10, trap.y - 8 + i * 8); c.lineTo(trap.x + 10, trap.y - 8 + i * 8); c.stroke() }
  } else if (trap.kind === 'end') {
    c.save(); c.translate(trap.x, trap.y + Math.sin(time * 2) * 2)
    c.shadowColor = '#ffe9a0'; c.shadowBlur = 20
    c.fillStyle = trap.deep ? '#b8a8ff' : '#e8b830'; c.fillRect(-16, -20, 32, 40)
    c.fillStyle = '#fff6d8'; c.fillRect(-12, -16, 26, 34)
    c.shadowBlur = 0
    c.fillStyle = '#5a3a1e'; c.font = `600 9px ${SERIF}`; c.textAlign = 'center'; c.fillText('The', 1, -4); c.fillText('End', 1, 7)
    c.restore()
  } else if (trap.kind === 'deeper') {
    c.save(); c.translate(trap.x, trap.y)
    for (let i = 0; i < 5; i++) { c.rotate(time * 0.8); c.fillStyle = `rgba(${100 + i * 20}, ${80 + i * 10}, 200, ${0.25 + i * 0.1})`; c.beginPath(); c.ellipse(0, 0, 26 - i * 4, 18 - i * 3, 0, 0, TAU); c.fill() }
    c.restore()
    c.fillStyle = '#e8e4ff'; c.font = `600 9px ${SERIF}`; c.textAlign = 'center'; c.fillText('…unwritten', trap.x, trap.y + 32)
  }
}

// --- the whole frame ----------------------------------------------------------------------
export function drawRun (ctx, run, fx, time, opts = {}) {
  const room = run.room
  const r = run.floor.rooms[room.key]
  const chId = CHAPTERS[FLOORS[run.fi].ch].id
  ctx.save()
  if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake)
  ctx.drawImage(roomBackground(run, r), 0, 0)
  ctx.drawImage(fx.decalCanvas(`${run.fi}:${room.key}`), 0, 0)
  for (const [d, door] of Object.entries(r.doors)) if (!door.hidden || opts.showSecrets) drawDoor(ctx, d, door, room.doorsOpen, time)
  // Puddles.
  for (const cr of room.creep) {
    ctx.globalAlpha = Math.min(1, cr.life) * (cr.mine ? 0.45 : 0.75)
    ctx.fillStyle = cr.kind === 'ink' ? '#141830' : cr.kind === 'mine-poison' ? '#6ac04a' : '#3a5ac8'
    ctx.beginPath(); ctx.ellipse(cr.x, cr.y, cr.r, cr.r * 0.7, 0, 0, TAU); ctx.fill()
  }
  ctx.globalAlpha = 1
  // Tiles.
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const t = r.tiles[ty * COLS + tx]
      if (t !== T.FLOOR) drawTile(ctx, t, IX + tx * TILE, IX + ty * TILE, ty * COLS + tx + run.fi * 91, chId, time)
    }
  }
  drawTrap(ctx, r.trap, time)
  drawTrap(ctx, r.trap2, time)
  // Shop keeper.
  if (r.type === 'shop') { ctx.font = `600 12px ${SERIF}`; ctx.fillStyle = CHAPTERS[FLOORS[run.fi].ch].dark ? '#f2e6cc' : '#3a2414'; ctx.textAlign = 'center'; ctx.fillText('The Bookseller', CX, IX + 26); drawHead(ctx, 'wirdo', '#7a5a3a', CX, IX + 52, 30) }
  if (r.type === 'deal') { ctx.font = `600 14px ${SERIF}`; ctx.fillStyle = r.deal === 'nemesis' ? '#e04848' : '#f2c23e'; ctx.textAlign = 'center'; ctx.fillText(r.deal === 'nemesis' ? 'Words you can’t stand. They’ll cost you.' : 'Words you love. Take one.', CX, IX + 30) }
  // Everything that stands, back to front.
  const things = []
  for (const k of room.picks) things.push([k.y - 4, () => drawPick(ctx, k, time)])
  for (const s of room.peds) things.push([s.y, () => drawPed(ctx, s, time)])
  for (const b of room.bangs) {
    things.push([b.y, () => {
      ctx.fillStyle = '#1a1a24'; ctx.beginPath(); ctx.arc(b.x, b.y, 10 + (b.fuse < 0.5 ? Math.sin(time * 40) * 2 : 0), 0, TAU); ctx.fill()
      ctx.fillStyle = b.fuse < 0.5 && Math.floor(time * 20) % 2 ? '#ff4a4a' : '#fff'; ctx.font = `800 13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', b.x, b.y + 1)
      ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.arc(b.x + 6, b.y - 11, 2 + Math.random() * 2, 0, TAU); ctx.fill()
    }])
  }
  for (const e of room.foes) things.push([e.y + (FOES[e.id].boss ? 6 : 0), () => drawFoe(ctx, e, run, time)])
  for (const f of room.fams) {
    things.push([f.y, () => {
      if (f.kind === 'orbital') { ctx.fillStyle = '#e8ecf4'; ctx.beginPath(); ctx.arc(f.x, f.y, 8, 0, TAU); ctx.fill(); ctx.strokeStyle = '#8ab4e8'; ctx.lineWidth = 2; ctx.stroke(); return }
      if (f.u || f.kind === 'shooter') { ctx.font = `800 20px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(f.u ? 'u' : 'a', f.x, f.y - 6); ctx.fillStyle = f.u ? character('q').color : '#4a8a6a'; ctx.fillText(f.u ? 'u' : 'a', f.x, f.y - 6); eyes(ctx, f.x, f.y - 8, 1.6, 0); return }
      if (f.kind === 'chaser') { ctx.fillStyle = '#b08a50'; ctx.beginPath(); ctx.ellipse(f.x, f.y, 9, 7, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(f.x - 6, f.y - 6, 3, 0, TAU); ctx.arc(f.x + 6, f.y - 6, 3, 0, TAU); ctx.fill(); eyes(ctx, f.x, f.y - 1, 1.8, 0); return }
      if (f.kind === 'helper') { ctx.fillStyle = '#fff6a0'; ctx.beginPath(); ctx.arc(f.x, f.y, 7, 0, TAU); ctx.fill(); eyes(ctx, f.x, f.y, 1.5, 0) }
    }])
  }
  if (!run.over || run.over.won) things.push([run.p.y, () => drawPlayer(ctx, run, time)])
  things.sort((a, b) => a[0] - b[0])
  for (const [, fn] of things) fn()
  // Shots: yours (ink) and theirs.
  for (const t of room.tears) {
    if (t.age < 0) continue
    const rr = 5 * t.size * (t.growK || 1)
    const col = tearColor(t.flags) || '#2a3a8a'
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(t.x, t.y + 12, rr, rr * 0.4, 0, 0, TAU); ctx.fill()
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(t.x, t.y, rr, 0, TAU); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(t.x - rr * 0.35, t.y - rr * 0.35, rr * 0.35, 0, TAU); ctx.fill()
    if (t.crit) { ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 1.5; ctx.stroke() }
  }
  for (const s of room.shots) {
    if (s.wait > 0) continue
    const y = s.y - (s.z || 0)
    if (s.z) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + 4, s.r, s.r * 0.4, 0, 0, TAU); ctx.fill() }
    if (s.text) {
      ctx.font = `700 11px ${FONT}`; const w = ctx.measureText(s.text).width + 8
      ctx.fillStyle = s.col; ctx.beginPath(); roundRect(ctx, s.x - w / 2, y - 8, w, 16, 7); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.text, s.x, y + 1)
      continue
    }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, y, s.r + 1.5, 0, TAU); ctx.fill()
    ctx.fillStyle = s.col; ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, TAU); ctx.fill()
  }
  // Warnings and speech.
  for (const f of room.fx) {
    const k = f.t / f.max
    if (f.k === 'line') { ctx.strokeStyle = f.col; ctx.globalAlpha = 0.25 + (1 - k) * 0.6; ctx.lineWidth = 2 + (1 - k) * 3; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.setLineDash([]) }
    if (f.k === 'warn') { ctx.strokeStyle = '#e04848'; ctx.globalAlpha = 0.4 + (1 - k) * 0.5; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + k * 0.5), 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, TAU); ctx.fillStyle = '#e04848'; ctx.fill() }
    if (f.k === 'tether') { ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 4; ctx.shadowColor = '#ffe14a'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = `800 16px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(',', (f.x1 + f.x2) / 2, (f.y1 + f.y2) / 2 + 4) }
    if (f.k === 'say' && f.e && !f.e.dead) {
      ctx.globalAlpha = Math.min(1, f.t * 3)
      ctx.font = `600 12px ${SERIF}`; const w = ctx.measureText(f.text).width + 14
      const x = Math.max(w / 2 + 4, Math.min(ROOM_W - w / 2 - 4, f.e.x)); const y = Math.max(20, f.e.y - f.e.r - 30)
      ctx.fillStyle = '#fffaf0'; ctx.beginPath(); roundRect(ctx, x - w / 2, y - 11, w, 22, 8); ctx.fill()
      ctx.strokeStyle = '#2b3050'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.fillStyle = '#2b3050'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.text, x, y + 1)
    }
    ctx.globalAlpha = 1
  }
  fx.draw(ctx)
  // Walk up to a word and it says what it does.
  let near = null
  for (const s of room.peds) { if (!s.item) continue; const d = Math.hypot(s.x - run.p.x, s.y - run.p.y); if (d < 85 && (!near || d < near.d)) near = { s, d } }
  // Darker chapters get a vignette.
  const th = CHAPTERS[FLOORS[run.fi].ch]
  if (th.dark) { const g = ctx.createRadialGradient(run.p.x, run.p.y, 80, run.p.x, run.p.y, 420); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, chId === 'unwritten' ? 'rgba(0,0,0,.65)' : 'rgba(0,0,0,.35)'); ctx.fillStyle = g; ctx.fillRect(0, 0, ROOM_W, ROOM_H) }
  if (fx.hurtFlash > 0) { ctx.fillStyle = `rgba(220,40,40,${fx.hurtFlash * 0.25})`; ctx.fillRect(0, 0, ROOM_W, ROOM_H) }
  if (fx.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${fx.flash * 0.5})`; ctx.fillRect(0, 0, ROOM_W, ROOM_H) }
  if (run.swap > 0) { ctx.fillStyle = 'rgba(106,122,154,.12)'; ctx.fillRect(0, 0, ROOM_W, ROOM_H) }
  if (near) wordCard(ctx, near.s, Math.min(1, (85 - near.d) / 25))
  ctx.restore()
  drawHud(ctx, run, time, opts)
}

// --- the HUD ----------------------------------------------------------------------------
function heartIcon (c, x, y, fill, soul = false) {
  // fill: 0, 1 (half) or 2.
  heart(c, x, y, 7.5, 'rgba(0,0,0,.45)')
  if (!fill) { c.strokeStyle = soul ? '#7aaaf0' : '#e8364a'; c.lineWidth = 1.2; c.save(); c.translate(0, 0); c.restore(); return }
  c.save()
  if (fill === 1) { c.beginPath(); c.rect(x - 12, y - 12, 12, 24); c.clip() }
  heart(c, x, y, 6.5, soul ? '#7aaaf0' : '#e8364a')
  c.restore()
}

function drawHud (c, run, time, opts) {
  const p = run.p
  // The active word, top left, with its charge.
  if (p.active) {
    const a = p.active
    c.fillStyle = 'rgba(10,10,20,.55)'; c.beginPath(); roundRect(c, 6, 6, 44, 44, 8); c.fill()
    c.save(); c.font = `800 ${a.item.word.length > 6 ? 9 : 11}px ${FONT}`; c.fillStyle = a.charge >= a.max ? '#fff6a0' : '#c8c8d8'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(a.item.word.slice(0, 9), 28, 24); c.restore()
    for (let i = 0; i < a.max; i++) { c.fillStyle = i < a.charge ? (a.charge >= a.max ? '#ffe14a' : '#8ad08a') : 'rgba(255,255,255,.2)'; c.fillRect(10 + (i * 36) / a.max, 40, 36 / a.max - 1.5, 5) }
    if (a.charge >= a.max) { c.strokeStyle = `rgba(255,225,74,${0.5 + Math.sin(time * 6) * 0.3})`; c.lineWidth = 2; c.beginPath(); roundRect(c, 6, 6, 44, 44, 8); c.stroke() }
  }
  // Hearts.
  const hx = p.active ? 62 : 14
  let i = 0
  const row = (n) => [hx + (n % 8) * 17, 16 + Math.floor(n / 8) * 16]
  for (let h = 0; h < p.maxHp / 2; h++) { const [x, y] = row(i++); heartIcon(c, x, y, Math.max(0, Math.min(2, p.hp - h * 2))) }
  for (let s = 0; s < Math.ceil(p.soul / 2); s++) { const [x, y] = row(i++); heartIcon(c, x, y, Math.min(2, p.soul - s * 2), true) }
  // Glyphs, bangs, bookmarks.
  const counts = [['glyph', p.glyphs], ['bang', p.bangs], ['mark', p.marks]]
  counts.forEach(([kind, n], j) => {
    const y = 64 + j * 18
    drawPick(c, { kind, x: 16, y: y - 3 }, 0)
    c.fillStyle = '#fff'; c.font = `700 12px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)'
    const t = String(n).padStart(2, '0'); c.strokeText(t, 28, y); c.fillText(t, 28, y)
  })
  drawMinimap(c, run, opts.bigMap)
  // The boss's health along the bottom.
  const bosses = run.room.foes.filter((e) => e.boss && !e.dead && !e.ignore && !FOES[e.id].noBar)
  if (bosses.length) {
    const hp = bosses.reduce((s, e) => s + Math.max(0, e.hp), 0)
    const max = Math.max(hp, bosses.reduce((s, e) => s + e.maxHp, 0))
    const r = run.floor.rooms[run.room.key]
    const def = FOES[r.boss] || FOES[bosses[0].id]
    const w = 300
    c.fillStyle = 'rgba(10,10,20,.6)'; c.beginPath(); roundRect(c, CX - w / 2 - 4, ROOM_H - 30, w + 8, 18, 6); c.fill()
    c.fillStyle = '#5a1a1a'; c.fillRect(CX - w / 2, ROOM_H - 26, w, 10)
    const bg = c.createLinearGradient(CX - w / 2, 0, CX + w / 2, 0); bg.addColorStop(0, '#e04848'); bg.addColorStop(1, '#ff8a6a')
    c.fillStyle = bg; c.fillRect(CX - w / 2, ROOM_H - 26, w * Math.max(0, hp / (max || 1)), 10)
    c.fillStyle = '#fff'; c.font = `700 10px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.7)'
    const label = def.mini ? `${def.name} · grammar sin` : def.name
    c.strokeText(label, CX, ROOM_H - 35); c.fillText(label, CX, ROOM_H - 35)
  }
  // Banners: a floor's name, a boss, a word picked up.
  const b = run.banner
  if (b) {
    const a = Math.min(1, b.t * 2, (b.max || 3) - b.t + 0.3)
    c.globalAlpha = Math.max(0, a)
    c.fillStyle = 'rgba(10,10,20,.6)'; c.fillRect(0, 70, ROOM_W, b.sub ? 62 : 44)
    c.fillStyle = '#fff6d8'; c.font = `700 24px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.fillText(b.title, CX, 94)
    if (b.sub) { c.fillStyle = '#d8d0c0'; c.font = `500 13px ${FONT}`; c.fillText(b.sub, CX, 120) }
    c.globalAlpha = 1
  }
  if (run.swap > 0) { c.fillStyle = '#c8d0f0'; c.font = `700 13px ${FONT}`; c.textAlign = 'center'; c.fillText('↔ Your feet are swapped! ↔', CX, ROOM_H - 50) }
}

function drawMinimap (c, run, big) {
  const rooms = Object.values(run.floor.rooms).filter((r) => (r.seen || r.visited) && r.type !== 'deal')
  if (!rooms.length) return
  const s = big ? 18 : 9; const sh = big ? 13 : 7
  const xs = rooms.map((r) => r.x); const ys = rooms.map((r) => r.y)
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys)
  const w = (maxX - minX + 1) * (s + 2) + 8; const h = (maxY - minY + 1) * (sh + 2) + 8
  const ox = big ? CX - w / 2 : ROOM_W - w - 6; const oy = big ? CY - h / 2 : 6
  c.fillStyle = big ? 'rgba(10,10,20,.85)' : 'rgba(10,10,20,.45)'; c.beginPath(); roundRect(c, ox, oy, w, h, 6); c.fill()
  const icon = { boss: '☠', treasure: '★', shop: '₲', secret: '?', library: '📖', curse: '✖', miniboss: '!' }
  for (const r of rooms) {
    const x = ox + 4 + (r.x - minX) * (s + 2); const y = oy + 4 + (r.y - minY) * (sh + 2)
    c.fillStyle = r.key === run.floor.cur ? '#fff' : r.visited ? 'rgba(220,220,235,.7)' : 'rgba(150,150,170,.4)'
    c.fillRect(x, y, s, sh)
    if (icon[r.type] && (r.visited || r.seen)) { c.fillStyle = r.key === run.floor.cur ? '#222' : '#ffe9a0'; c.font = `700 ${big ? 10 : 7}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(icon[r.type], x + s / 2, y + sh / 2 + 0.5) }
  }
  if (big) { c.fillStyle = '#fff6d8'; c.font = `700 14px ${SERIF}`; c.textAlign = 'center'; c.fillText(FLOORS[run.fi].name, CX, oy - 12) }
}

// Turns a tick's events into particles.
export function eventsToFx (run, fx, evs) {
  const key = `${run.fi}:${run.room.key}`
  for (const e of evs) {
    switch (e.k) {
      case 'splash': fx.burst(e.x, e.y, e.col || (e.enemy ? '#2b3050' : '#3a4a9a'), 5, 70, 2.2 * (e.size || 1), 0.35); break
      case 'hit': fx.burst(e.x, e.y, e.col, e.crit ? 10 : 4, e.crit ? 160 : 90, 2.4, 0.3); if (e.crit) fx.add({ k: 'text', text: 'CRIT', x: e.x, y: e.y - 18, vy: -40, col: '#ffe14a', size: 11, life: 0.6, max: 0.6 }); break
      case 'die': fx.burst(e.x, e.y, e.col, e.boss ? 40 : 14, e.boss ? 220 : 140, 3.2, 0.7); fx.splat(key, e.x, e.y, e.col, (e.r || 10) * (e.boss ? 2 : 1.2)); if (e.boss) fx.shake = 14; break
      case 'boom': fx.add({ k: 'ring', x: e.x, y: e.y, r: e.r, col: '#ffb040', life: 0.4, max: 0.4 }); fx.burst(e.x, e.y, '#ff8a3a', 16, 220, 4, 0.5); fx.burst(e.x, e.y, '#4a4a4a', 12, 90, 6, 0.9); fx.splat(key, e.x, e.y, '#202020', e.r * 0.5); fx.shake = Math.max(fx.shake, 9); break
      case 'tile': for (let i = 0; i < 10; i++) { const a = Math.random() * TAU; fx.add({ k: 'chip', x: e.x, y: e.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 60, g: 300, col: e.t === T.POT ? '#20264a' : '#c8a060', size: 4, life: 0.7, max: 0.7 }) } if (e.t === T.POT) fx.splat(key, e.x, e.y, '#20264a', 16); break
      case 'hurt': fx.hurtFlash = 1; fx.shake = Math.max(fx.shake, 6); break
      case 'lightning': fx.add({ k: 'bolt', pts: e.pts, life: 0.2, max: 0.2 }); break
      case 'pickup': fx.burst(e.x, e.y, '#fff6a0', 8, 80, 2, 0.4); break
      case 'heal': fx.add({ k: 'heart', x: run.p.x, y: run.p.y - 30, vy: -30, life: 0.8, max: 0.8 }); break
      case 'poof': fx.burst(e.x, e.y, '#d8d8e8', 12, 80, 5, 0.6); break
      case 'print': fx.add({ k: 'print', x: e.x, y: e.y, life: 3, max: 3 }); break
      case 'shake': fx.shake = Math.max(fx.shake, e.v); break
      case 'secret': fx.flash = 0.6; break
      case 'block': fx.add({ k: 'text', text: 'wrong one!', x: e.x, y: e.y - 20, vy: -30, col: '#e8e8ff', size: 11, life: 0.6, max: 0.6 }); break
      case 'transform': fx.flash = 1; break
      case 'item': fx.burst(run.p.x, run.p.y - 20, e.item.color || '#fff', 24, 140, 3, 0.8); break
      case 'floor': fx.clearDecals(); clearRoomCache(); break
    }
  }
}

// What the banner says when you pick something up.
export function itemBanner (item, describeFn) {
  return { title: item.word, sub: describeFn(item).slice(0, 2).join(' · ') + (item.flavor ? ` · ${item.flavor === 'blessed' ? 'a word you love' : 'a word you can’t stand'}` : ''), t: 3, max: 3 }
}
export function transformBanner (topic) { const t = TRANSFORMS[topic]; return { title: `${t.name}!`, sub: t.text, t: 3.2, max: 3.2 } }
