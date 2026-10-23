// Wirdlike's simulation: one tick at a time, the same on any computer for
// the same seed and the same keys. No drawing here, so it runs in tests.
//
// A run holds the floor (its rooms, what's left in them), the player, the
// pool of words still to find, and the live room: enemies, shots, pickups,
// bangs and puddles. Each tick it pushes events (a hit, a pickup, a door)
// that the screen turns into sound and particles.

import { Rng, hash01 } from './rng.js'
import { TILE, COLS, ROWS, WALL, ROOM_W, ROOM_H, T, FLOORS, BASE_STATS, character, CHAPTER_BOSSES } from './content.js'
import { genFloor, genEnemies, DIRS, OPP, DOOR_CELLS } from './floor.js'
import { TRANSFORMS, BLANK_PAGE } from './items.js'
import { FOES, foeApi } from './foes.js'

export const DT = 1 / 60
const IX = WALL // interior left/top
const IW = COLS * TILE
const IH = ROWS * TILE
const CX = ROOM_W / 2
const CY = ROOM_H / 2
const SOLID_FOR_TEARS = new Set([T.BLOCK, T.POT, T.TINTED, T.METAL, T.FIRE])
const len = (x, y) => Math.hypot(x, y)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// --- a new run ----------------------------------------------------------------------
// pool: items made from the words you've rated (see items.js).
export function newRun ({ seed, charId = 'wirdo', pool = [], deep = false, now = 0 }) {
  const ch = character(charId)
  const run = {
    v: 1, seed: String(seed), char: ch.id, fi: 0, deep, rngS: 0, t: 0, tick: 0, startedAt: now,
    pool: [...pool], ev: [], banner: null, over: null, swap: 0,
    stats: { kills: 0, rooms: 0, hits: 0, bangsUsed: 0, found: [], bosses: [], sins: [], transforms: [], floorHits: 0, noHitBosses: 0, deepest: 0 },
    p: {
      x: CX, y: CY + 40, vx: 0, vy: 0, r: 11, hp: ch.hp, maxHp: ch.hp, soul: ch.soul, bangs: 1 + (ch.start.bangs || 0), marks: 1, glyphs: 0,
      items: [], active: null, inv: 0, fireCd: 0, aimX: 0, aimY: 1, faceX: 0, faceY: 1, side: 1, topics: {}, transforms: [],
      blastproof: Boolean(ch.start.blastproof), rage: false, aegisUp: false, regenAcc: 0, trailT: 0, buffs: {}, stats: null, flags: {}, fams: [...(ch.start.fam || [])], shot: [...(ch.start.shot || [])]
    },
    floor: null, room: null
  }
  const rng = new Rng(`${run.seed}:run`)
  run.rngS = rng.s
  // ? starts with a random active and a random word.
  if (ch.start.randomActive) { const a = takeItem(run, (it) => it.kind === 'active'); if (a) giveItem(run, a, true) }
  if (ch.start.randomItem) { const it = takeItem(run, (i) => i.kind === 'passive'); if (it) giveItem(run, it, true) }
  recompute(run)
  startFloor(run, 0)
  run.ev = []
  return run
}

export function rand (run) { const r = new Rng(run.rngS); const v = r.next(); run.rngS = r.s; return v }
const rpick = (run, a) => a[Math.floor(rand(run) * a.length)]

// --- floors and rooms ---------------------------------------------------------------
function bossFor (run, fi) {
  const ch = FLOORS[fi].ch
  const list = CHAPTER_BOSSES[ch]
  const used = run.stats.bosses
  const fresh = list.filter((b) => !used.includes(b))
  return rpick(run, fresh.length ? fresh : list)
}

export function startFloor (run, fi) {
  // Whatever's left in this floor's last room stays on this floor: the new
  // floor's rooms are fresh, even where their keys are the same.
  if (run.room && run.floor) saveRoom(run)
  run.room = null
  run.fi = fi
  run.floor = genFloor(run.seed, fi, { bossId: bossFor(run, fi) })
  run.stats.deepest = Math.max(run.stats.deepest, fi)
  run.stats.floorHits = 0
  const p = run.p
  if (p.flags.map) for (const r of Object.values(run.floor.rooms)) if (r.type !== 'secret') r.seen = true
  if (p.flags.compass) for (const r of Object.values(run.floor.rooms)) if (r.type !== 'normal' && r.type !== 'secret') r.seen = true
  run.banner = { title: FLOORS[fi].name, sub: fi === 0 ? 'Every word you’ve rated is down here somewhere.' : null, t: 3 }
  enterRoom(run, run.floor.start, null)
  run.ev.push({ k: 'floor', fi })
}

function fillRoom (run, room) {
  // What a special room holds, decided the first time you see it.
  if (room.filled) return
  room.filled = true
  const at = (tx, ty) => ({ x: IX + tx * TILE + TILE / 2, y: IX + ty * TILE + TILE / 2 })
  const ped = (item, tx, ty, extra = {}) => room.items.push({ item, ...at(tx, ty), ...extra })
  const pick = (kind, tx, ty, extra = {}) => room.pickups.push({ kind, ...at(tx, ty), ...extra })
  if (room.type === 'treasure') ped(drawItem(run, 'treasure'), 6, 3)
  else if (room.type === 'shop') {
    ped(drawItem(run, 'shop'), 4, 2, { price: 15 })
    ped(drawItem(run, 'shop'), 8, 2, { price: 15 })
    const goods = [['heart', 3], ['bang', 5], ['mark', 5], ['soul', 5], ['charge', 6]]
    const a = rpick(run, goods); const b = rpick(run, goods.filter((g) => g !== a))
    pick(a[0], 5, 4, { price: a[1] })
    pick(b[0], 7, 4, { price: b[1] })
  } else if (room.type === 'library') {
    ped(drawItem(run, 'library'), 5, 3, { group: 'lib' })
    ped(drawItem(run, 'library'), 7, 3, { group: 'lib' })
  } else if (room.type === 'secret') {
    if (rand(run) < 0.3) ped(drawItem(run, 'treasure'), 6, 3)
    else for (let i = 0; i < 4; i++) pick(rpick(run, ['glyph5', 'glyph', 'bang', 'soul', 'glyph5']), 4 + i * 1.4, 3)
  } else if (room.type === 'curse') {
    if (rand(run) < 0.5) ped(drawItem(run, 'treasure'), 6, 3)
    else for (let i = 0; i < 3; i++) pick(rpick(run, ['heart', 'glyph5', 'bang', 'mark']), 5 + i, 3)
  } else if (room.type === 'deal') {
    const beloved = room.deal === 'beloved'
    const n = 2
    for (let i = 0; i < n; i++) {
      const item = drawItem(run, beloved ? 'beloved' : 'nemesis')
      ped(item, 5 + i * 2, 3, beloved ? { group: 'deal' } : { cost: item.q >= 3 ? 4 : 2 })
    }
  }
}

export function enterRoom (run, key, from) {
  const prev = run.room
  if (prev) saveRoom(run)
  const room = run.floor.rooms[key]
  run.floor.cur = key
  room.visited = true
  room.seen = true
  for (const d of Object.values(room.doors)) { const o = run.floor.rooms[d.to]; if (o && !d.hidden) o.seen = true }
  const p = run.p
  // Where you come in: just inside the door you came through.
  if (from) {
    const [tx, ty] = DOOR_CELLS[OPP[from]]
    p.x = IX + tx * TILE + TILE / 2 + (from === 'e' ? 6 : from === 'w' ? -6 : 0)
    p.y = IX + ty * TILE + TILE / 2 + (from === 's' ? 6 : from === 'n' ? -6 : 0)
  } else {
    // Teleported or picking up a saved run: the middle if it's clear,
    // otherwise inside a door.
    const d = room.type === 'start' || tileAt0(room, CX, CY) === T.FLOOR ? null : Object.keys(room.doors)[0]
    if (d) { const [tx, ty] = DOOR_CELLS[d]; p.x = IX + tx * TILE + TILE / 2; p.y = IX + ty * TILE + TILE / 2 } else { p.x = CX; p.y = room.type === 'boss' || room.type === 'miniboss' ? CY + 100 : CY }
  }
  p.vx = p.vy = 0
  p.rage = false
  p.aegisUp = Boolean(p.flags.aegis)
  run.room = { key, foes: [], tears: [], shots: [], picks: room.pickups.map((x) => ({ ...x })), peds: room.items.map((x) => ({ ...x })), bangs: [], creep: [], fams: [], fx: [], flow: null, flowT: 0, clearT: 0, bossT: 0, lightT: 3, doorsOpen: room.cleared, hp: {} }
  room.pickups = []
  room.items = []
  fillRoom(run, room)
  if (room.items.length) { run.room.peds.push(...room.items); room.items = [] }
  if (room.pickups.length) { run.room.picks.push(...room.pickups); room.pickups = [] }
  // Curse rooms take a little blood, coming and going.
  if ((room.type === 'curse' || (prev && run.floor.rooms[prev.key]?.type === 'curse')) && from && !p.flight) hurt(run, 1, 'a curse room')
  if (!room.cleared) {
    if (room.type === 'boss' || room.type === 'miniboss') {
      spawnFoe(run, room.boss, CX, CY - 40, { boss: true })
      run.room.bossT = 2.2
      run.ev.push({ k: 'bossIntro', id: room.boss, name: FOES[room.boss].name, title: FOES[room.boss].title })
    } else {
      for (const e of genEnemies(room, run.fi, from ? OPP[from] : null)) spawnFoe(run, e.id, IX + e.tx * TILE + TILE / 2, IX + e.ty * TILE + TILE / 2, { champion: e.champion })
    }
    if (!run.room.foes.length) { room.cleared = true; run.room.doorsOpen = true }
  }
  // Familiars come with you.
  for (const f of p.fams) run.room.fams.push(newFam(run, f))
  run.stats.rooms++
  run.ev.push({ k: 'enter', key, type: room.type })
}

function saveRoom (run) {
  const r = run.floor.rooms[run.room.key]
  if (!r) return
  r.pickups = run.room.picks.filter((x) => !x.taken).map(({ vx, vy, ...x }) => x)
  r.items = run.room.peds.filter((x) => x.item || x.empty).map((x) => ({ ...x }))
}

// --- items -----------------------------------------------------------------------
// Draw a word from the pool for a kind of room. Deeper floors find better
// words; deals look for words you love (or hate).
export function drawItem (run, where) {
  const fi = run.fi
  const wantQ = (q) => [3, 3, 2.5, 1.2, 0.5][q] * (1 + (q >= 2 ? fi * 0.12 : 0))
  let filter = (it) => it.kind === 'passive' || rand(run) < 0.8
  if (where === 'library') filter = (it) => it.kind === 'active'
  if (where === 'beloved') filter = (it) => it.flavor === 'blessed' || (it.r ?? 0) >= 3.5
  if (where === 'nemesis') filter = (it) => it.flavor === 'cursed' || (it.r ?? 5) <= 1.5
  return takeItem(run, filter, wantQ) || takeItem(run, () => true, wantQ) || { ...BLANK_PAGE }
}

function takeItem (run, filter, weight = () => 1) {
  const list = run.pool.filter(filter)
  if (!list.length) return null
  const total = list.reduce((a, it) => a + weight(it.q), 0)
  let x = rand(run) * total
  let pick = list[list.length - 1]
  for (const it of list) { if ((x -= weight(it.q)) < 0) { pick = it; break } }
  run.pool = run.pool.filter((it) => it.id !== pick.id)
  return pick
}

// from: the pedestal it came off. Swapping actives leaves your old one on
// that same pedestal (or a new one at your feet, if there wasn't one).
export function giveItem (run, item, quiet = false, from = null) {
  const p = run.p
  if (item.kind === 'active') {
    const old = p.active
    p.active = { item, charge: item.active.charge, max: item.active.charge }
    if (old && from) Object.assign(from, { item: old.item, empty: false, dropped: true, away: false, price: 0, cost: 0, group: null })
    else if (old && run.room) run.room.peds.push({ item: old.item, x: p.x, y: p.y + 30, dropped: true })
  } else p.items.push(item)
  for (const f of item.fx) applyOnce(run, f)
  if (!run.stats.found.includes(item.id) && item.id !== '_blank') run.stats.found.push(item.id)
  if (item.topic && item.kind === 'passive') {
    p.topics[item.topic] = (p.topics[item.topic] || 0) + 1
    const tf = TRANSFORMS[item.topic]
    if (tf && p.topics[item.topic] >= (tf.need || 3) && !p.transforms.includes(item.topic)) {
      p.transforms.push(item.topic)
      if (!run.stats.transforms.includes(item.topic)) run.stats.transforms.push(item.topic)
      for (const f of tf.fx) applyOnce(run, f)
      run.ev.push({ k: 'transform', topic: item.topic, name: tf.name, text: tf.text })
    }
  }
  recompute(run)
  if (!quiet) run.ev.push({ k: 'item', item })
}

// The parts of an item that happen once, when you pick it up.
function applyOnce (run, f) {
  const p = run.p
  if (f.t === 'hp') { p.maxHp = clamp(p.maxHp + f.v, 2, 24); if (f.v > 0) p.hp = Math.min(p.maxHp, p.hp + f.v); p.hp = Math.min(p.hp, p.maxHp) }
  if (f.t === 'soul') p.soul = Math.min(24, p.soul + f.v)
  if (f.t === 'heal') p.hp = Math.min(p.maxHp, p.hp + f.v)
  if (f.t === 'give') p[f.k] = Math.min(99, p[f.k] + f.v)
  if (f.t === 'fam') { p.fams.push(f.f); if (run.room) run.room.fams.push(newFam(run, f.f)) }
}

// Stats from the character and everything carried.
export function recompute (run) {
  const p = run.p
  const ch = character(run.char)
  const s = { ...BASE_STATS }
  for (const [k, v] of Object.entries(ch.stats)) s[k] += v
  const mul = { dmg: 1, tears: 1, speed: 1, range: 1, shotSpeed: 1 }
  const shot = {}
  const flags = {}
  for (const f of p.shot) shot[f] = (shot[f] || 0) + 1
  const all = [...p.items.flatMap((it) => it.fx), ...p.transforms.flatMap((t) => TRANSFORMS[t].fx)]
  for (const f of all) {
    if (f.t === 'stat') s[f.s] += f.v
    else if (f.t === 'mul') mul[f.s] *= f.v
    else if (f.t === 'shot') shot[f.f] = (shot[f.f] || 0) + 1
    else if (!['hp', 'soul', 'heal', 'give', 'fam'].includes(f.t)) flags[f.t] = (flags[f.t] || 0) + 1
  }
  if (shot.tiny) { mul.tears *= 1.2; mul.shotSpeed *= 1.25; mul.dmg *= 0.9 }
  if (shot.big) { mul.dmg *= 1.15; mul.shotSpeed *= 0.92 }
  if (shot.explode) mul.tears *= 0.65
  if (shot.multi) mul.tears *= Math.pow(0.85, shot.multi)
  if (shot.fast) mul.shotSpeed *= 1.35
  const b = p.buffs
  if (b.haste > 0) { mul.dmg *= 1.4; mul.tears *= 1.3 }
  if (p.rage) mul.dmg *= 1.5
  p.stats = {
    dmg: Math.max(0.5, s.dmg * mul.dmg),
    tears: clamp(s.tears * mul.tears, 0.8, 10),
    speed: clamp(s.speed * mul.speed, 0.5, 2),
    range: Math.max(0.4, s.range * mul.range),
    shotSpeed: clamp(s.shotSpeed * mul.shotSpeed, 0.6, 2.2),
    luck: s.luck,
    size: clamp(s.size, 0.6, 1.6)
  }
  p.shotFx = shot
  p.flags = flags
  p.flight = Boolean(flags.flight)
  p.r = 11 * p.stats.size
}

// --- the tick -------------------------------------------------------------------
// input: { mx, my, sx, sy } in -1..1, and bang / use (pressed this tick).
export function step (run, input = {}) {
  if (run.over) return
  run.t += DT
  run.tick++
  const room = run.room
  if (run.banner && (run.banner.t -= DT) <= 0) run.banner = null
  if (run.swap > 0) run.swap -= DT
  const p = run.p
  for (const k of Object.keys(p.buffs)) { if ((p.buffs[k] -= DT) <= 0) { delete p.buffs[k]; if (k === 'haste') recompute(run) } }
  if (room.bossT > 0) room.bossT -= DT
  // Slowed time: everything but you moves at half speed.
  const slow = p.buffs.slowtime > 0 ? 0.5 : 1
  stepPlayer(run, input)
  if (room.bossT <= 0) stepFoes(run, DT * slow)
  stepTears(run)
  stepShots(run, DT * slow)
  stepBangs(run)
  stepPicks(run)
  stepCreep(run)
  stepFams(run)
  if (p.flags.lightning && room.foes.length && (room.lightT -= DT) <= 0) {
    room.lightT = 2.5
    const e = rpick(run, room.foes.filter((f) => !f.dead))
    if (e) { damage(run, e, p.stats.dmg * 2 + 6, { kind: 'lightning' }); run.ev.push({ k: 'lightning', pts: [[e.x, 0], [e.x, e.y]] }) }
  }
  for (const f of room.fx) f.t -= DT
  room.fx = room.fx.filter((f) => f.t > 0)
  checkClear(run)
  checkDoors(run)
  if (!run.over) checkTraps(run)
}

function stepPlayer (run, input) {
  const p = run.p
  const room = run.room
  let mx = input.mx || 0
  let my = input.my || 0
  if (run.swap > 0) { mx = -mx; my = -my }
  const m = len(mx, my)
  if (m > 1) { mx /= m; my /= m }
  const top = 150 * p.stats.speed
  const k = 1 - Math.pow(0.0005, DT) // how fast you reach full speed
  if (p.buffs.dash > 0) { /* keep the dash going */ } else {
    p.vx += (mx * top - p.vx) * k
    p.vy += (my * top - p.vy) * k
  }
  moveBody(run, p, p.vx * DT, p.vy * DT, { fly: p.flight, player: true })
  if (m > 0.2) { p.faceX = mx; p.faceY = my }
  if (p.inv > 0) p.inv -= DT
  // Hazards underfoot.
  if (!p.flight) {
    const t = tileAt(run, p.x, p.y)
    if (t === T.SPIKE) hurt(run, 1, 'a staple')
  }
  for (const [tx, ty] of nearTiles(p.x, p.y, p.r + 4)) if (tileAtT(run, tx, ty) === T.FIRE) hurt(run, 1, 'a burning page')
  // Shooting.
  const sx = input.sx || 0
  const sy = input.sy || 0
  p.fireCd -= DT
  if (len(sx, sy) > 0.3) {
    const l = len(sx, sy)
    p.aimX = sx / l; p.aimY = sy / l
    if (p.fireCd <= 0) { fire(run, p.aimX, p.aimY); p.fireCd += 1 / p.stats.tears }
  }
  if (p.fireCd < 0) p.fireCd = 0
  // A trail behind you.
  if (p.flags.trail && len(p.vx, p.vy) > 30 && (p.trailT -= DT) <= 0) {
    p.trailT = 0.12
    const poison = p.items.some((it) => it.fx.some((f) => f.t === 'trail' && f.f === 'poison'))
    room.creep.push({ x: p.x, y: p.y + 6, r: 14, life: 2.5, kind: poison ? 'mine-poison' : 'mine', mine: true, t: 0 })
  }
  if (input.bang && p.bangs > 0) {
    p.bangs--
    run.stats.bangsUsed++
    room.bangs.push({ x: p.x, y: p.y, fuse: 1.5, power: p.flags.blast ? 1.6 : 1 })
    run.ev.push({ k: 'bangDown' })
  }
  if (input.use) useActive(run)
}

// Moves a body with tile collisions. Walls are solid except open doorways
// (for the player only).
export function moveBody (run, b, dx, dy, { fly = false, player = false, ghost = false } = {}) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6))
  for (let i = 0; i < steps; i++) {
    b.x += dx / steps
    b.y += dy / steps
    if (!ghost) pushOut(run, b, fly, player)
  }
}

// Walkers can't cross blocks, inkwells, fires or pits; fliers only stop at
// metal.
const solidFor = (t, fly) => (fly ? t === T.METAL : t !== T.FLOOR && t !== T.SPIKE)

function pushOut (run, b, fly, player) {
  const r = b.r
  // Tiles.
  for (const [tx, ty] of nearTiles(b.x, b.y, r)) {
    if (!solidFor(tileAtT(run, tx, ty), fly)) continue
    const rx = IX + tx * TILE; const ry = IX + ty * TILE
    const nx = clamp(b.x, rx, rx + TILE); const ny = clamp(b.y, ry, ry + TILE)
    const ddx = b.x - nx; const ddy = b.y - ny
    const d = len(ddx, ddy)
    if (d < r) {
      if (d === 0) { b.y = ry - r; continue }
      b.x = nx + (ddx / d) * r
      b.y = ny + (ddy / d) * r
    }
  }
  // Walls, with doorways for the player when they're open.
  const door = player ? openDoorAt(run, b) : null
  const minX = IX + r; const maxX = IX + IW - r; const minY = IX + r; const maxY = IX + IH - r
  if (door === 'w' || door === 'e') { b.y = clamp(b.y, CY - 14, CY + 14); if (door === 'e') b.x = Math.max(minX, b.x); else b.x = Math.min(maxX, b.x) } else if (door === 'n' || door === 's') { b.x = clamp(b.x, CX - 14, CX + 14); if (door === 's') b.y = Math.max(minY, b.y); else b.y = Math.min(maxY, b.y) } else {
    b.x = clamp(b.x, minX, maxX)
    b.y = clamp(b.y, minY, maxY)
  }
}

// Is the player in an open doorway?
function openDoorAt (run, b) {
  const room = run.floor.rooms[run.room.key]
  if (!run.room.doorsOpen) return null
  for (const [d, door] of Object.entries(room.doors)) {
    if (door.hidden || door.locked) continue
    if ((d === 'n' && b.y < IX + b.r + 2 && Math.abs(b.x - CX) < 22) || (d === 's' && b.y > IX + IH - b.r - 2 && Math.abs(b.x - CX) < 22) || (d === 'w' && b.x < IX + b.r + 2 && Math.abs(b.y - CY) < 22) || (d === 'e' && b.x > IX + IW - b.r - 2 && Math.abs(b.y - CY) < 22)) return d
  }
  return null
}

// Walking through a door (or into a locked one with a bookmark).
function checkDoors (run) {
  const p = run.p
  const room = run.floor.rooms[run.room.key]
  for (const [d, door] of Object.entries(room.doors)) {
    if (door.hidden) continue
    const near = (d === 'n' && p.y < IX + p.r + 3 && Math.abs(p.x - CX) < 22) || (d === 's' && p.y > IX + IH - p.r - 3 && Math.abs(p.x - CX) < 22) || (d === 'w' && p.x < IX + p.r + 3 && Math.abs(p.y - CY) < 22) || (d === 'e' && p.x > IX + IW - p.r - 3 && Math.abs(p.y - CY) < 22)
    if (door.locked && near && run.room.doorsOpen && p.marks > 0) {
      p.marks--
      door.locked = false
      run.ev.push({ k: 'unlock' })
    }
    const out = (d === 'n' && p.y < IX - 6) || (d === 's' && p.y > IX + IH + 6) || (d === 'w' && p.x < IX - 6) || (d === 'e' && p.x > IX + IW + 6)
    if (out) { run.ev.push({ k: 'door' }); enterRoom(run, door.to, d); return }
  }
}

// --- shooting ------------------------------------------------------------------------
const RANDOM_FX = ['burn', 'slow', 'poison', 'chain', 'pierce', 'homing', 'bounce', 'charm', 'fear', 'explode', 'split', 'knock']

export function fire (run, dx, dy, { from = run.p, dmgMul = 1, fam = false } = {}) {
  const p = run.p
  const s = p.stats
  const fx = p.shotFx
  const n = 1 + (fam ? 0 : fx.multi || 0)
  const spread = n > 1 ? 0.14 : 0
  const base = Math.atan2(dy, dx)
  const shots = []
  for (let i = 0; i < n; i++) shots.push(base + (i - (n - 1) / 2) * spread)
  if (fx.back && !fam) shots.push(base + Math.PI)
  for (const a of shots) {
    const flags = fam ? {} : { ...fx }
    if (flags.random) flags[rpick(run, RANDOM_FX)] = 1
    const speed = 300 * s.shotSpeed
    const side = (p.side = -p.side) * 4
    const t = {
      x: from.x + Math.cos(a) * 8 - Math.sin(a) * side, y: from.y - 4 + Math.sin(a) * 8 + Math.cos(a) * side,
      vx: Math.cos(a) * speed + (fam ? 0 : p.vx * 0.25), vy: Math.sin(a) * speed + (fam ? 0 : p.vy * 0.25),
      dmg: s.dmg * dmgMul * (fam ? 0.5 : 1), size: (fam ? 0.7 : 1) * (flags.big ? 1.55 : 1) * (flags.tiny ? 0.65 : 1) * (0.8 + s.size * 0.2),
      life: (225 * s.range) / speed + 0.1, age: 0, flags, hit: [], bounces: flags.bounce ? 3 : 0, wave: rand(run) * 6, a
    }
    t.crit = flags.mark && rand(run) < 0.12 + s.luck * 0.02
    run.room.tears.push(t)
    if (flags.echo) run.room.tears.push({ ...t, flags: { ...flags, echo: 0 }, hit: [], age: -0.15, x: from.x, y: from.y })
  }
  if (!fam) run.ev.push({ k: 'shoot' })
}

function stepTears (run) {
  const room = run.room
  for (const t of room.tears) {
    t.age += DT
    if (t.age < 0) continue
    const f = t.flags
    if (f.homing) {
      const e = nearestFoe(run, t.x, t.y, 220)
      if (e) {
        const want = Math.atan2(e.y - t.y, e.x - t.x)
        const cur = Math.atan2(t.vy, t.vx)
        let d = want - cur
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        const na = cur + clamp(d, -5 * DT, 5 * DT)
        const sp = len(t.vx, t.vy)
        t.vx = Math.cos(na) * sp; t.vy = Math.sin(na) * sp
      }
    }
    let ox = 0; let oy = 0
    if (f.wavy) { const w = Math.sin(t.age * 14 + t.wave) * 60; const sp = len(t.vx, t.vy) || 1; ox = (-t.vy / sp) * w * DT * 3; oy = (t.vx / sp) * w * DT * 3 }
    t.x += t.vx * DT + ox
    t.y += t.vy * DT + oy
    if (f.grow) t.growK = 1 + Math.min(1, t.age / (t.life || 1))
    const r = 5 * t.size * (t.growK || 1)
    // Tiles and walls.
    const tile = tileAt(run, t.x, t.y)
    const outside = t.x < IX || t.x > IX + IW || t.y < IX || t.y > IX + IH
    if (outside || (SOLID_FOR_TEARS.has(tile) && !f.spectral)) {
      if (t.bounces > 0 && (outside || tile !== T.FIRE)) {
        t.bounces--
        const px = t.x - t.vx * DT; const py = t.y - t.vy * DT
        if (outside ? (t.x < IX || t.x > IX + IW) : SOLID_FOR_TEARS.has(tileAt(run, t.x, py))) t.vx = -t.vx
        if (outside ? (t.y < IX || t.y > IX + IH) : SOLID_FOR_TEARS.has(tileAt(run, px, t.y))) t.vy = -t.vy
        t.x = px; t.y = py
        continue
      }
      if (!outside) hitTile(run, t.x, t.y, t.dmg)
      endTear(run, t)
      continue
    }
    // Enemies.
    for (const e of room.foes) {
      if (e.dead || e.untouchable || t.hit.includes(e) || e.z > 12) continue
      if (len(e.x - t.x, e.y - t.y) < e.r + r) {
        t.hit.push(e)
        let dmg = t.dmg * (t.growK || 1) * (t.crit ? 2.5 : 1)
        damage(run, e, dmg, { tear: t })
        if (f.knock || f.big) { const k = (f.knock ? 140 : 60) / (e.boss ? 6 : 1); e.kx = (e.kx || 0) + (t.vx / (len(t.vx, t.vy) || 1)) * k; e.ky = (e.ky || 0) + (t.vy / (len(t.vx, t.vy) || 1)) * k } else { e.kx = (e.kx || 0) + t.vx * 0.12 / (e.boss ? 6 : 1); e.ky = (e.ky || 0) + t.vy * 0.12 / (e.boss ? 6 : 1) }
        if (f.split && !t.child) for (const s of [-1, 1]) { const a = Math.atan2(t.vy, t.vx) + s * 1.1; room.tears.push({ ...t, flags: { ...f, split: 0 }, child: true, x: t.x, y: t.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, dmg: t.dmg * 0.5, size: t.size * 0.7, age: 0, life: 0.5, hit: [e] }) }
        if (f.chain) {
          const others = room.foes.filter((o) => o !== e && !o.dead && len(o.x - e.x, o.y - e.y) < 130).slice(0, 2)
          for (const o of others) { damage(run, o, t.dmg * 0.5, { kind: 'lightning' }); run.ev.push({ k: 'lightning', pts: [[e.x, e.y], [o.x, o.y]] }) }
        }
        dmg = 0
        if (!f.pierce) { endTear(run, t); break }
      }
    }
    if (t.age >= t.life) endTear(run, t)
  }
  room.tears = room.tears.filter((t) => !t.gone)
}

function endTear (run, t) {
  if (t.gone) return
  t.gone = true
  if (t.flags.explode) explode(run, t.x, t.y, 46, t.dmg * 1.6, { friendly: true })
  run.ev.push({ k: 'splash', x: t.x, y: t.y, col: tearColor(t.flags), size: t.size })
}

export function tearColor (f) {
  if (f.burn) return '#ff8a3a'
  if (f.poison) return '#7acb4a'
  if (f.slow) return '#9ae0ff'
  if (f.chain) return '#ffe14a'
  if (f.charm) return '#ff7aa8'
  if (f.fear) return '#8a5aaa'
  if (f.explode) return '#e84a4a'
  if (f.homing) return '#c070ff'
  if (f.spectral) return '#dfe4ff'
  return null
}

// --- damage --------------------------------------------------------------------------
export function damage (run, e, dmg, { tear = null, kind = null } = {}) {
  if (e.dead || dmg <= 0) return
  const def = FOES[e.id]
  if (def.onHit) { dmg = def.onHit(e, foeApi(run), dmg, tear) ?? dmg; if (dmg <= 0) return }
  if (e.armor) dmg *= e.armor
  e.hp -= dmg
  e.flash = 0.08
  const f = tear?.flags
  if (f) {
    if (f.burn) e.st.burn = Math.max(e.st.burn || 0, 3)
    if (f.poison) e.st.poison = Math.max(e.st.poison || 0, 4)
    if (f.slow) e.st.slow = Math.max(e.st.slow || 0, 2.5)
    if (f.charm && rand(run) < 0.2 + run.p.stats.luck * 0.03 && !e.boss) e.st.charm = 4
    if (f.fear && rand(run) < 0.2 + run.p.stats.luck * 0.03) e.st.fear = e.boss ? 1.2 : 3
    e.dotDmg = Math.max(e.dotDmg || 0, tear.dmg * 0.3)
  }
  run.ev.push({ k: 'hit', x: e.x, y: e.y, col: def.color || '#2b3050', crit: tear?.crit, kind })
  if (e.hp <= 0) kill(run, e)
}

function kill (run, e) {
  if (e.dead) return
  e.dead = true
  const def = FOES[e.id]
  const api = foeApi(run)
  if (def.onDeath) def.onDeath(e, api)
  run.stats.kills++
  run.ev.push({ k: 'die', x: e.x, y: e.y, col: def.color || '#2b3050', r: e.r, boss: Boolean(e.boss) })
  const p = run.p
  if (p.shotFx.leech && rand(run) < 0.1) { p.hp = Math.min(p.maxHp, p.hp + 1); run.ev.push({ k: 'heal' }) }
  // Champions leave something.
  if (e.champion === 'red') dropPick(run, e.x, e.y, 'half')
  if (e.champion === 'gold') for (let i = 0; i < 3; i++) dropPick(run, e.x, e.y, 'glyph')
  if (!e.boss && p.flags.greed && rand(run) < 0.08) dropPick(run, e.x, e.y, 'glyph')
}

// Hurting the player: n half hearts. Margin hearts go first.
export function hurt (run, n = 1, by = 'something') {
  const p = run.p
  if (p.inv > 0 || p.buffs.shield > 0 || run.over) return
  if (p.aegisUp) { p.aegisUp = false; p.inv = 1; run.ev.push({ k: 'aegis' }); return }
  if (run.fi >= 6 && n === 1 && by !== 'a curse room') n = 2
  while (n > 0 && p.soul > 0) { p.soul--; n-- }
  p.hp -= n
  p.inv = 1.1
  run.stats.hits++
  run.stats.floorHits++
  if (run.room.foes.some((e) => e.boss && !e.dead)) run.room.bossHit = true
  if (p.flags.rage && !p.rage) { p.rage = true; recompute(run) }
  run.ev.push({ k: 'hurt' })
  if (p.hp <= 0 && p.soul <= 0) {
    p.hp = 0
    run.over = { won: false, by, fi: run.fi, t: run.t }
    run.ev.push({ k: 'dead', by })
  }
}

// --- enemies -------------------------------------------------------------------------
export function spawnFoe (run, id, x, y, { boss = false, champion = null, parent = null, data = {} } = {}) {
  const def = FOES[id]
  if (!def) return null
  const fi = run.fi
  const scale = def.boss ? 1 + fi * 0.22 : 1 + fi * 0.12
  const e = {
    id, x, y, vx: 0, vy: 0, kx: 0, ky: 0, z: 0, r: def.r, hp: def.hp * scale * (champion === 'red' ? 2 : 1), maxHp: 0, t: 0, st: {}, state: 'idle', st0: 0,
    boss: boss || Boolean(def.boss), fly: Boolean(def.fly), champion, flash: 0, dead: false, data: { ...data }, parent, phase: 0, spawnT: def.boss ? 0 : 0.6
  }
  e.maxHp = e.hp
  if (champion === 'blue') e.spdMul = 1.4
  run.room.foes.push(e)
  if (def.init) def.init(e, foeApi(run))
  return e
}

function stepFoes (run, dt) {
  const room = run.room
  const api = foeApi(run)
  const p = run.p
  room.flowT -= dt
  if (room.flowT <= 0) { room.flow = flowField(run, p.x, p.y); room.flowT = 0.25 }
  for (const e of room.foes) {
    if (e.dead) continue
    const def = FOES[e.id]
    e.t += dt
    if (e.flash > 0) e.flash -= dt
    if (e.spawnT > 0) { e.spawnT -= dt; continue }
    // Status effects.
    const st = e.st
    for (const k of Object.keys(st)) if ((st[k] -= dt) <= 0) delete st[k]
    if ((st.burn || st.poison) && (e.dotT = (e.dotT || 0) - dt) <= 0) { e.dotT = 0.5; damage(run, e, Math.max(1, (e.dotDmg || 1)), { kind: st.burn ? 'burn' : 'poison' }); if (e.dead) continue }
    if (e.champion === 'green' && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + dt * 2)
    const freeze = st.freeze > 0
    e.slowK = (st.slow ? 0.5 : 1) * (e.spdMul || 1)
    if (!freeze) {
      if (st.fear) { const a = Math.atan2(e.y - p.y, e.x - p.x); api.moveBy(e, Math.cos(a) * 70 * dt, Math.sin(a) * 70 * dt) } else if (st.charm) {
        const o = room.foes.find((f) => f !== e && !f.dead && !f.st.charm)
        if (o) { const a = Math.atan2(o.y - e.y, o.x - e.x); api.moveBy(e, Math.cos(a) * 60 * dt, Math.sin(a) * 60 * dt); if (len(o.x - e.x, o.y - e.y) < o.r + e.r) damage(run, o, 10 * dt) }
      } else def.update(e, api, dt * e.slowK)
    }
    // Knockback.
    if (e.kx || e.ky) { api.moveBy(e, e.kx * dt * 6, e.ky * dt * 6); e.kx *= Math.pow(0.0001, dt); e.ky *= Math.pow(0.0001, dt); if (Math.abs(e.kx) + Math.abs(e.ky) < 1) e.kx = e.ky = 0 }
    // Touching you.
    if (!e.harmless && !st.charm && !freeze && e.z < 10 && len(e.x - p.x, e.y - p.y) < e.r + p.r - 2) hurt(run, 1, def.name || def.short || 'an enemy')
    if (p.flags.thorns && len(e.x - p.x, e.y - p.y) < e.r + p.r + 6 && (e.thornT = (e.thornT || 0) - dt) <= 0) { e.thornT = 0.4; damage(run, e, 5 + p.stats.dmg, { kind: 'thorns' }) }
  }
  room.foes = room.foes.filter((e) => !e.dead || e.keep)
}

// Distances from the player over walkable tiles, for walkers to follow.
function flowField (run, px, py) {
  const tiles = run.floor.rooms[run.room.key].tiles
  const dist = new Array(COLS * ROWS).fill(Infinity)
  const sx = clamp(Math.floor((px - IX) / TILE), 0, COLS - 1)
  const sy = clamp(Math.floor((py - IX) / TILE), 0, ROWS - 1)
  const q = [[sx, sy]]
  dist[sy * COLS + sx] = 0
  while (q.length) {
    const [x, y] = q.shift()
    const d = dist[y * COLS + x] + 1
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
      const t = tiles[ny * COLS + nx]
      if ((t !== T.FLOOR && t !== T.SPIKE) || dist[ny * COLS + nx] <= d) continue
      dist[ny * COLS + nx] = d
      q.push([nx, ny])
    }
  }
  return dist
}

export function nearestFoe (run, x, y, max = Infinity) {
  let best = null; let bd = max
  for (const e of run.room.foes) { if (e.dead || e.untouchable || e.st.charm) continue; const d = len(e.x - x, e.y - y); if (d < bd) { bd = d; best = e } }
  return best
}

// --- enemy shots ------------------------------------------------------------------
export function enemyShot (run, x, y, vx, vy, opt = {}) {
  run.room.shots.push({ x, y, vx, vy, r: opt.r || 6, life: opt.life || 4, col: opt.col || '#2b3050', age: 0, curve: opt.curve || 0, accel: opt.accel || 0, spectral: opt.spectral || false, text: opt.text || null, bounce: opt.bounce || 0, wait: opt.wait || 0, z: opt.z || 0, vz: opt.vz || 0, then: opt.then || null, retarget: opt.retarget || 0, from: opt.from || null })
}

function stepShots (run, dt) {
  const room = run.room
  const p = run.p
  for (const s of room.shots) {
    if (s.wait > 0) { s.wait -= dt; continue }
    s.age += dt
    if (s.curve) { const a = Math.atan2(s.vy, s.vx) + s.curve * dt; const sp = len(s.vx, s.vy); s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp }
    if (s.accel) { const sp = len(s.vx, s.vy); const k = Math.max(0, sp + s.accel * dt) / (sp || 1); s.vx *= k; s.vy *= k }
    s.x += s.vx * dt
    s.y += s.vy * dt
    if (s.vz || s.z) { s.vz -= 600 * dt; s.z += s.vz * dt; if (s.z <= 0) { s.z = 0; s.gone = true; run.ev.push({ k: 'splash', x: s.x, y: s.y, col: s.col, size: 1.4, enemy: true }); if (s.then) s.then(s) } }
    const out = s.x < IX - 10 || s.x > IX + IW + 10 || s.y < IX - 10 || s.y > IX + IH + 10
    const t = tileAt(run, s.x, s.y)
    if (out || (!s.spectral && SOLID_FOR_TEARS.has(t) && !s.z) || s.age > s.life) {
      if (s.bounce > 0 && !out) { s.bounce--; s.vx = -s.vx; s.vy = -s.vy } else { s.gone = true; if (!out) run.ev.push({ k: 'splash', x: s.x, y: s.y, col: s.col, size: 0.8, enemy: true }) }
    }
    if (!s.gone && s.z < 14 && len(s.x - p.x, s.y - p.y) < s.r + p.r - 3) { s.gone = true; hurt(run, 1, s.from || 'a stray mark') }
    // Orbitals block shots.
    for (const f of room.fams) if (f.kind === 'orbital' && len(f.x - s.x, f.y - s.y) < 12 + s.r) s.gone = true
  }
  room.shots = room.shots.filter((s) => !s.gone)
}

// --- explosions and tiles ----------------------------------------------------------
export function explode (run, x, y, r, dmg, { friendly = false, byPlayer = false } = {}) {
  const room = run.room
  run.ev.push({ k: 'boom', x, y, r })
  for (const e of room.foes) if (!e.dead && len(e.x - x, e.y - y) < r + e.r) damage(run, e, dmg, { kind: 'boom' })
  const p = run.p
  if (!friendly && !(byPlayer && p.blastproof) && len(p.x - x, p.y - y) < r + p.r) hurt(run, byPlayer ? 2 : 1, 'a bang')
  for (const [tx, ty] of nearTiles(x, y, r)) {
    const t = tileAtT(run, tx, ty)
    const cx = IX + tx * TILE + TILE / 2; const cy = IX + ty * TILE + TILE / 2
    if (len(cx - x, cy - y) > r + TILE * 0.4) continue
    if (t === T.BLOCK || t === T.POT || t === T.TINTED || t === T.FIRE) breakTile(run, tx, ty, t)
  }
  if (friendly) return
  // Bangs open secret doors (and bash open locked ones? no: bookmarks do that).
  const room0 = run.floor.rooms[room.key]
  for (const [d, door] of Object.entries(room0.doors)) {
    const [tx, ty] = DOOR_CELLS[d]
    const dx = IX + tx * TILE + TILE / 2 + DIRS[d][0] * TILE * 0.8; const dy = IX + ty * TILE + TILE / 2 + DIRS[d][1] * TILE * 0.8
    if (door.hidden && len(dx - x, dy - y) < r + 30) {
      door.hidden = false
      const other = run.floor.rooms[door.to]
      if (other?.doors[OPP[d]]) other.doors[OPP[d]].hidden = false
      if (other) other.seen = true
      run.ev.push({ k: 'secret' })
    }
  }
  // Pickups get pushed around.
  for (const pk of room.picks) { const dd = len(pk.x - x, pk.y - y); if (dd < r + 30 && dd > 0 && !pk.price) { pk.vx = ((pk.x - x) / dd) * 220; pk.vy = ((pk.y - y) / dd) * 220 } }
}

function breakTile (run, tx, ty, t) {
  const tiles = run.floor.rooms[run.room.key].tiles
  tiles[ty * COLS + tx] = T.FLOOR
  const x = IX + tx * TILE + TILE / 2; const y = IX + ty * TILE + TILE / 2
  run.ev.push({ k: 'tile', x, y, t })
  run.room.flowT = 0
  if (t === T.TINTED) dropPick(run, x, y, rpick(run, ['soul', 'bang', 'mark', 'glyph5']))
  if (t === T.POT && rand(run) < 0.35) dropPick(run, x, y, rpick(run, ['glyph', 'glyph', 'half', 'bang']))
}

function hitTile (run, x, y, dmg) {
  const tx = Math.floor((x - IX) / TILE); const ty = Math.floor((y - IX) / TILE)
  const t = tileAtT(run, tx, ty)
  if (t !== T.POT && t !== T.FIRE) return
  const k = `${tx},${ty}`
  run.room.hp[k] = (run.room.hp[k] ?? 9) - Math.max(1.5, dmg * 0.6)
  if (run.room.hp[k] <= 0) breakTile(run, tx, ty, t)
}

const tileAt0 = (room, x, y) => room.tiles[Math.floor((y - IX) / TILE) * COLS + Math.floor((x - IX) / TILE)]
export function tileAt (run, x, y) {
  return tileAtT(run, Math.floor((x - IX) / TILE), Math.floor((y - IX) / TILE))
}
export function tileAtT (run, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return T.METAL
  return run.floor.rooms[run.room.key].tiles[ty * COLS + tx]
}
export function nearTiles (x, y, r) {
  const out = []
  const x0 = Math.floor((x - r - IX) / TILE); const x1 = Math.floor((x + r - IX) / TILE)
  const y0 = Math.floor((y - r - IX) / TILE); const y1 = Math.floor((y + r - IX) / TILE)
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS) out.push([tx, ty])
  return out
}

function stepBangs (run) {
  const room = run.room
  for (const b of room.bangs) {
    b.fuse -= DT
    if (b.fuse <= 0) { b.gone = true; explode(run, b.x, b.y, 70 * b.power, 60 * b.power, { byPlayer: true }) }
  }
  room.bangs = room.bangs.filter((b) => !b.gone)
}

// --- pickups --------------------------------------------------------------------------
export function dropPick (run, x, y, kind) {
  const a = rand(run) * Math.PI * 2
  run.room.picks.push({ kind, x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 })
}

const PICK_R = 10
function stepPicks (run) {
  const room = run.room
  const p = run.p
  for (const k of room.picks) {
    if (k.taken) continue
    if (k.vx || k.vy) {
      const b = { x: k.x, y: k.y, r: 8 }
      moveBody(run, b, k.vx * DT, k.vy * DT)
      k.x = b.x; k.y = b.y
      k.vx *= Math.pow(0.02, DT); k.vy *= Math.pow(0.02, DT)
      if (Math.abs(k.vx) + Math.abs(k.vy) < 4) k.vx = k.vy = 0
    }
    if (p.flags.magnet && !k.price) { const d = len(p.x - k.x, p.y - k.y); if (d < 160 && d > 1) { k.x += ((p.x - k.x) / d) * 140 * DT; k.y += ((p.y - k.y) / d) * 140 * DT } }
    if (len(k.x - p.x, k.y - p.y) > PICK_R + p.r) continue
    if (k.price) { if (p.glyphs < k.price) continue }
    if (!collect(run, k.kind)) continue
    if (k.price) p.glyphs -= k.price
    k.taken = true
    run.ev.push({ k: 'pickup', kind: k.kind, x: k.x, y: k.y, bought: Boolean(k.price) })
  }
  room.picks = room.picks.filter((k) => !k.taken)
  // Pedestals.
  for (const s of room.peds) {
    if (!s.item || s.wait > 0) { if (s.wait > 0) s.wait -= DT; continue }
    if (len(s.x - p.x, s.y - p.y) > 22 + p.r) { s.away = true; continue }
    if (s.dropped && !s.away) continue
    if (s.price && p.glyphs < s.price) continue
    if (s.cost && p.maxHp <= s.cost) continue
    if (s.price) p.glyphs -= s.price
    if (s.cost) { p.maxHp -= s.cost; p.hp = Math.min(p.hp, p.maxHp) }
    const item = s.item
    s.item = null
    s.empty = true
    s.price = 0
    if (s.group) for (const o of room.peds) if (o !== s && o.group === s.group && o.item) { o.item = null; o.empty = true; run.ev.push({ k: 'poof', x: o.x, y: o.y }) }
    giveItem(run, item, false, s)
    s.wait = 0.3
  }
}

function collect (run, kind) {
  const p = run.p
  switch (kind) {
    case 'heart': if (p.hp >= p.maxHp) return false; p.hp = Math.min(p.maxHp, p.hp + 2); return true
    case 'half': if (p.hp >= p.maxHp) return false; p.hp = Math.min(p.maxHp, p.hp + 1); return true
    case 'soul': if (p.soul >= 24) return false; p.soul += 2; return true
    case 'glyph': p.glyphs = Math.min(99, p.glyphs + 1); return true
    case 'glyph5': p.glyphs = Math.min(99, p.glyphs + 5); return true
    case 'bang': p.bangs = Math.min(99, p.bangs + 1); return true
    case 'bang2': p.bangs = Math.min(99, p.bangs + 2); return true
    case 'mark': p.marks = Math.min(99, p.marks + 1); return true
    case 'charge': if (!p.active || p.active.charge >= p.active.max) return false; p.active.charge = p.active.max; return true
    default: return false
  }
}

// --- puddles ---------------------------------------------------------------------------
function stepCreep (run) {
  const room = run.room
  const p = run.p
  for (const c of room.creep) {
    c.life -= DT
    c.t = (c.t || 0) - DT
    if (c.mine) {
      if (c.t <= 0) {
        c.t = 0.33
        for (const e of room.foes) if (!e.dead && !e.fly && len(e.x - c.x, e.y - c.y) < c.r + e.r) { damage(run, e, c.kind === 'mine-poison' ? 1.5 : 2.5, { kind: 'creep' }); if (c.kind === 'mine-poison') e.st.poison = 2 }
      }
    } else if (!p.flight && len(p.x - c.x, p.y - c.y) < c.r + p.r - 4) hurt(run, 1, 'a puddle of ink')
  }
  room.creep = room.creep.filter((c) => c.life > 0)
}

// --- familiars ---------------------------------------------------------------------------
function newFam (run, kind) {
  const p = run.p
  return { kind: kind === 'u' ? 'shooter' : kind, u: kind === 'u', x: p.x, y: p.y, cd: 0, a: rand(run) * Math.PI * 2, trail: [], tgt: null }
}

function stepFams (run) {
  const room = run.room
  const p = run.p
  const shooters = room.fams.filter((f) => f.kind === 'shooter')
  const orbitals = room.fams.filter((f) => f.kind === 'orbital')
  // Shooters follow in a line behind you.
  let lead = { x: p.x, y: p.y }
  for (const f of shooters) {
    const d = len(lead.x - f.x, lead.y - f.y)
    if (d > 26) { f.x += ((lead.x - f.x) / d) * (d - 26); f.y += ((lead.y - f.y) / d) * (d - 26) }
    lead = f
    f.cd -= DT
    if (len(p.aimX, p.aimY) > 0 && p.fireCd > 0 && f.cd <= 0 && run.tick % 2 === 0 && room.foes.length) {
      f.cd = f.u ? 0.5 : 0.65
      fire(run, p.aimX, p.aimY, { from: f, fam: true, dmgMul: f.u ? 1.4 : 1 })
    }
  }
  orbitals.forEach((f, i) => {
    f.a += DT * 2.6
    const a = f.a + (i * Math.PI * 2) / orbitals.length
    f.x = p.x + Math.cos(a) * 34
    f.y = p.y + Math.sin(a) * 34
    for (const e of room.foes) if (!e.dead && len(e.x - f.x, e.y - f.y) < e.r + 10 && (e.orbT = (e.orbT || 0) - DT) <= 0) { e.orbT = 0.25; damage(run, e, 3 + p.stats.dmg * 0.5) }
  })
  for (const f of room.fams.filter((x) => x.kind === 'chaser')) {
    const e = nearestFoe(run, f.x, f.y)
    const tx = e ? e.x : p.x - 20; const ty = e ? e.y : p.y + 20
    const d = len(tx - f.x, ty - f.y)
    if (d > 4) { f.x += ((tx - f.x) / d) * Math.min(d, 170 * DT); f.y += ((ty - f.y) / d) * Math.min(d, 170 * DT) }
    if (e && d < e.r + 10 && (f.cd -= DT) <= 0) { f.cd = 0.3; damage(run, e, 4 + p.stats.dmg * 0.6) }
  }
  for (const f of room.fams.filter((x) => x.kind === 'helper')) {
    // Summoned for one room: they swing around and shoot the nearest enemy.
    f.a += DT * 2
    f.x = p.x + Math.cos(f.a) * 50; f.y = p.y + Math.sin(f.a) * 50
    const e = nearestFoe(run, f.x, f.y, 300)
    if (e && (f.cd -= DT) <= 0) { f.cd = 0.45; fire(run, e.x - f.x, e.y - f.y, { from: f, fam: true, dmgMul: 1.2 }) }
  }
}

// --- actives ------------------------------------------------------------------------------
export function useActive (run) {
  const p = run.p
  const a = p.active
  if (!a || a.charge < a.max) return
  const room = run.room
  const pw = a.item.active.p || 1
  let kind = a.item.active.a
  if (kind === 'random') kind = rpick(run, ['nuke', 'freeze', 'shield', 'bombs', 'summon', 'charm', 'haste', 'glyphs', 'lightning', 'shout', 'flame', 'heal'])
  a.charge = 0
  if (a.item.active.cost) hurt(run, 1, 'a cursed word')
  const foes = room.foes.filter((e) => !e.dead)
  switch (kind) {
    case 'nuke': for (const e of foes) damage(run, e, 30 * pw + run.fi * 6, { kind: 'nuke' }); run.ev.push({ k: 'shake', v: 10 }); break
    case 'heal': p.hp = Math.min(p.maxHp, p.hp + Math.round(2 * pw)); break
    case 'freeze': for (const e of foes) e.st.freeze = 3 + pw; break
    case 'shield': p.buffs.shield = 3 + pw * 2; break
    case 'dash': { const l = len(p.faceX, p.faceY) || 1; p.vx = (p.faceX / l) * 520; p.vy = (p.faceY / l) * 520; p.buffs.dash = 0.22; p.inv = Math.max(p.inv, 0.4); for (const e of foes) if (len(e.x - p.x, e.y - p.y) < 90) damage(run, e, 15 * pw); break }
    case 'bombs': room.bangs.push({ x: p.x, y: p.y, fuse: 1.2, power: 1.2 * Math.min(1.6, pw) }); break
    case 'summon': for (let i = 0; i < 2; i++) room.fams.push({ kind: 'helper', x: p.x, y: p.y, cd: 0, a: i * Math.PI }); break
    case 'reroll': for (const s of room.peds) if (s.item) s.item = drawItem(run, 'treasure'); break
    case 'charm': for (const e of foes) if (!e.boss) e.st.charm = 5 + pw * 2; else e.st.slow = 3; break
    case 'fear': for (const e of foes) e.st.fear = (e.boss ? 1.5 : 4) * pw; break
    case 'teleport': { const keys = Object.keys(run.floor.rooms).filter((k) => k !== room.key && run.floor.rooms[k].type !== 'secret' && run.floor.rooms[k].type !== 'deal'); if (keys.length && room.doorsOpen) { enterRoom(run, rpick(run, keys), null); run.ev.push({ k: 'teleport' }) } else a.charge = a.max; break }
    case 'reveal': for (const r of Object.values(run.floor.rooms)) r.seen = true; for (const r of Object.values(run.floor.rooms)) for (const d of Object.values(r.doors)) if (d.kind === 'secret') { d.hidden = false } break
    case 'haste': p.buffs.haste = 8 * pw; recompute(run); break
    case 'glyphs': for (let i = 0; i < Math.round(4 * pw); i++) dropPick(run, p.x, p.y, 'glyph'); break
    case 'flood': for (const e of foes) { const d = len(e.x - p.x, e.y - p.y) || 1; e.kx = ((e.x - p.x) / d) * (e.boss ? 40 : 260); e.ky = ((e.y - p.y) / d) * (e.boss ? 40 : 260); damage(run, e, 10 * pw) } room.shots = []; break
    case 'lightning': for (const e of foes) { damage(run, e, 20 * pw + run.fi * 4, { kind: 'lightning' }); run.ev.push({ k: 'lightning', pts: [[e.x, IX], [e.x, e.y]] }) } break
    case 'shout': for (let i = 0; i < 12; i++) { const ang = (i / 12) * Math.PI * 2; room.tears.push({ x: p.x, y: p.y, vx: Math.cos(ang) * 320, vy: Math.sin(ang) * 320, dmg: p.stats.dmg * 1.5 * pw, size: 1.3, life: 0.9, age: 0, flags: { pierce: 1 }, hit: [], bounces: 0, wave: 0 }) } break
    case 'copy': for (const k of [...room.picks]) if (!k.price) dropPick(run, k.x, k.y, k.kind); break
    case 'slowtime': p.buffs.slowtime = 4 + pw * 2; break
    case 'flame': for (let i = 0; i < 16; i++) { const ang = (i / 16) * Math.PI * 2; room.tears.push({ x: p.x, y: p.y, vx: Math.cos(ang) * 240, vy: Math.sin(ang) * 240, dmg: p.stats.dmg * pw, size: 1.4, life: 0.8, age: 0, flags: { burn: 1, pierce: 1 }, hit: [], bounces: 0, wave: 0 }) } break
    case 'cloud': for (let i = 0; i < 8; i++) { const ang = (i / 8) * Math.PI * 2; room.creep.push({ x: p.x + Math.cos(ang) * 40, y: p.y + Math.sin(ang) * 40, r: 26, life: 6, kind: 'mine-poison', mine: true, t: 0 }) } break
    case 'holy': p.soul = Math.min(24, p.soul + 2); p.buffs.shield = 2; break
  }
  run.ev.push({ k: 'use', a: kind, word: a.item.word })
}

// --- clearing a room --------------------------------------------------------------------
function checkClear (run) {
  const room = run.room
  const r = run.floor.rooms[room.key]
  if (room.doorsOpen) return
  if (room.foes.some((e) => !e.dead && !e.st.charm && !e.ignore)) return
  for (const e of room.foes) if (!e.dead && e.st.charm) kill(run, e)
  room.doorsOpen = true
  r.cleared = true
  const p = run.p
  if (p.active && p.active.charge < p.active.max) p.active.charge++
  if (p.flags.regen) { p.regenAcc += p.flags.regen; while (p.regenAcc >= 3) { p.regenAcc -= 3; p.hp = Math.min(p.maxHp, p.hp + 1) } }
  run.ev.push({ k: 'clear' })
  if (r.type === 'boss') return bossCleared(run, r)
  if (r.type === 'miniboss') {
    if (!run.stats.sins.includes(r.boss)) run.stats.sins.push(r.boss)
    for (let i = 0; i < 3; i++) dropPick(run, CX, CY, rpick(run, ['heart', 'soul', 'glyph5', 'bang', 'mark']))
    if (rand(run) < 0.2) room.peds.push({ item: drawItem(run, 'treasure'), x: CX, y: CY })
    return
  }
  // A reward, sometimes.
  const luck = p.stats.luck
  if (rand(run) < 0.42 + luck * 0.04) {
    const kind = run.fi > 0 && rand(run) < 0.07 ? 'charge' : rpick(run, ['glyph', 'glyph', 'glyph', 'heart', 'half', 'bang', 'mark', 'soul', 'glyph5', 'heart'])
    dropPick(run, CX, CY, kind)
  }
}

function bossCleared (run, r) {
  const room = run.room
  const p = run.p
  const id = r.boss
  if (!run.stats.bosses.includes(id)) run.stats.bosses.push(id)
  if (!room.bossHit) run.stats.noHitBosses++
  run.ev.push({ k: 'bossDie', id })
  const floor = FLOORS[run.fi]
  if (floor.final === 'redpen') {
    if (run.deep) { r.trap = { kind: 'deeper', x: CX - 60, y: CY }; r.trap2 = { kind: 'end', x: CX + 60, y: CY } } else r.trap = { kind: 'end', x: CX, y: CY }
    return
  }
  if (floor.final === 'autocorrect') { r.trap = { kind: 'end', x: CX, y: CY, deep: true }; return }
  room.peds.push({ item: drawItem(run, 'boss'), x: CX, y: CY - 50, wait: 1 })
  dropPick(run, CX, CY + 40, rand(run) < 0.5 ? 'heart' : 'soul')
  r.trap = { kind: 'hatch', x: CX, y: CY + 10 }
  // A deal, sometimes: a door to words you love, or words you hate.
  const chance = 0.3 + (run.stats.floorHits === 0 ? 0.3 : 0) + p.stats.luck * 0.03
  if (run.fi >= 1 && rand(run) < chance) {
    const free = ['n', 'e', 's', 'w'].find((d) => !r.doors[d])
    if (free) {
      const deal = rand(run) < 0.5 ? 'beloved' : 'nemesis'
      const k = `deal:${run.fi}`
      run.floor.rooms[k] = { key: k, x: r.x + DIRS[free][0], y: r.y + DIRS[free][1], type: 'deal', deal, doors: { [OPP[free]]: { to: r.key, kind: 'deal' } }, seed: `${run.seed}:deal:${run.fi}`, cleared: true, visited: false, seen: true, items: [], pickups: [], tiles: new Array(COLS * ROWS).fill(T.FLOOR) }
      r.doors[free] = { to: k, kind: 'deal', deal }
      run.ev.push({ k: 'dealDoor', deal })
    }
  }
}

// Stepping into a hatch or a book's last page.
export function checkTraps (run) {
  const r = run.floor.rooms[run.room.key]
  const p = run.p
  for (const trap of [r.trap, r.trap2]) {
    if (!trap || !run.room.doorsOpen) continue
    if (len(trap.x - p.x, trap.y - p.y) > 18) continue
    if (trap.kind === 'hatch') { run.ev.push({ k: 'descend' }); startFloor(run, run.fi + 1); return }
    if (trap.kind === 'deeper') { run.ev.push({ k: 'descend' }); startFloor(run, 9); return }
    if (trap.kind === 'end') {
      run.over = { won: true, deep: Boolean(trap.deep), fi: run.fi, t: run.t }
      run.ev.push({ k: 'won', deep: Boolean(trap.deep) })
      return
    }
  }
}

// --- saving -------------------------------------------------------------------------
// The run as plain data, kept between sessions. The live room isn't kept:
// you come back to the start of the room you were in.
export function serialize (run) {
  if (run.room) saveRoom(run)
  const { ev, room, banner, ...rest } = run
  return JSON.parse(JSON.stringify({ ...rest, curKey: run.floor.cur }))
}

export function restore (data) {
  const run = { ...data, ev: [], banner: { title: FLOORS[data.fi].name, sub: 'Picking up where you left off.', t: 2.5 }, room: null }
  const key = data.curKey || run.floor.cur
  recompute(run)
  enterRoom(run, key, null)
  run.ev = []
  return run
}

export { hash01 }
