// Everything that wants you gone: punctuation that's come loose, the
// creatures of old books, the seven grammar sins, and the bosses, each a
// kind of word trouble. Each has hit points, a size, how it's drawn (`art`,
// see the renderer) and `update`, called every tick with a small API.

import { TILE, COLS, ROWS, WALL, ROOM_W, ROOM_H, T } from './content.js'
import { moveBody, enemyShot, spawnFoe, rand, damage, explode, hurt, tileAt, tileAtT } from './engine.js'

const IX = WALL
const IW = COLS * TILE
const IH = ROWS * TILE
const CX = ROOM_W / 2
const CY = ROOM_H / 2
const len = (x, y) => Math.hypot(x, y)
const TAU = Math.PI * 2

// --- the API foes get ---------------------------------------------------------------
const apis = new WeakMap()
export function foeApi (run) {
  let api = apis.get(run)
  if (api) return api
  api = {
    run,
    get p () { return run.p },
    get room () { return run.room },
    rand: () => rand(run),
    range: (a, b) => a + rand(run) * (b - a),
    pick: (a) => a[Math.floor(rand(run) * a.length)],
    ang: (e, x = run.p.x, y = run.p.y) => Math.atan2(y - e.y, x - e.x),
    dist: (e, o = run.p) => len(o.x - e.x, o.y - e.y),
    shoot (e, a, spd, opt = {}) { enemyShot(run, e.x + Math.cos(a) * (e.r * 0.6), e.y + Math.sin(a) * (e.r * 0.6), Math.cos(a) * spd, Math.sin(a) * spd, { col: FOES[e.id]?.shot || FOES[e.id]?.color, from: FOES[e.id]?.name, ...opt }); run.ev.push({ k: 'eshoot' }) },
    ring (e, n, spd, off = 0, opt = {}) { for (let i = 0; i < n; i++) api.shoot(e, off + (i / n) * TAU, spd, opt) },
    spread (e, a, n, arc, spd, opt = {}) { for (let i = 0; i < n; i++) api.shoot(e, a + (n === 1 ? 0 : (i / (n - 1) - 0.5) * arc), spd, opt) },
    aimed (e, spd, opt = {}) { api.shoot(e, api.ang(e), spd, opt) },
    moveBy (e, dx, dy) { moveBody(run, e, dx, dy, { fly: e.fly, ghost: e.ghost }) },
    toward (e, x, y, spd, dt) { const d = len(x - e.x, y - e.y); if (d > 1) api.moveBy(e, ((x - e.x) / d) * Math.min(d, spd * dt), ((y - e.y) / d) * Math.min(d, spd * dt)) },
    // Walkers follow the way round obstacles; fliers go straight.
    chase (e, spd, dt) {
      const p = run.p
      if (e.fly || api.los(e)) return api.toward(e, p.x, p.y, spd, dt)
      const f = run.room.flow
      if (!f) return
      const tx = Math.floor((e.x - IX) / TILE); const ty = Math.floor((e.y - IX) / TILE)
      let best = null; let bd = f[ty * COLS + tx] ?? Infinity
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = tx + dx; const ny = ty + dy
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
        if (dx && dy && (tileAtT(run, tx + dx, ty) !== T.FLOOR || tileAtT(run, tx, ty + dy) !== T.FLOOR)) continue
        const d = f[ny * COLS + nx]
        if (d < bd) { bd = d; best = [nx, ny] }
      }
      if (best) api.toward(e, IX + best[0] * TILE + TILE / 2, IX + best[1] * TILE + TILE / 2, spd, dt)
      else api.toward(e, p.x, p.y, spd, dt)
    },
    wander (e, spd, dt) {
      if (!e.wt || e.t > e.wt || api.dist(e, { x: e.wx, y: e.wy }) < 8) { const s = api.spot(); e.wx = s.x; e.wy = s.y; e.wt = e.t + 1.5 + rand(run) * 2 }
      api.toward(e, e.wx, e.wy, spd, dt)
    },
    // A free spot in the room (not a wall, block or pit).
    spot (margin = 1) {
      for (let i = 0; i < 40; i++) {
        const tx = margin + Math.floor(rand(run) * (COLS - margin * 2)); const ty = margin + Math.floor(rand(run) * (ROWS - margin * 2))
        if (tileAtT(run, tx, ty) === T.FLOOR) return { x: IX + tx * TILE + TILE / 2, y: IX + ty * TILE + TILE / 2 }
      }
      return { x: CX, y: CY }
    },
    los (e, o = run.p) {
      const d = len(o.x - e.x, o.y - e.y)
      for (let s = TILE / 2; s < d; s += TILE / 2) { const t = tileAt(run, e.x + ((o.x - e.x) / d) * s, e.y + ((o.y - e.y) / d) * s); if (t !== T.FLOOR && t !== T.SPIKE && t !== T.PIT) return false }
      return true
    },
    spawn: (id, x, y, opt) => spawnFoe(run, id, x, y, opt),
    creep (x, y, r = 18, life = 4) { run.room.creep.push({ x, y, r, life, kind: 'ink' }) },
    line (x1, y1, x2, y2, t = 0.8, col = '#e04848') { run.room.fx.push({ k: 'line', x1, y1, x2, y2, t, max: t, col }) },
    warn (x, y, r, t = 0.8) { run.room.fx.push({ k: 'warn', x, y, r, t, max: t }) },
    say (e, text, t = 1.6) { run.room.fx.push({ k: 'say', e, text, t, max: t }) },
    ev: (o) => run.ev.push(o),
    shake: (v) => run.ev.push({ k: 'shake', v }),
    hurtPlayer: (n, by) => hurt(run, n, by),
    hit: (e, dmg) => damage(run, e, dmg),
    boom: (x, y, r, dmg) => explode(run, x, y, r, dmg),
    kin: (e, ids) => run.room.foes.filter((o) => o !== e && !o.dead && ids.includes(o.id)),
    clampIn (e, m = 0) { e.x = Math.max(IX + e.r + m, Math.min(IX + IW - e.r - m, e.x)); e.y = Math.max(IX + e.r + m, Math.min(IX + IH - e.r - m, e.y)) },
    // Bounce off the walls of the room (like a screensaver).
    bounce (e, dt) {
      e.x += e.vx * dt; e.y += e.vy * dt
      if (e.x < IX + e.r) { e.x = IX + e.r; e.vx = Math.abs(e.vx) }
      if (e.x > IX + IW - e.r) { e.x = IX + IW - e.r; e.vx = -Math.abs(e.vx) }
      if (e.y < IX + e.r) { e.y = IX + e.r; e.vy = Math.abs(e.vy) }
      if (e.y > IX + IH - e.r) { e.y = IX + IH - e.r; e.vy = -Math.abs(e.vy) }
    },
    // A jump: up for `air` seconds toward a point, landing there.
    jump (e, x, y, air = 0.7) { e.jump = { x0: e.x, y0: e.y, x1: x, y1: y, t: 0, air } },
    stepJump (e, dt) {
      const j = e.jump
      if (!j) return false
      j.t += dt
      const k = Math.min(1, j.t / j.air)
      e.x = j.x0 + (j.x1 - j.x0) * k; e.y = j.y0 + (j.y1 - j.y0) * k
      e.z = Math.sin(k * Math.PI) * 60
      e.untouchable = e.z > 20
      if (k >= 1) { e.z = 0; e.untouchable = false; e.jump = null; return 'landed' }
      return true
    },
    every (e, key, sec) { e[key] = (e[key] ?? sec * (0.5 + rand(run) * 0.5)) - (1 / 60) * (e.slowK || 1); if (e[key] <= 0) { e[key] += sec; return true } return false },
    IX, IW, IH, CX, CY
  }
  apis.set(run, api)
  return api
}

// --- shared behaviours ---------------------------------------------------------------
const chaser = (spd) => (e, a, dt) => a.chase(e, spd, dt)
const glyph = (ch, col, size = 1, extra = {}) => ({ k: 'glyph', ch, col, size, ...extra })
const word = (text, col, bg, extra = {}) => ({ k: 'word', text, col, bg, ...extra })

// Every boss's hit points are scaled by how deep you are (see spawnFoe).
export const FOES = {
  // --- the margins ---
  smudge: { name: 'a smudge', hp: 10, r: 12, color: '#2b3050', art: { k: 'blob', col: '#2b3050' }, update: chaser(52) },
  comma: {
    name: 'a comma', hp: 5, r: 9, fly: true, color: '#3a3f6b', art: glyph(',', '#3a3f6b', 1.1),
    update (e, a, dt) { e.data.j = (e.data.j || 0) + dt; if (e.data.j > 0.4) { e.data.j = 0; e.data.dx = a.range(-1, 1); e.data.dy = a.range(-1, 1) } const g = a.ang(e); a.moveBy(e, (Math.cos(g) * 55 + (e.data.dx || 0) * 70) * dt, (Math.sin(g) * 55 + (e.data.dy || 0) * 70) * dt) }
  },
  period: {
    name: 'a full stop', hp: 12, r: 11, color: '#20223a', shot: '#20223a', art: glyph('●', '#20223a', 0.9),
    update (e, a, dt) { if (a.every(e, 'cd', 2.3) && a.los(e)) a.aimed(e, 150); if (a.dist(e) < 120) a.toward(e, e.x - (a.p.x - e.x), e.y - (a.p.y - e.y), 40, dt) }
  },
  inkblot: { name: 'an inkblot', hp: 16, r: 14, color: '#1e2240', art: { k: 'blob', col: '#1e2240', big: true }, update: chaser(40), onDeath (e, a) { for (const s of [-1, 1]) a.spawn('blotlet', e.x + s * 10, e.y) } },
  blotlet: { name: 'a blotlet', hp: 5, r: 8, color: '#1e2240', art: { k: 'blob', col: '#1e2240' }, update: chaser(72) },
  dustbunny: {
    name: 'a dust bunny', hp: 8, r: 10, color: '#a8a090', art: { k: 'fluff', col: '#c8c0b0' },
    update (e, a, dt) { if (a.stepJump(e, dt)) return; if (a.every(e, 'hop', 1.1)) { const g = a.ang(e) + a.range(-0.6, 0.6); const d = Math.min(80, a.dist(e)); a.jump(e, e.x + Math.cos(g) * d, e.y + Math.sin(g) * d, 0.45) } }
  },
  hyphen: {
    name: 'a hyphen', hp: 10, r: 11, color: '#4a3a6a', art: glyph('–', '#4a3a6a', 1.4),
    update (e, a, dt) {
      if (e.data.dash) { const ox = e.x; const oy = e.y; a.moveBy(e, e.data.dash[0] * 280 * dt, e.data.dash[1] * 280 * dt); if (Math.abs(e.x - ox) + Math.abs(e.y - oy) < 1) { e.data.dash = null; e.data.rest = 0.6 } return }
      if (e.data.rest > 0) { e.data.rest -= dt; return }
      const p = a.p
      if (Math.abs(p.y - e.y) < 14 && a.los(e)) e.data.dash = [Math.sign(p.x - e.x), 0]
      else if (Math.abs(p.x - e.x) < 14 && a.los(e)) e.data.dash = [0, Math.sign(p.y - e.y)]
      else a.wander(e, 45, dt)
    }
  },
  // --- the index ---
  quotes: {
    name: 'quotation marks', hp: 14, r: 12, fly: true, color: '#6a4a2a', art: glyph('“', '#6a4a2a', 1.3),
    update (e, a, dt) { a.wander(e, 50, dt); if (a.every(e, 'cd', 2.2)) { const g = a.ang(e); for (const s of [-1, 1]) enemyShot(a.run, e.x - Math.sin(g) * 7 * s, e.y + Math.cos(g) * 7 * s, Math.cos(g) * 150, Math.sin(g) * 150, { col: '#6a4a2a', from: 'quotation marks' }) } }
  },
  bracket: {
    name: 'a bracket', hp: 16, r: 13, color: '#5a3a1e', art: glyph('[', '#5a3a1e', 1.3),
    init (e, a) { if (!e.parent && !e.data.twin) { const o = a.spawn('bracket', ROOM_W - e.x, e.y, { parent: e, data: { twin: true } }); if (o) o.data.close = true } },
    update (e, a, dt) { const p = a.p; a.toward(e, e.data.close ? p.x + 70 : p.x - 70, p.y, 55, dt); if (a.every(e, 'cd', 2.4)) a.spread(e, e.data.close ? Math.PI : 0, 3, 0.5, 140) }
  },
  asterisk: {
    name: 'an asterisk', hp: 18, r: 13, fly: true, color: '#8a5a2a', art: glyph('*', '#8a5a2a', 1.6, { spin: true }),
    update (e, a, dt) { a.wander(e, 30, dt); if (a.every(e, 'cd', 2.6)) { e.data.off = (e.data.off || 0) + 0.39; a.ring(e, 8, 120, e.data.off) } }
  },
  caret: {
    name: 'a caret', hp: 12, r: 11, color: '#7a4a2a', art: glyph('^', '#7a4a2a', 1.4),
    update (e, a, dt) { const j = a.stepJump(e, dt); if (j === 'landed') { a.ring(e, 6, 110); a.shake(2) } if (j) return; if (a.every(e, 'hop', 1.8)) a.jump(e, a.p.x, a.p.y, 0.75) }
  },
  moth: {
    name: 'a page moth', hp: 6, r: 10, fly: true, color: '#b8a888', art: { k: 'moth', col: '#c8b898' },
    update (e, a, dt) { const g = a.ang(e) + Math.sin(e.t * 3) * 0.9; a.moveBy(e, Math.cos(g) * 75 * dt, Math.sin(g) * 75 * dt) }
  },
  bookworm: {
    name: 'a bookworm', hp: 18, r: 12, color: '#c87a8a', art: { k: 'worm', col: '#e89aaa' },
    update (e, a, dt) {
      e.data.c = (e.data.c || 0) + dt
      const c = e.data.c % 4.2
      e.untouchable = c < 1.6
      e.harmless = c < 1.6
      e.hidden = c < 1.6
      if (c < 1.6) a.chase(e, 80, dt)
      if (c >= 2.1 && c - dt < 2.1) a.spread(e, a.ang(e), 3, 0.6, 150)
      if (c >= 3.2 && c - dt < 3.2) a.spread(e, a.ang(e), 3, 0.6, 150)
    }
  },
  // --- the stacks ---
  bang: {
    name: 'an exclamation mark', hp: 10, r: 11, color: '#c83030', art: glyph('!', '#c83030', 1.4),
    update (e, a, dt) { a.chase(e, a.dist(e) < 160 ? 95 : 45, dt) },
    onDeath (e, a) { a.boom(e.x, e.y, 52, 20) }
  },
  query: {
    name: 'a question mark', hp: 14, r: 12, fly: true, color: '#3a8a6a', art: glyph('?', '#3a8a6a', 1.4),
    update (e, a, dt) {
      if (a.every(e, 'tp', 3)) { const s = a.spot(); e.x = s.x; e.y = s.y; e.data.shots = 3; e.data.st = 0.5; a.ev({ k: 'poof', x: e.x, y: e.y }) }
      if (e.data.shots > 0 && (e.data.st -= dt) <= 0) { e.data.st = 0.18; e.data.shots--; a.aimed(e, 170) }
    }
  },
  tilde: {
    name: 'a tilde', hp: 14, r: 12, fly: true, color: '#5a7aaa', art: glyph('~', '#5a7aaa', 1.6),
    update (e, a, dt) { e.data.dir = e.data.dir || (a.rand() < 0.5 ? 1 : -1); e.x += e.data.dir * 70 * dt; e.y += Math.cos(e.t * 4) * 80 * dt; if (e.x < IX + 20 || e.x > IX + IW - 20) e.data.dir *= -1; a.clampIn(e); if (a.every(e, 'cd', 2)) { a.shoot(e, Math.PI / 2, 130); a.shoot(e, -Math.PI / 2, 130) } }
  },
  silverfish: {
    name: 'a silverfish', hp: 6, r: 8, color: '#9aa8b8', art: { k: 'fish', col: '#b8c4d0' },
    update (e, a, dt) { if (a.every(e, 'turn', 0.5)) e.data.g = a.ang(e) + a.range(-0.9, 0.9); const g = e.data.g ?? 0; a.moveBy(e, Math.cos(g) * 140 * dt, Math.sin(g) * 140 * dt) }
  },
  quill: {
    name: 'a quill', hp: 16, r: 12, color: '#3a3020', shot: '#1a1a30', art: { k: 'quill', col: '#f4ecd8' },
    update (e, a, dt) {
      const d = a.dist(e)
      if (d < 170) a.toward(e, e.x - (a.p.x - e.x), e.y - (a.p.y - e.y), 55, dt); else if (d > 230) a.chase(e, 45, dt)
      if (a.every(e, 'cd', 2)) { e.data.aim = a.ang(e); e.data.w = 0.5; a.line(e.x, e.y, e.x + Math.cos(e.data.aim) * 400, e.y + Math.sin(e.data.aim) * 400, 0.5, 'rgba(40,40,70,.5)') }
      if (e.data.w > 0 && (e.data.w -= dt) <= 0) a.shoot(e, e.data.aim, 330, { r: 5 })
    }
  },
  bookend: {
    name: 'a bookend', hp: 22, r: 14, color: '#6a4a2a', armor: 0.6, art: { k: 'bookend', col: '#8a5a32' },
    init (e) { e.armor = 0.6 },
    update (e, a) { if (a.every(e, 'cd', 2)) { e.data.k = !e.data.k; for (let i = 0; i < 4; i++) a.shoot(e, (e.data.k ? 0 : Math.PI / 4) + (i * Math.PI) / 2, 140) } }
  },
  // --- the archive ---
  capital: {
    name: 'a capital letter', hp: 40, r: 18, color: '#2a3a5a', art: { k: 'capital', col: '#2a3a5a' },
    init (e, a) { e.data.ch = a.pick(['A', 'B', 'G', 'M', 'R', 'W', 'K']) },
    update (e, a, dt) { const j = a.stepJump(e, dt); if (j === 'landed') { a.ring(e, 10, 115); a.shake(5) } if (j) return; a.chase(e, 34, dt); if (a.every(e, 'stomp', 4)) a.jump(e, e.x + (a.p.x - e.x) * 0.5, e.y + (a.p.y - e.y) * 0.5, 0.6) }
  },
  stamp: {
    name: 'a rubber stamp', hp: 26, r: 15, color: '#a83030', art: { k: 'stamp', col: '#a83030' },
    update (e, a, dt) { const j = a.stepJump(e, dt); if (j === 'landed') { a.creep(e.x, e.y, 24, 5); for (let i = 0; i < 4; i++) a.shoot(e, (i * Math.PI) / 2, 120); a.shake(4) } if (j) return; if (a.every(e, 'cd', 2.4)) { a.warn(a.p.x, a.p.y, 26, 0.85); a.jump(e, a.p.x, a.p.y, 0.85) } }
  },
  eraser: {
    name: 'an eraser', hp: 26, r: 14, color: '#e8a0a8', art: { k: 'eraser', col: '#f0b0b8' },
    update (e, a, dt) {
      if (e.data.dash) { const ox = e.x; const oy = e.y; a.moveBy(e, e.data.dash[0] * 300 * dt, e.data.dash[1] * 300 * dt); for (const c of a.room.creep) if (c.mine && len(c.x - e.x, c.y - e.y) < 30) c.life = 0; if (Math.abs(e.x - ox) + Math.abs(e.y - oy) < 1 || (e.data.dt -= dt) <= 0) e.data.dash = null; return }
      if (e.data.wind > 0) { if ((e.data.wind -= dt) <= 0) { const g = e.data.g; e.data.dash = [Math.cos(g), Math.sin(g)]; e.data.dt = 1.2 } return }
      a.wander(e, 35, dt)
      if (a.every(e, 'cd', 3)) { e.data.g = a.ang(e); e.data.wind = 0.6 }
    }
  },
  ampersand: { name: 'an ampersand', hp: 30, r: 15, color: '#5a3a7a', art: glyph('&', '#5a3a7a', 1.5), update: chaser(48), onDeath (e, a) { for (const s of [-1, 1]) a.spawn('amphalf', e.x + s * 12, e.y) } },
  amphalf: { name: 'half an ampersand', hp: 12, r: 10, color: '#7a5a9a', art: glyph('&', '#7a5a9a', 0.9), update: chaser(88) },
  semicolon: {
    name: 'a semicolon', hp: 24, r: 13, fly: true, color: '#2a4a6a', art: glyph(';', '#2a4a6a', 1.5),
    update (e, a, dt) { a.chase(e, 35, dt); if (a.every(e, 'cd', 2)) a.aimed(e, 160); if (!e.data.split && e.hp < e.maxHp / 2) { e.data.split = true; a.spawn('comma', e.x, e.y + 14) } }
  },
  ghostwriter: {
    name: 'a ghostwriter', hp: 22, r: 13, fly: true, color: '#a8b0e0', art: { k: 'ghost', col: '#d8dcff' },
    update (e, a, dt) {
      const c = e.t % 3.5
      e.fade = c < 1.5 ? 0.12 : 1
      e.untouchable = c < 1.5
      e.harmless = c < 1.5
      a.chase(e, 50, dt)
      if (c >= 1.8 && c - dt < 1.8) a.ring(e, 4, 120, a.ang(e))
    }
  },
  // --- the press and beyond ---
  redactor: {
    name: 'a redaction', hp: 28, r: 14, color: '#141414', art: { k: 'bar', col: '#141414' },
    update (e, a, dt) {
      a.wander(e, 40, dt)
      if (a.every(e, 'cd', 3.2)) { e.data.h = a.rand() < 0.5; e.data.w = 0.8; const p = a.p; if (e.data.h) a.line(IX, p.y, IX + IW, p.y, 0.8, 'rgba(0,0,0,.45)'); else a.line(p.x, IX, p.x, IX + IH, 0.8, 'rgba(0,0,0,.45)'); e.data.at = e.data.h ? p.y : p.x }
      if (e.data.w > 0 && (e.data.w -= dt) <= 0) {
        for (let i = 0; i < 9; i++) {
          if (e.data.h) enemyShot(a.run, IX + 10, e.data.at, 260, 0, { col: '#141414', wait: i * 0.06, r: 7, from: 'a redaction' })
          else enemyShot(a.run, e.data.at, IX + 10, 0, 260, { col: '#141414', wait: i * 0.06, r: 7, from: 'a redaction' })
        }
      }
    }
  },
  footnote: {
    name: 'a footnote', hp: 4, r: 7, fly: true, color: '#5a5a7a', art: glyph('¹', '#5a5a7a', 1),
    update (e, a, dt) { const g = a.ang(e) + Math.sin(e.t * 6 + e.x) * 0.6; a.moveBy(e, Math.cos(g) * 110 * dt, Math.sin(g) * 110 * dt) }
  },
  filler: { name: 'filler text', hp: 8, r: 11, color: '#8a8a8a', art: word('dolor', '#6a6a6a', '#e4e4e4', { small: true }), update: chaser(55) },

  // --- the seven grammar sins (minibosses) ---
  sinRunon: {
    name: 'The Run-On', title: 'a grammar sin', boss: true, mini: true, hp: 90, r: 14, color: '#6a3a8a', art: word('and', '#fff', '#6a3a8a'),
    init (e, a) { e.data.trail = []; e.data.g = 0; let prev = e; for (let i = 0; i < 4; i++) prev = a.spawn('runSeg', e.x, e.y, { boss: true, parent: e, data: { i: i + 1, text: ['then', 'so', 'and', 'but'][i] } }) || prev },
    update: snake(85, 0.9)
  },
  runSeg: { name: 'a run-on clause', hp: 9999, r: 12, noBar: true, color: '#7a4a9a', art: word('then', '#fff', '#7a4a9a'), boss: true, update: segment, onHit: passToParent },
  sinFragment: {
    name: 'The Fragment', title: 'a grammar sin', boss: true, mini: true, hp: 110, r: 16, color: '#8a4a3a', art: word('Because', '#fff', '#8a4a3a'),
    update (e, a, dt) { a.chase(e, 50, dt); if (a.every(e, 'cd', 2.2)) a.spread(e, a.ang(e), 5, 1, 130); const k = e.hp / e.maxHp; if (k < 0.66 && !e.data.a) { e.data.a = 1; for (let i = 0; i < 2; i++) a.spawn('shard', e.x, e.y, { boss: true }) } if (k < 0.33 && !e.data.b) { e.data.b = 1; for (let i = 0; i < 2; i++) a.spawn('shard', e.x, e.y, { boss: true }) } }
  },
  shard: { name: 'a fragment', hp: 14, r: 9, boss: true, color: '#a85a4a', art: word('…', '#fff', '#a85a4a', { small: true }), update: chaser(80) },
  sinSplice: {
    name: 'The Comma Splice', title: 'a grammar sin', boss: true, mini: true, hp: 70, r: 14, color: '#3a6a8a', art: word('I came', '#fff', '#3a6a8a'),
    init (e, a) { if (!e.data.half) { const o = a.spawn('sinSplice', ROOM_W - e.x, e.y, { boss: true, data: { half: true } }); if (o) { o.data.other = e; e.data.other = o } } },
    update (e, a, dt) {
      const o = e.data.other
      const g = (e.data.half ? Math.PI : 0) + e.t * 0.8
      a.toward(e, CX + Math.cos(g) * 150, CY + Math.sin(g) * 80, 120, dt)
      if (o && !o.dead && !e.data.half) {
        a.run.room.fx.push({ k: 'tether', x1: e.x, y1: e.y, x2: o.x, y2: o.y, t: 0.05, max: 0.05 })
        const p = a.p; const dx = o.x - e.x; const dy = o.y - e.y; const l2 = dx * dx + dy * dy
        const k = Math.max(0, Math.min(1, ((p.x - e.x) * dx + (p.y - e.y) * dy) / (l2 || 1)))
        if (len(e.x + dx * k - p.x, e.y + dy * k - p.y) < 8 + p.r) a.hurtPlayer(1, 'The Comma Splice')
      }
      if (a.every(e, 'cd', 2.5)) a.aimed(e, 140)
    }
  },
  sinDouble: {
    name: 'The Double Negative', title: 'a grammar sin', boss: true, mini: true, hp: 80, r: 15, color: '#8a2a2a', art: word('NOT', '#fff', '#8a2a2a'),
    init (e, a) { if (!e.data.b) a.spawn('sinDouble', ROOM_W - e.x, e.y + 30, { boss: true, data: { b: true } }) },
    onHit (e, a, dmg) { const o = a.kin(e, ['sinDouble'])[0]; if (o && a.dist(e, o) < 130) { a.ev({ k: 'block', x: e.x, y: e.y }); return dmg * 0.15 } return dmg },
    update (e, a, dt) { const o = a.kin(e, ['sinDouble'])[0]; const c = e.t % 6; if (o && c < 3) a.toward(e, o.x, o.y, 60, dt); else a.chase(e, 55, dt); if (a.every(e, 'cd', 2.4)) a.ring(e, 6, 110, e.t) }
  },
  sinDangling: {
    name: 'The Dangling Participle', title: 'a grammar sin', boss: true, mini: true, hp: 120, r: 16, fly: true, color: '#4a6a3a', art: word('-ing', '#fff', '#4a6a3a'),
    update (e, a) { const g = Math.sin(e.t * 1.3) * 1.1; e.x = CX + Math.sin(g) * 220; e.y = IX + 10 + Math.cos(g) * 170; e.data.rope = true; if (a.every(e, 'cd', 0.7)) a.shoot(e, Math.PI / 2 + a.range(-0.3, 0.3), 150) }
  },
  sinSplit: {
    name: 'The Split Infinitive', title: 'a grammar sin', boss: true, mini: true, hp: 120, r: 18, color: '#2a5a5a', art: word('to boldly go', '#fff', '#2a5a5a'),
    update (e, a, dt) { a.chase(e, 40, dt); if (a.every(e, 'cd', 2)) a.spread(e, a.ang(e), 3, 0.5, 150); if (e.hp < e.maxHp * 0.5) { e.dead = true; for (const t of ['to', 'boldly', 'go']) a.spawn('splitPart', e.x + a.range(-20, 20), e.y, { boss: true, data: { text: t } }) } }
  },
  splitPart: { name: 'a split part', hp: 30, r: 12, boss: true, color: '#3a7a7a', art: word('go', '#fff', '#3a7a7a', { fromData: true }), update (e, a, dt) { a.chase(e, 70, dt); if (a.every(e, 'cd', 2.5)) a.aimed(e, 140) } },
  sinApostrophe: {
    name: 'The Rogue Apostrophe', title: 'a grammar sin', boss: true, mini: true, hp: 90, r: 12, fly: true, color: '#7a5a2a', art: glyph('’', '#7a5a2a', 1.8),
    init (e) { e.vx = 160; e.vy = 120 },
    update (e, a, dt) { a.bounce(e, dt); if (a.every(e, 'cd', 0.35)) enemyShot(a.run, e.x, e.y, 0, 0, { col: '#7a5a2a', life: 2.4, from: 'The Rogue Apostrophe' }); if (a.every(e, 'cd2', 3)) a.ring(e, 8, 120) }
  },

  // --- chapter one ---
  runon: {
    name: 'The Run-On Sentence', title: 'and then and then and then', boss: true, hp: 230, r: 16, color: '#3a3f8b', art: word('And', '#fff', '#3a3f8b'),
    init (e, a) { e.data.trail = []; let prev = e; for (let i = 0; i < 6; i++) prev = a.spawn('runonSeg', e.x, e.y, { boss: true, parent: e, data: { i: i + 1, text: ['then', 'so', 'and', 'but', 'and', 'then'][i] } }) || prev },
    update (e, a, dt) {
      snake(95, 1.1)(e, a, dt)
      // Each fifth of its health lost, the sentence runs on a little longer.
      const want = 6 + Math.floor((1 - e.hp / e.maxHp) * 5)
      const segs = a.kin(e, ['runonSeg'])
      if (segs.length < want) a.spawn('runonSeg', e.x, e.y, { boss: true, parent: e, data: { i: segs.length + 1, text: a.pick(['and', 'then', 'so', 'also', 'but']) } })
      if (a.every(e, 'cd', 2.2)) a.spread(e, a.ang(e), 3, 0.5, 150)
    },
    onDeath (e, a) { for (const s of a.kin(e, ['runonSeg'])) { s.dead = true; a.ev({ k: 'die', x: s.x, y: s.y, col: '#3a3f8b', r: s.r }) } }
  },
  runonSeg: { name: 'The Run-On Sentence', hp: 99999, r: 13, noBar: true, boss: true, color: '#4a4f9b', art: word('then', '#fff', '#4a4f9b', { fromData: true }), update (e, a, dt) { segment(e, a, dt); if (a.every(e, 'drip', 3)) a.creep(e.x, e.y, 12, 2.5) }, onHit: passToParent },
  typo: {
    name: 'Typo', title: 'teh mispelt', boss: true, hp: 170, r: 24, color: '#c84a4a', art: word('TEH', '#fff', '#c84a4a', { blob: true }),
    init (e, a) { const g = a.range(0, TAU); e.vx = Math.cos(g) * 80; e.vy = Math.sin(g) * 80 },
    update (e, a, dt) {
      a.bounce(e, dt)
      if (a.every(e, 'cd', 2.4)) a.spread(e, a.ang(e), 5, 0.9, 130)
      const k = e.hp / e.maxHp
      for (const [th, key] of [[0.66, 'a'], [0.33, 'b']]) if (k < th && !e.data[key]) { e.data[key] = 1; for (const t of ['HTE', 'ETH']) { const kid = a.spawn('typoKid', e.x, e.y, { boss: true, data: { text: t } }); if (kid) { const g = a.range(0, TAU); kid.vx = Math.cos(g) * 110; kid.vy = Math.sin(g) * 110 } } a.say(e, 'teh?') }
    }
  },
  typoKid: { name: 'a typo', hp: 35, r: 15, boss: true, color: '#e86a5a', art: word('HTE', '#fff', '#e86a5a', { blob: true, fromData: true }), update (e, a, dt) { a.bounce(e, dt); if (a.every(e, 'cd', 2.8)) a.aimed(e, 140) } },
  ellipsis: {
    name: 'The Ellipsis', title: 'to be continued', boss: true, hp: 1, r: 10, color: '#1a1a2a', art: { k: 'none' },
    init (e, a) { e.untouchable = true; e.harmless = true; e.ignore = true; for (let i = 0; i < 3; i++) a.spawn('ellipsisDot', e.x, e.y, { boss: true, parent: e, data: { i } }) },
    update (e, a, dt) {
      const dots = a.kin(e, ['ellipsisDot'])
      if (!dots.length) { e.dead = true; return }
      a.toward(e, a.p.x, a.p.y, 25, dt)
      e.data.c = (e.data.c || 0) + dt
      const cycle = 7
      const c = e.data.c % cycle
      dots.sort((x, y) => x.data.i - y.data.i).forEach((d, i) => {
        d.data.home = { x: e.x + Math.cos(e.t * 1.4 + (i * TAU) / dots.length) * 60, y: e.y + Math.sin(e.t * 1.4 + (i * TAU) / dots.length) * 60 }
        d.data.dashAt = 3.5 + i * 0.9
      })
      e.data.cycle = c
    }
  },
  ellipsisDot: {
    name: 'The Ellipsis', hp: 85, r: 15, boss: true, fly: true, color: '#1a1a2a', art: glyph('●', '#1a1a2a', 1.3),
    update (e, a, dt) {
      const ctl = e.parent
      if (!ctl || ctl.dead) { a.chase(e, 90, dt); return }
      const left = a.kin(e, ['ellipsisDot']).length + 1
      const fast = 1 + (3 - left) * 0.35
      const c = ctl.data.cycle || 0
      if (e.data.dash) { a.moveBy(e, e.data.dash[0] * 320 * fast * dt, e.data.dash[1] * 320 * fast * dt); if ((e.data.dt -= dt) <= 0) e.data.dash = null; return }
      if (Math.abs(c - e.data.dashAt) < dt * 1.5) { const g = a.ang(e); e.data.dash = [Math.cos(g), Math.sin(g)]; e.data.dt = 0.55; a.say(e, '…', 0.5) }
      if (e.data.home) a.toward(e, e.data.home.x, e.data.home.y, 160 * fast, dt)
      if (c < 3 && a.every(e, 'cd', 1.4 / fast)) a.ring(e, 6, 110, e.t)
    }
  },
  lorem: {
    name: 'Lorem Ipsum', title: 'placeholder text', boss: true, hp: 240, r: 30, fly: true, color: '#8a8a8a', art: { k: 'lorem', col: '#d8d8d0' },
    update (e, a, dt) {
      a.toward(e, CX + Math.sin(e.t * 0.5) * 150, CY - 40 + Math.cos(e.t * 0.7) * 50, 60, dt)
      if (a.every(e, 'spawn', 4) && a.kin(e, ['filler']).length < 5) for (let i = 0; i < 2; i++) a.spawn('filler', e.x + a.range(-30, 30), e.y + 30, { data: {} })
      if (a.every(e, 'cd', 3)) { const words = ['lorem', 'ipsum', 'dolor', 'sit', 'amet']; for (let i = 0; i < 5; i++) enemyShot(a.run, e.x, e.y, 0, 0, { col: '#6a6a6a', text: words[i], r: 9, wait: i * 0.15, from: 'Lorem Ipsum' }); e.data.aim = a.ang(e) }
      for (const s of a.room.shots) if (s.text && s.wait <= 0 && !s.vx && !s.vy && s.from === 'Lorem Ipsum') { const g = Math.atan2(a.p.y - s.y, a.p.x - s.x); s.vx = Math.cos(g) * 150; s.vy = Math.sin(g) * 150 }
      if (e.hp < e.maxHp / 2 && a.every(e, 'cd2', 2.2)) a.ring(e, 10, 100, e.t)
    }
  },
  // --- chapter two ---
  palindrome: {
    name: 'Palindrome', title: 'racecar', boss: true, hp: 220, r: 22, fly: true, color: '#4a7a3a', art: word('RACECAR', '#fff', '#4a7a3a'),
    update (e, a, dt) {
      const p = a.p
      a.toward(e, 2 * CX - p.x, 2 * CY - p.y, 150, dt)
      if (a.every(e, 'cd', 1.3)) a.aimed(e, 150)
      if (a.every(e, 'rev', 6)) { a.say(e, 'RACECAR'); for (const s of a.room.shots) { s.vx = -s.vx; s.vy = -s.vy } if (e.hp < e.maxHp / 2) a.ring(e, 12, 120) }
    }
  },
  homophones: {
    name: 'The Homophones', title: 'their, there, they’re', boss: true, hp: 1, r: 10, color: '#7a5a2a', art: { k: 'none' },
    init (e, a) { e.untouchable = true; e.harmless = true; e.ignore = true; e.data.right = 0; a.spawn('homoWord', CX - 120, CY - 40, { boss: true, parent: e, data: { n: 0, text: 'THEIR' } }); a.spawn('homoWord', CX + 120, CY - 40, { boss: true, parent: e, data: { n: 1, text: 'THERE' } }) },
    update (e, a) {
      const words = a.kin(e, ['homoWord'])
      if (!words.length) { e.dead = true; return }
      if (a.every(e, 'swap', 5)) { e.data.right = a.pick(words).data.n; a.ev({ k: 'swap' }) }
      if (!words.some((w) => w.data.n === e.data.right)) e.data.right = words[0].data.n
      const total = words.reduce((s, w) => s + w.hp, 0); const max = words.reduce((s, w) => s + w.maxHp, 0)
      if (!e.data.third && total < max * 0.5) { e.data.third = true; a.spawn('homoWord', CX, IX + 40, { boss: true, parent: e, data: { n: 2, text: 'THEY’RE' } }) }
    }
  },
  homoWord: {
    name: 'The Homophones', hp: 110, r: 20, boss: true, fly: true, color: '#8a6a3a', art: word('THEIR', '#fff', '#8a6a3a', { fromData: true }),
    onHit (e, a, dmg) {
      const ctl = e.parent
      if (ctl && !ctl.dead && ctl.data.right !== e.data.n) {
        const right = a.kin(e, ['homoWord']).find((w) => w.data.n === ctl.data.right)
        if (right) right.hp = Math.min(right.maxHp, right.hp + dmg * 0.6)
        a.ev({ k: 'block', x: e.x, y: e.y })
        return 0
      }
      return dmg
    },
    update (e, a, dt) { e.data.right = e.parent?.data.right === e.data.n; a.wander(e, 50, dt); if (a.every(e, 'cd', 2.6)) a.ring(e, 7, 115, e.t) }
  },
  anagram: {
    name: 'Anagram', title: 'listen, silent, enlist', boss: true, hp: 1, r: 10, color: '#a85a2a', art: { k: 'none' },
    init (e, a) { e.untouchable = true; e.harmless = true; e.ignore = true; e.data.words = ['LISTEN', 'SILENT', 'ENLIST', 'TINSEL', 'INLETS']; [...'LISTEN'].forEach((l, i) => a.spawn('anaTile', CX, CY, { boss: true, parent: e, data: { i, l } })) },
    update (e, a) {
      const tiles = a.kin(e, ['anaTile'])
      if (!tiles.length) { e.dead = true; return }
      e.data.c = (e.data.c || 0) + 1 / 60
      const form = Math.floor(e.data.c / 6) % 3
      if (form !== e.data.form) { e.data.form = form; const w = e.data.words[Math.floor(e.data.c / 6) % e.data.words.length]; tiles.sort((x, y) => x.data.i - y.data.i).forEach((t, i) => { t.data.l = w[i] || t.data.l }); a.say(tiles[0], w, 1.2) }
    }
  },
  anaTile: {
    name: 'Anagram', hp: 45, r: 15, boss: true, fly: true, color: '#a85a2a', art: { k: 'tile', col: '#f4e2c0' },
    update (e, a, dt) {
      const ctl = e.parent
      if (!ctl || ctl.dead) { a.chase(e, 80, dt); return }
      const tiles = a.kin(e, ['anaTile']).concat([e]).sort((x, y) => x.data.i - y.data.i)
      const i = tiles.indexOf(e); const n = tiles.length
      const c = ctl.data.c % 6
      if (ctl.data.form === 0) { const g = ctl.data.c * 1.2 + (i * TAU) / n; a.toward(e, CX + Math.cos(g) * 110, CY + Math.sin(g) * 80, 220, dt); if (a.every(e, 'cd', 1.6)) a.shoot(e, Math.atan2(e.y - CY, e.x - CX), 120) } else if (ctl.data.form === 1) { const x = IX + 50 + (i * (IW - 100)) / Math.max(1, n - 1); const y = IX + 30 + (c / 6) * (IH - 60); a.toward(e, x, y, 240, dt); if (a.every(e, 'cd', 1.1)) a.shoot(e, Math.PI / 2, 120) } else { const x = IX + 60 + (i * (IW - 120)) / Math.max(1, n - 1); a.toward(e, x, IX + 30, 240, dt); if (a.every(e, 'cd', 0.8)) a.shoot(e, Math.PI / 2 + a.range(-0.4, 0.4), 140) }
    }
  },
  widow: {
    name: 'Widow & Orphan', title: 'lines left alone', boss: true, hp: 210, r: 24, color: '#3a2a4a', art: word('Widow', '#fff', '#3a2a4a'),
    init (e, a) { if (!e.data.kid) a.spawn('orphan', e.x + 60, e.y + 40, { boss: true }) },
    update (e, a, dt) { const alone = !a.kin(e, ['orphan']).length; a.chase(e, alone ? 55 : 28, dt); if (a.every(e, 'cd', alone ? 1.5 : 2.6)) a.spread(e, a.ang(e), alone ? 7 : 5, 1.1, 120) }
  },
  orphan: { name: 'Widow & Orphan', hp: 90, r: 13, boss: true, color: '#5a4a6a', art: word('Orphan', '#fff', '#5a4a6a', { small: true }), update (e, a, dt) { const alone = !a.kin(e, ['widow']).length; a.chase(e, alone ? 120 : 85, dt); if (alone && a.every(e, 'cd', 1.5)) a.aimed(e, 160) } },
  // --- chapter three ---
  rex: {
    name: 'Thesaurus Rex', title: 'huge, vast, enormous', boss: true, hp: 300, r: 30, color: '#4a7a4a', art: { k: 'rex', col: '#5a9a5a' },
    update (e, a, dt) {
      const j = a.stepJump(e, dt)
      if (j === 'landed') { a.ring(e, 14, 120); a.shake(8) }
      if (j) return
      if (e.data.roar > 0) { if ((e.data.roar -= dt) <= 0) { const syn = ['huge', 'vast', 'big', 'grand', 'giant', 'mega', 'large']; const g = a.ang(e); syn.forEach((s, i) => a.shoot(e, g + (i / 6 - 0.5) * 1.3, 140, { text: s, r: 9 })) } return }
      a.chase(e, 40, dt)
      if (a.every(e, 'cd', 3.2)) { if (a.rand() < 0.5) { e.data.roar = 0.6; a.say(e, 'RAWR (synonym: roar)') } else { a.warn(a.p.x, a.p.y, 34, 0.9); a.jump(e, a.p.x, a.p.y, 0.9) } }
      if (e.hp < e.maxHp / 2 && a.every(e, 'tail', 4)) a.ring(e, 8, 90, e.t)
    }
  },
  silent: {
    name: 'The Silent Letter', title: 'the k in knight', boss: true, hp: 240, r: 20, fly: true, color: '#5a5a8a', art: glyph('K', '#5a5a8a', 2.4),
    update (e, a, dt) {
      e.data.seen = Math.max(0, (e.data.seen || 0) - dt)
      e.fade = e.data.seen > 0 ? 1 : 0.07
      a.wander(e, 70, dt)
      if (a.every(e, 'step', 0.4)) a.ev({ k: 'print', x: e.x, y: e.y + 14 })
      if (a.every(e, 'cd', 2.2)) { e.data.seen = 0.9; a.spread(e, a.ang(e), 3, 0.4, 160) }
    },
    onHit (e, a, dmg) { e.data.seen = 0.6; return dmg }
  },
  oxymoron: {
    name: 'Oxymoron', title: 'jumbo shrimp', boss: true, hp: 280, r: 24, color: '#a85a5a', art: word('JUMBO SHRIMP', '#fff', '#a85a5a', { twoTone: true }),
    update (e, a, dt) {
      const hot = Math.floor(e.t / 5) % 2 === 0
      e.data.hot = hot
      a.wander(e, hot ? 80 : 40, dt)
      if (hot && a.every(e, 'cd', 0.9)) a.spread(e, a.ang(e), 2, 0.25, 190, { col: '#ff7a2a' })
      if (!hot && a.every(e, 'cd2', 1.6)) a.ring(e, 10, 85, e.t, { col: '#7ad8ff' })
      if (e.hp < e.maxHp / 2) { e.dead = true; a.spawn('oxyHalf', e.x - 30, e.y, { boss: true, data: { hot: true, text: 'JUMBO' } }); a.spawn('oxyHalf', e.x + 30, e.y, { boss: true, data: { hot: false, text: 'SHRIMP' } }); a.say(e, 'jumbo… shrimp?') }
    }
  },
  oxyHalf: { name: 'Oxymoron', hp: 80, r: 18, boss: true, color: '#a85a5a', art: word('JUMBO', '#fff', '#a85a5a', { fromData: true, hotCold: true }), update (e, a, dt) { a.chase(e, e.data.hot ? 75 : 35, dt); if (e.data.hot && a.every(e, 'cd', 1.1)) a.aimed(e, 190, { col: '#ff7a2a' }); if (!e.data.hot && a.every(e, 'cd', 1.8)) a.ring(e, 10, 85, e.t, { col: '#7ad8ff' }) } },
  spoonerism: {
    name: 'Spoonerism', title: 'a blushing crow', boss: true, hp: 270, r: 22, color: '#6a7a9a', art: word('Spoonerism', '#fff', '#6a7a9a', { spoon: true }),
    update (e, a, dt) {
      a.wander(e, 60, dt)
      if (a.every(e, 'cd', 1.8)) for (const s of [-1, 1]) a.shoot(e, a.ang(e) + s * 0.5, 200, { curve: -s * 2.4, life: 3, text: '🥄', r: 8 })
      if (a.every(e, 'swap', 8)) { a.run.swap = 3.5; a.say(e, 'Your weft is light!', 2); a.ev({ k: 'swapControls' }) }
    }
  },
  // --- chapter four ---
  passive: {
    name: 'The Passive Voice', title: 'mistakes were made', boss: true, hp: 260, r: 22, fly: true, color: '#6a6a7a', art: { k: 'ghost', col: '#c8c8d8', big: true },
    update (e, a, dt) {
      const c = e.t % 6.5
      const shown = c > 4.5
      e.fade = shown ? 1 : 0.05
      e.untouchable = !shown
      e.harmless = !shown
      if (Math.abs(c - 4.5) < dt) { const s = a.spot(2); e.x = s.x; e.y = s.y; a.say(e, a.pick(['Mistakes were made.', 'Shots were fired.', 'You were hit.', 'It was decided.'])) }
      if (shown) return
      // The room attacks on its behalf: letters fall, bars sweep.
      if (a.every(e, 'fall', 0.55)) { const x = a.p.x + a.range(-70, 70); const y = a.p.y + a.range(-50, 50); a.warn(x, y, 14, 0.7); enemyShot(a.run, x, y, 0, 0, { col: '#3a3a4a', z: 220, vz: -160, r: 10, text: a.pick(['was', 'were', 'been', 'by']), from: 'The Passive Voice' }) }
      if (e.hp < e.maxHp * 0.6 && a.every(e, 'bar', 3.5)) { const y = a.p.y; a.line(IX, y, IX + IW, y, 0.7, 'rgba(60,60,80,.5)'); for (let i = 0; i < 10; i++) enemyShot(a.run, IX + 6, y, 280, 0, { col: '#3a3a4a', wait: 0.7 + i * 0.05, r: 7, from: 'The Passive Voice' }) }
    }
  },
  longest: {
    name: 'The Longest Word', title: 'pneumonoultramicroscopicsilicovolcanoconiosis', boss: true, hp: 1, r: 10, color: '#7a4a3a', art: { k: 'none' },
    init (e, a) {
      e.untouchable = true; e.harmless = true; e.ignore = true
      const syl = ['pneu', 'mono', 'ultra', 'micro', 'scopic', 'silico', 'volcano', 'coni', 'osis']
      e.data.n = syl.length; e.data.gap = 4; e.data.y = IX + 30; e.data.dir = 1
      syl.forEach((s, i) => a.spawn('syllable', IX + 28 + i * ((IW - 56) / (syl.length - 1)), e.data.y, { boss: true, parent: e, data: { i, text: s } }))
    },
    update (e, a, dt) {
      const segs = a.kin(e, ['syllable'])
      if (!segs.length) { e.dead = true; return }
      const fast = 1 + (1 - segs.length / e.data.n) * 1.2
      e.data.y += e.data.dir * 34 * fast * dt
      if (e.data.y > IX + IH - 26) e.data.dir = -1
      if (e.data.y < IX + 26) e.data.dir = 1
      if (a.every(e, 'gap', 2.5)) e.data.gap = Math.floor(a.rand() * e.data.n)
    }
  },
  syllable: {
    name: 'The Longest Word', hp: 50, r: 22, boss: true, fly: true, color: '#7a4a3a', art: word('pneu', '#fff', '#7a4a3a', { fromData: true, wide: true }),
    update (e, a, dt) {
      const ctl = e.parent
      if (!ctl || ctl.dead) { a.chase(e, 70, dt); return }
      const gapped = Math.abs(e.data.i - ctl.data.gap) <= 0
      e.harmless = gapped
      a.toward(e, IX + 28 + e.data.i * ((IW - 56) / (ctl.data.n - 1)), ctl.data.y + (gapped ? (ctl.data.y < CY ? -60 : 60) : 0), 200, dt)
      if (a.every(e, 'cd', 3.5 + e.data.i * 0.2)) a.aimed(e, 130)
    }
  },
  redundancy: {
    name: 'The Department of Redundancy Department', title: 'again and again, repeatedly', boss: true, hp: 260, r: 22, color: '#3a5a7a', art: word('DEPT.', '#fff', '#3a5a7a', { stamp: true }),
    update (e, a, dt) {
      a.chase(e, 45, dt)
      if (a.every(e, 'cd', 2)) a.spread(e, a.ang(e), 3, 0.5, 140)
      const gen = e.data.gen || 0
      if (gen < 2 && e.hp < e.maxHp / 2) {
        e.dead = true
        for (const s of [-1, 1]) { const c = a.spawn('redundancy', e.x + s * 30, e.y, { boss: true, data: { gen: gen + 1 } }); if (c) { c.hp = c.maxHp = e.maxHp / 2; c.r = e.r * 0.8 } }
        a.say(e, 'Department of Department of…')
      }
    }
  },
  malaprop: {
    name: 'Malaprop', title: 'for all intensive purposes', boss: true, hp: 270, r: 20, fly: true, color: '#8a3a6a', art: word('irregardless', '#fff', '#8a3a6a'),
    update (e, a, dt) {
      if (a.every(e, 'tp', 3)) { const s = a.spot(2); e.x = s.x; e.y = s.y; a.ev({ k: 'poof', x: e.x, y: e.y }) }
      if (a.every(e, 'cd', 1.2)) { for (let i = 0; i < 4; i++) a.shoot(e, a.range(0, TAU), 110, { retarget: 0.7, text: a.pick(['ironic', 'literally', 'irregardless', 'supposably']), r: 8 }) }
      for (const s of a.room.shots) if (s.retarget && s.age >= s.retarget && !s.re) { s.re = true; const g = Math.atan2(a.p.y - s.y, a.p.x - s.x); s.vx = Math.cos(g) * 190; s.vy = Math.sin(g) * 190 }
    }
  },
  // --- the finals ---
  redpen: {
    name: 'The Red Pen', title: 'every mistake you ever made', boss: true, hp: 460, r: 26, fly: true, color: '#d83a3a', art: { k: 'pen', col: '#d83a3a' },
    update (e, a, dt) {
      const angry = e.hp < e.maxHp / 2
      const k = angry ? 1.35 : 1
      a.toward(e, CX + Math.sin(e.t * 0.6) * 200, IX + 50 + Math.abs(Math.sin(e.t * 0.4)) * 60, 90 * k, dt)
      if (e.data.strike > 0) {
        if ((e.data.strike -= dt) <= 0) for (let i = 0; i < 14; i++) a.shoot(e, e.data.g, 280, { wait: i * 0.04, r: 6, col: '#d83a3a' })
      } else if (a.every(e, 'strike', 3 / k)) { e.data.g = a.ang(e); e.data.strike = 0.7; a.line(e.x, e.y, e.x + Math.cos(e.data.g) * 700, e.y + Math.sin(e.data.g) * 700, 0.7) }
      if (a.every(e, 'circle', 6 / k)) { const p = a.p; for (let i = 0; i < 18; i++) { const g = (i / 18) * TAU; enemyShot(a.run, p.x + Math.cos(g) * 170, p.y + Math.sin(g) * 170, -Math.cos(g) * 70, -Math.sin(g) * 70, { col: '#d83a3a', life: 3.4, wait: 0.5, from: 'The Red Pen' }) } a.say(e, 'See me.') }
      if (a.every(e, 'scribble', 8 / k)) e.data.scrib = 1.6
      if (e.data.scrib > 0) { e.data.scrib -= dt; if (a.every(e, 'sc', 0.06)) a.shoot(e, a.range(0, TAU), a.range(90, 170)) }
      if (angry && a.every(e, 'cross', 5)) { const p = a.p; for (const [dx, dy] of [[1, 1], [1, -1]]) { a.line(p.x - dx * 300, p.y - dy * 300, p.x + dx * 300, p.y + dy * 300, 0.8); for (let i = 0; i < 12; i++) enemyShot(a.run, p.x - dx * 300, p.y - dy * 300, dx * 210, dy * 210, { col: '#d83a3a', wait: 0.8 + i * 0.05, from: 'The Red Pen' }) } }
      if (angry && !e.data.sic) { e.data.sic = true; a.say(e, '[sic]', 2); for (let i = 0; i < 3; i++) a.spawn('redactor', a.spot().x, a.spot().y) }
    }
  },
  autocorrect: {
    name: 'Autocorrect', title: 'did you mean…', boss: true, hp: 540, r: 26, fly: true, color: '#4a8ae8', art: { k: 'auto', col: '#4a8ae8' },
    update (e, a, dt) {
      const k = e.hp / e.maxHp
      const phase = k > 0.66 ? 0 : k > 0.33 ? 1 : 2
      if (phase !== e.data.ph) { e.data.ph = phase; a.say(e, ['Did you mean: ducking?', 'Did you mean: defeat?', 'DID YOU MEAN: DELETE?'][phase], 2.2); if (phase === 2) { a.run.swap = 3; a.ev({ k: 'swapControls' }) } }
      a.toward(e, CX + Math.cos(e.t * 0.7) * 180, CY - 40 + Math.sin(e.t * 1.1) * 70, 110, dt)
      // It borrows from every boss you beat to get here.
      if (a.every(e, 'cd', [2.2, 1.8, 1.3][phase])) {
        const move = a.pick(['ring', 'fan', 'strike', 'mirror', 'rain'])
        if (move === 'ring') a.ring(e, 12 + phase * 4, 110, e.t)
        if (move === 'fan') { const g = a.ang(e); ['teh', 'adn', 'hte', 'yuo', 'thier'].forEach((s, i) => a.shoot(e, g + (i / 4 - 0.5) * 1.2, 150, { text: s, r: 9 })) }
        if (move === 'strike') { const g = a.ang(e); a.line(e.x, e.y, e.x + Math.cos(g) * 700, e.y + Math.sin(g) * 700, 0.6, '#4a8ae8'); for (let i = 0; i < 12; i++) a.shoot(e, g, 290, { wait: 0.6 + i * 0.04 }) }
        if (move === 'mirror') { e.x = 2 * CX - a.p.x; e.y = 2 * CY - a.p.y; a.clampIn(e, 10); a.ring(e, 8, 120); a.ev({ k: 'poof', x: e.x, y: e.y }) }
        if (move === 'rain') for (let i = 0; i < 6 + phase * 3; i++) { const x = a.p.x + a.range(-100, 100); const y = a.p.y + a.range(-70, 70); a.warn(x, y, 12, 0.7); enemyShot(a.run, x, y, 0, 0, { col: '#4a8ae8', z: 220, vz: -160, r: 9, from: 'Autocorrect' }) }
      }
      if (phase === 2 && a.every(e, 'spiral', 0.12)) { e.data.sp = (e.data.sp || 0) + 0.37; a.shoot(e, e.data.sp, 120); a.shoot(e, e.data.sp + Math.PI, 120) }
    }
  }
}

// A snake: the head turns toward you and bounces off walls; the body
// (segments with `parent` and an index) follows its path.
function snake (spd, turn) {
  return (e, a, dt) => {
    e.data.g = e.data.g ?? a.ang(e)
    const want = a.ang(e)
    let d = want - e.data.g
    while (d > Math.PI) d -= TAU
    while (d < -Math.PI) d += TAU
    e.data.g += Math.max(-turn * dt, Math.min(turn * dt, d)) + Math.sin(e.t * 2) * 0.6 * dt
    const k = 1 + (1 - e.hp / e.maxHp) * 0.6
    const ox = e.x; const oy = e.y
    e.x += Math.cos(e.data.g) * spd * k * dt
    e.y += Math.sin(e.data.g) * spd * k * dt
    if (e.x < IX + e.r || e.x > IX + IW - e.r) e.data.g = Math.PI - e.data.g
    if (e.y < IX + e.r || e.y > IX + IH - e.r) e.data.g = -e.data.g
    a.clampIn(e)
    e.data.trail = e.data.trail || []
    if (len(e.x - ox, e.y - oy) > 0) e.data.trail.unshift([e.x, e.y])
    if (e.data.trail.length > 400) e.data.trail.length = 400
  }
}
function segment (e, a) {
  const head = e.parent
  if (!head || head.dead) { e.dead = true; return }
  const pt = head.data.trail?.[Math.min((head.data.trail.length || 1) - 1, e.data.i * 14)]
  if (pt) { e.x = pt[0]; e.y = pt[1] }
  e.fly = true
}
function passToParent (e, a, dmg) {
  const head = e.parent
  if (head && !head.dead) a.hit(head, dmg)
  return 0
}

// Which foes are bosses (their names show on the bar).
export const bossName = (id) => FOES[id]?.name
