// Floors: a handful of rooms on a grid, grown out from the start, with the
// boss at the far end and special rooms in the dead ends. Rooms get their
// furniture (blocks, pits, inkwells, fires) when the floor is made, and
// their enemies the first time you walk in.

import { Rng } from './rng.js'
import { COLS, ROWS, T, FLOORS, CHAPTER_BOSSES, SINS } from './content.js'

export const DIRS = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }
export const OPP = { n: 's', s: 'n', w: 'e', e: 'w' }
const key = (x, y) => `${x},${y}`
const GRID = 11
const SPECIAL = new Set(['treasure', 'shop', 'boss', 'curse', 'library', 'miniboss'])

// Each chapter's enemies: [id, cost, weight]. Later floors mix in some
// of what came before.
export const CHAPTER_FOES = [
  [['smudge', 1, 4], ['comma', 1, 4], ['period', 2, 2], ['inkblot', 2, 2], ['dustbunny', 1, 3], ['hyphen', 2, 2]],
  [['quotes', 3, 2], ['bracket', 3, 2], ['asterisk', 3, 2], ['caret', 2, 3], ['moth', 1, 3], ['bookworm', 3, 2], ['smudge', 1, 1], ['period', 2, 1]],
  [['bang', 2, 2], ['query', 3, 2], ['tilde', 2, 3], ['silverfish', 1, 3], ['quill', 3, 2], ['bookend', 3, 1], ['moth', 1, 1], ['asterisk', 3, 1]],
  [['capital', 4, 2], ['stamp', 3, 2], ['eraser', 3, 2], ['ampersand', 4, 2], ['semicolon', 3, 2], ['ghostwriter', 3, 2], ['silverfish', 1, 1], ['quill', 3, 1]],
  [['redactor', 3, 3], ['footnote', 1, 3], ['stamp', 3, 2], ['capital', 4, 1], ['bang', 2, 2], ['quill', 3, 2], ['eraser', 3, 1]],
  [['redactor', 3, 2], ['footnote', 1, 3], ['ghostwriter', 3, 2], ['ampersand', 4, 2], ['query', 3, 2], ['semicolon', 3, 2], ['asterisk', 3, 1]]
]

// --- the floor --------------------------------------------------------------------
export function genFloor (seed, fi, { bossId = null } = {}) {
  const rng = new Rng(`${seed}:floor:${fi}`)
  const floor = FLOORS[fi]
  const final = Boolean(floor.final)
  const target = final ? 7 + rng.int(2) : Math.min(20, Math.round(7 + fi * 1.45 + rng.int(2)))
  const specials = final ? 2 : 2 + (fi >= 1 ? 1 : 0) + 2 // boss, treasure, shop, + room for extras
  for (let attempt = 0; attempt < 400; attempt++) {
    const cells = new Map()
    const start = [Math.floor(GRID / 2), Math.floor(GRID / 2)]
    cells.set(key(...start), { x: start[0], y: start[1] })
    const queue = [start]
    const neigh = (x, y) => Object.values(DIRS).filter(([dx, dy]) => cells.has(key(x + dx, y + dy))).length
    while (cells.size < target && queue.length) {
      const [cx, cy] = queue.shift()
      for (const [dx, dy] of rng.shuffle(Object.values(DIRS))) {
        const x = cx + dx; const y = cy + dy
        if (cells.size >= target) break
        if (x < 0 || y < 0 || x >= GRID || y >= GRID || cells.has(key(x, y))) continue
        if (neigh(x, y) > 1 || rng.chance(0.45)) continue
        cells.set(key(x, y), { x, y })
        queue.push([x, y])
      }
      if (!queue.length && cells.size < target) queue.push(...rng.shuffle([...cells.values()].map((c) => [c.x, c.y])).slice(0, 3))
    }
    if (cells.size < target) continue
    const dist = (c) => Math.abs(c.x - start[0]) + Math.abs(c.y - start[1])
    const dead = [...cells.values()].filter((c) => key(c.x, c.y) !== key(...start) && neigh(c.x, c.y) === 1).sort((a, b) => dist(b) - dist(a))
    if (dead.length < Math.min(specials, 4) || dist(dead[0]) < 3) continue
    // Types: the start, the boss far away, then treasure and a shop, then extras.
    for (const c of cells.values()) c.type = 'normal'
    cells.get(key(...start)).type = 'start'
    const take = () => dead.shift()
    take().type = 'boss'
    take().type = 'treasure'
    if (!final && dead.length) take().type = 'shop'
    if (!final && dead.length && fi >= 1 && rng.chance(0.4)) take().type = 'miniboss'
    if (!final && dead.length && rng.chance(0.3)) take().type = 'library'
    if (!final && dead.length && fi >= 1 && rng.chance(0.35)) take().type = 'curse'
    // A secret room: an empty spot with the most rooms around it (not the boss).
    let secret = null
    let best = 1
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (cells.has(key(x, y))) continue
        const around = Object.values(DIRS).map(([dx, dy]) => cells.get(key(x + dx, y + dy))).filter(Boolean)
        if (around.some((c) => c.type === 'boss' || c.type === 'start')) continue
        if (around.length > best || (around.length === best && rng.chance(0.3))) { best = around.length; secret = { x, y } }
      }
    }
    if (secret && best >= 2) cells.set(key(secret.x, secret.y), { ...secret, type: 'secret' })
    return buildRooms(cells, seed, fi, rng, bossId, start)
  }
  throw new Error('Could not lay out a floor.')
}

function buildRooms (cells, seed, fi, rng, bossId, start) {
  const ch = FLOORS[fi].ch
  const rooms = {}
  for (const c of cells.values()) {
    const k = key(c.x, c.y)
    const room = { key: k, x: c.x, y: c.y, type: c.type, doors: {}, seed: `${seed}:${fi}:${k}`, cleared: c.type !== 'normal' && c.type !== 'boss' && c.type !== 'miniboss', visited: false, seen: false, items: [], pickups: [] }
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      const other = cells.get(key(c.x + dx, c.y + dy))
      if (!other) continue
      if ((c.type === 'secret') !== (other.type === 'secret')) {
        room.doors[d] = { to: key(other.x, other.y), kind: 'secret', hidden: true }
        continue
      }
      // A door looks like the special room it leads to (or comes from), and
      // is locked from the outside of a treasure room (from the third
      // floor), a shop (from the second) or a library.
      const kind = SPECIAL.has(other.type) ? other.type : SPECIAL.has(c.type) ? c.type : 'normal'
      const locked = (other.type === 'treasure' && fi >= 2) || (other.type === 'shop' && fi >= 1) || other.type === 'library'
      room.doors[d] = { to: key(other.x, other.y), kind, locked }
    }
    room.tiles = genLayout(new Rng(`${room.seed}:layout`), room.type, ch, Object.keys(room.doors))
    if (room.type === 'boss') room.boss = bossId || rng.pick(CHAPTER_BOSSES[ch])
    if (room.type === 'miniboss') room.boss = rng.pick(SINS)
    rooms[k] = room
  }
  const st = rooms[key(...start)]
  st.visited = true
  return { rooms, start: st.key }
}

// --- a room's furniture ------------------------------------------------------------
const idx = (x, y) => y * COLS + x
export const DOOR_CELLS = { n: [6, 0], s: [6, ROWS - 1], w: [0, 3], e: [COLS - 1, 3] }
export const walkable = (t) => t === T.FLOOR || t === T.SPIKE

function clearDoors (tiles) {
  // Keep the cells inside each door, and a cross through the middle, open.
  for (let x = 5; x <= 7; x++) for (let y = 0; y <= 1; y++) { tiles[idx(x, y)] = T.FLOOR; tiles[idx(x, ROWS - 1 - y)] = T.FLOOR }
  for (let y = 2; y <= 4; y++) for (let x = 0; x <= 1; x++) { tiles[idx(x, y)] = T.FLOOR; tiles[idx(COLS - 1 - x, y)] = T.FLOOR }
}

// Can you get from every door to every other, and to most of the room?
export function connected (tiles, doors = Object.keys(DOOR_CELLS)) {
  const seen = new Set()
  const [sx, sy] = DOOR_CELLS[doors[0] || 'n']
  const stack = [[sx, sy]]
  while (stack.length) {
    const [x, y] = stack.pop()
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || seen.has(idx(x, y)) || !walkable(tiles[idx(x, y)])) continue
    seen.add(idx(x, y))
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }
  const open = tiles.filter(walkable).length
  return doors.every((d) => seen.has(idx(...DOOR_CELLS[d]))) && seen.size >= open * 0.85
}

// Symmetric patterns, drawn in the top-left quarter and mirrored.
function mirror (rng, place) {
  const tiles = new Array(COLS * ROWS).fill(T.FLOOR)
  const both = rng.chance(0.75)
  for (let y = 0; y < Math.ceil(ROWS / 2); y++) {
    for (let x = 0; x < Math.ceil(COLS / 2); x++) {
      const t = place(x, y)
      if (t === T.FLOOR) continue
      tiles[idx(x, y)] = t
      tiles[idx(COLS - 1 - x, y)] = t
      if (both) { tiles[idx(x, ROWS - 1 - y)] = t; tiles[idx(COLS - 1 - x, ROWS - 1 - y)] = t }
    }
  }
  return tiles
}

const PATTERNS = [
  // Nothing much.
  (rng) => mirror(rng, () => T.FLOOR),
  // Pillars.
  (rng) => { const px = 2 + rng.int(3); const py = 1 + rng.int(2); return mirror(rng, (x, y) => (x === px && y === py ? T.BLOCK : T.FLOOR)) },
  // A scatter of blocks.
  (rng) => { const d = rng.range(0.08, 0.18); return mirror(rng, () => (rng.chance(d) ? T.BLOCK : T.FLOOR)) },
  // A block in the middle.
  (rng) => { const w = 1 + rng.int(3); const h = rng.int(2); const t = rng.chance(0.3) ? T.PIT : T.BLOCK; return mirror(rng, (x, y) => (x >= 6 - w && y >= 3 - h ? t : T.FLOOR)) },
  // A pool of ink in the middle.
  (rng) => mirror(rng, (x, y) => (x >= 4 && y >= 2 && !(x === 6 && y === 3 && rng.chance(0.5)) ? T.PIT : T.FLOOR)),
  // Rows, with gaps.
  (rng) => { const row = 1 + rng.int(2); return mirror(rng, (x, y) => (y === row && x >= 2 && x !== 4 ? T.BLOCK : T.FLOOR)) },
  // Corners filled in.
  (rng) => { const n = 1 + rng.int(2); return mirror(rng, (x, y) => (x <= n && y <= n - 1 + (x === 0 ? 1 : 0) && !(x === 0 && y === 2) ? (rng.chance(0.25) ? T.PIT : T.BLOCK) : T.FLOOR)) },
  // Staples on the floor.
  (rng) => mirror(rng, (x, y) => (x >= 3 && y >= 1 && (x + y) % 2 === 0 && rng.chance(0.6) ? T.SPIKE : T.FLOOR)),
  // A ring of blocks round the middle.
  (rng) => mirror(rng, (x, y) => ((x === 4 && y >= 2) || (y === 2 && x >= 4)) && !(x === 6) ? T.BLOCK : T.FLOOR),
  // Pits in a checker.
  (rng) => mirror(rng, (x, y) => (x >= 2 && y >= 1 && x % 2 === 0 && y % 2 === 1 ? T.PIT : T.FLOOR))
]

export function genLayout (rng, type, ch, doors) {
  for (let attempt = 0; attempt < 30; attempt++) {
    let tiles
    if (type === 'start' || type === 'shop' || type === 'library' || type === 'secret') tiles = PATTERNS[0](rng)
    else if (type === 'treasure') tiles = rng.chance(0.5) ? PATTERNS[1](rng) : PATTERNS[0](rng)
    else if (type === 'boss' || type === 'miniboss') tiles = rng.chance(0.5) ? PATTERNS[1](rng) : PATTERNS[0](rng)
    else tiles = rng.pick(attempt > 15 ? PATTERNS.slice(0, 3) : PATTERNS.slice(0, ch === 0 ? 7 : PATTERNS.length))(rng)
    if (type === 'normal' || type === 'curse') {
      // Inkwells, a tinted block with something in it, a fire or two.
      for (let i = rng.int(3); i > 0; i--) { const c = rng.int(tiles.length); if (tiles[c] === T.FLOOR) tiles[c] = T.POT }
      const blocks = tiles.map((t, i) => (t === T.BLOCK ? i : -1)).filter((i) => i >= 0)
      if (blocks.length && rng.chance(0.2)) tiles[rng.pick(blocks)] = T.TINTED
      if (blocks.length > 3 && ch >= 2 && rng.chance(0.3)) tiles[rng.pick(blocks)] = T.METAL
      if (ch >= 1 && rng.chance(0.18)) { const c = rng.int(tiles.length); if (tiles[c] === T.FLOOR) tiles[c] = T.FIRE }
    }
    clearDoors(tiles)
    if (type === 'boss' || type === 'treasure') for (let x = 4; x <= 8; x++) for (let y = 2; y <= 4; y++) if (tiles[idx(x, y)] !== T.FLOOR) tiles[idx(x, y)] = T.FLOOR
    if (connected(tiles, doors.length ? doors : ['n'])) return tiles
  }
  const tiles = new Array(COLS * ROWS).fill(T.FLOOR)
  return tiles
}

// --- who's in a room ----------------------------------------------------------------
// Enemies the first time you come in, kept away from the door you used.
export function genEnemies (room, fi, entry) {
  const rng = new Rng(`${room.seed}:enemies`)
  const ch = FLOORS[fi].ch
  const pool = CHAPTER_FOES[ch]
  let budget = Math.min(12, 2.5 + fi * 0.65 + rng.range(0, 2.5))
  const main = rng.weighted(pool.map((p) => [p, p[2]]))
  const other = rng.chance(0.5) ? rng.weighted(pool.map((p) => [p, p[2]])) : main
  const [ex, ey] = entry ? DOOR_CELLS[entry] : [6, 3]
  const spots = []
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (room.tiles[idx(x, y)] === T.FLOOR && Math.abs(x - ex) + Math.abs(y - ey) >= 4) spots.push([x, y])
  const out = []
  const free = rng.shuffle(spots)
  while (budget > 0 && free.length) {
    const [id, cost] = rng.chance(0.65) ? main : other
    if (cost > budget + 0.5 && out.length) break
    budget -= cost
    const [x, y] = free.shift()
    out.push({ id, tx: x, ty: y, champion: fi >= 1 && rng.chance(0.04 + fi * 0.012) ? rng.pick(['red', 'blue', 'gold', 'green']) : null })
  }
  return out
}
