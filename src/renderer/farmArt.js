// Pixel art for the Word Farm, drawn in code: the word gods and the farmer
// as 16×24 sprites (written as the left half and mirrored, plus whatever's
// in their hands), and the tiles, crops, fish and things on the ground.

// Letters in a sprite: o outline, s skin, S skin shade, e eye, m mouth or
// blush, h hair, H hair shade, c clothes, C clothes shade, a/A accents,
// w white, b boots, x/X extras. '.' is see-through.
const SPRITES = {
  vela: {
    pal: { o: '#3a2a3a', s: '#f6d5b8', S: '#e0b090', e: '#3a2a4a', m: '#e88a9a', h: '#f0c850', H: '#c89a28', c: '#fbf3e4', C: '#ddd0bc', a: '#e8b830', w: '#ffffff', b: '#c8a060' },
    half: ['....a.a.', '........', '.....ooo', '....ohhh', '...ohhhh', '..ohhhhh', '..ohhHhh', '..ohssss', '..ohsses', '..ohsses', '..ohsmss', '..ohsssm', '..ohhsss', '..ohhoSS', '..ohhwcc', '..ohhccc', '..ohhccc', '..oHhaaa', '.oshhccc', '..oHcccc', '..occccc', '..oCcccc', '..oCcCcc', '...obb..']
  },
  kip: {
    pal: { o: '#2a1e1a', s: '#e8b890', S: '#c89870', e: '#2a1e1a', m: '#a0402a', h: '#c8502a', H: '#9a3418', c: '#8a929a', C: '#6a7078', a: '#8a5a30', A: '#6a4020', x: '#7a5030', b: '#3a2a2a' },
    half: ['........', '........', '.....ooo', '....ohhh', '...ohhhh', '..ohhhhh', '..ohHhhh', '..ohssss', '..oHsses', '..ohsses', '..ohhsss', '..ohhhhm', '...ohhhh', '....ohhh', '...occaa', '..occaaa', '..occaaa', '..occaaa', '.osccaaa', '..occaaa', '..oCcaaa', '..oCcaAa', '..oCCaAa', '...obb..'],
    over: [[12, 11, ['oooo', 'oCCo', 'oCCo', 'oxxo', '.ox.', '.ox.', '.ox.', '.ox.', '.oo.']]]
  },
  etyma: {
    pal: { o: '#2a2a1e', s: '#e8c8a8', S: '#c8a888', e: '#2a2a1e', m: '#c87a6a', h: '#5a9a4a', H: '#3a7a3a', a: '#c8a040', c: '#7a5a3a', C: '#5a4028', A: '#8ac85a', w: '#f4ecd8', x: '#a03a3a', b: '#3a2a20' },
    half: ['......oo', '.....ohh', '....ooHh', '...ohhhh', '..ohhhhh', '..ohhHhh', '..ohhhhh', '..ohssss', '..ohaeaa', '..ohaaas', '..ohsmss', '..ohsssm', '...ossss', '....oSSS', '...occcc', '..occccc', '..occAcc', '..occccc', '.osccccc', '..occccc', '..oCcccc', '..oCcccc', '..oCcCcc', '...obb..'],
    over: [[12, 15, ['oooo', 'oxwo', 'oxwo', 'oxwo', 'oooo']]]
  },
  orrin: {
    pal: { o: '#2a1e2a', s: '#d8a880', S: '#b88860', e: '#2a1e2a', m: '#b0605a', h: '#6a4a2a', H: '#4a3018', a: '#7a3ab8', A: '#5a2a90', c: '#3a6ad8', C: '#2a4aa8', w: '#f4f4f4', x: '#b07a3a', X: '#8a5a28', b: '#3a2a2a' },
    half: ['........', '....oooo', '...oaaaa', '..oaaaaa', '.oaaaaaa', 'ooAAAAAA', '..ohhhhh', '..ohssss', '..ohsses', '..ohsses', '..ohsmss', '..ohsssm', '...ossss', '....oSSS', '...occcc', '..occccc', '..occccc', '..obbbbb', '.osccccc', '..occccc', '..oCcccc', '..oCcccc', '..oCcCcc', '...obb..'],
    over: [[11, 0, ['..ww', '.ww.', 'ww..']], [9, 12, ['.....o', '....oX', '...oX.', '..oXo.', '.oxxxo', 'oxxoxo', 'oxxxxo', '.oxxo.', '..oo..']]]
  },
  hush: {
    pal: { o: '#141428', s: '#f0e0e8', S: '#d8c4d0', e: '#4a3a6a', m: '#c890a8', h: '#1a1a2a', c: '#2a3a6a', C: '#1a2a4a', a: '#c8b8e0', A: '#a898c8', w: '#e8e0f8', b: '#1a1a2a' },
    half: ['........', '......oo', '.....occ', '....occc', '...occcc', '..occccc', '..occhhh', '..occsss', '..occses', '..occses', '..occaaa', '..occaaa', '...ocaaa', '...occAa', '..occccc', '..occccc', '..occccc', '..occccc', '.osccccc', '..occccc', '..oCcccc', '..oCcccc', '.oCCcCcc', '...obb..'],
    over: [[13, 9, ['w.w', '.A.']]]
  },
  pip: {
    pal: { o: '#2a1a2a', s: '#f0c8a0', S: '#d0a880', e: '#2a1a2a', m: '#c8505a', h: '#7a4a2a', a: '#4ab84a', A: '#e8c830', w: '#ffffff', c: '#4ab84a', C: '#3a983a', x: '#e8c830', X: '#c8a820', b: '#5a2a5a' },
    half: ['........', '.w......', '.oa...oo', '..oaaoaa', '...oaaaa', '..oaaaaa', '..owwwww', '..ohssss', '..ohsses', '..ohsses', '..ohsmss', '..ohssmm', '...ossss', '....oSSS', '...owwww', '..occccc', '..occccc', '..occccc', '.osccccc', '..occccc', '..occccc', '..oCcccc', '..oCcccc', '...obb..'],
    right: { a: 'A', c: 'x', C: 'X' } // a two-colour jester
  },
  thea: {
    pal: { o: '#2a1a1a', s: '#f6d0b0', S: '#d8b090', e: '#2a1a2a', m: '#e07a8a', h: '#b8502a', H: '#8a3a1a', a: '#e86a9a', c: '#2aa89a', C: '#1a8878', b: '#3a2a2a' },
    half: ['........', '.....aa.', '.....ooa', '....ohhh', '...ohhhh', '..ohhhhh', '..ohhhHh', '..ohssss', '..ohsses', '..ohsses', '..ohsmss', '..ohsssm', '..ohosss', '..oh.oSS', '..ohoccc', '..ohoccc', '..oHoccc', '..oaoccc', '.osoaccc', '..occccc', '..occccc', '.oCccccc', '.oCcCccc', '...obb..']
  },
  glyph: {
    pal: { o: '#0e0e16', s: '#e8d0b8', S: '#c8b098', e: '#1e1e2a', m: '#a07070', h: '#f0f0f4', H: '#c0c0d0', c: '#262636', C: '#16161e', a: '#3a6ad8', w: '#ffffff', b: '#121218' },
    half: ['........', '........', '.....ooo', '....ohhh', '...ohhhh', '..ohhhhh', '..ohHhhh', '..ohssss', '..ohsses', '..oHsses', '..ohssss', '..ohsssm', '...ossss', '....oSSS', '...oaaaa', '..occcca', '..occcca', '..occcca', '.oscccca', '..occcca', '..occcca', '..oCccca', '..oCcCca', '...obb..'],
    over: [[12, 6, ['...w', '..ww', '..wa', '.wwa', '.wa.', 'wwa.', 'wa..', 'a...', 'o...']]]
  },
  farmer: {
    pal: { o: '#2a1a12', s: '#f0c8a0', S: '#d0a880', e: '#2a1a12', m: '#c8706a', h: '#6a3a1a', a: '#e8c860', A: '#c8a040', c: '#5aa85a', x: '#3a6ab8', X: '#2a4a98', b: '#4a2a1a' },
    half: ['........', '........', '.....ooo', '....oaaa', '...oaaaa', '.ooAAAAA', '..ohhhhh', '..ohssss', '..ohsses', '..ohsses', '..ohsmss', '..ohsssm', '...ossss', '....oSSS', '...occcc', '..occxcc', '..occxcc', '..ocxxxx', '.osxxxxx', '..oxxxxx', '..oXxxxx', '..oxxxo.', '..oxxxo.', '...obbo.']
  }
}

// The whole 16×24 grid of a sprite, as rows of letters.
export function spriteRows (id) {
  const sp = SPRITES[id]
  const rows = sp.half.map((h) => {
    const right = [...h].reverse().map((ch) => (sp.right && sp.right[ch]) || ch).join('')
    return (h + right).split('')
  })
  for (const [x0, y0, grid] of sp.over || []) {
    grid.forEach((line, dy) => [...line].forEach((ch, dx) => { if (ch !== '.' && rows[y0 + dy] && x0 + dx < 16) rows[y0 + dy][x0 + dx] = ch }))
  }
  return rows
}
export const SPRITE_W = 16
export const SPRITE_H = 24

const cache = new Map()
// A sprite drawn onto its own small canvas, `scale` screen pixels a pixel.
export function spriteCanvas (id, scale = 1) {
  const key = `${id}|${scale}`
  if (cache.has(key)) return cache.get(key)
  const rows = spriteRows(id)
  const pal = SPRITES[id].pal
  const c = document.createElement('canvas')
  c.width = SPRITE_W * scale
  c.height = SPRITE_H * scale
  const g = c.getContext('2d')
  rows.forEach((row, y) => row.forEach((ch, x) => { if (ch !== '.' && pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * scale, y * scale, scale, scale) } }))
  cache.set(key, c)
  return c
}
export function spriteDataUrl (id, scale = 6) { return spriteCanvas(id, scale).toDataURL() }
export const GOD_COLORS = Object.fromEntries(Object.entries(SPRITES).map(([id, s]) => [id, s.pal.c]))

// --- tiles ------------------------------------------------------------------------------
const hashXY = (x, y, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }

export const COLORS = {
  day: { grass: '#7cc46a', grass2: '#6ab85a', grass3: '#8ed07a', path: '#d8c08a', path2: '#c8ac74', water: '#4a9ad8', water2: '#6ab4e8', soil: '#9a6a42', soilWet: '#6a4428', tree: '#3a8a4a', tree2: '#2a6a3a', trunk: '#7a4a2a', wall: '#e8d8b8', roof: '#c8503a', roof2: '#a83a2a', wood: '#a8784a', wood2: '#7a5030', stone: '#a8a8b0', stone2: '#7a7a88' }
}

// Draw the ground for one tile (16×16 at x, y in pixels).
export function drawTile (g, ch, tx, ty, px, py, t, C = COLORS.day, around = () => '.') {
  const R = (k) => hashXY(tx, ty, k)
  const grass = () => {
    g.fillStyle = C.grass; g.fillRect(px, py, 16, 16)
    for (let i = 0; i < 6; i++) { g.fillStyle = R(i) < 0.5 ? C.grass2 : C.grass3; g.fillRect(px + Math.floor(R(i + 10) * 15), py + Math.floor(R(i + 20) * 15), 1, 2) }
  }
  switch (ch) {
    case ',': {
      g.fillStyle = C.path; g.fillRect(px, py, 16, 16)
      for (let i = 0; i < 5; i++) { g.fillStyle = C.path2; g.fillRect(px + Math.floor(R(i) * 15), py + Math.floor(R(i + 9) * 15), 2, 1) }
      break
    }
    case 'W': case 'D': {
      g.fillStyle = C.water; g.fillRect(px, py, 16, 16)
      const phase = (t / 900 + R(1) * 6) % 6
      g.fillStyle = C.water2
      g.fillRect(px + Math.floor(R(2) * 10), py + Math.floor(R(3) * 12), 4 + Math.floor(Math.sin(phase) * 2 + 2), 1)
      // A sandy edge where the water meets the land.
      g.fillStyle = C.path
      if (around(0, -1) !== 'W' && around(0, -1) !== 'D') g.fillRect(px, py, 16, 2)
      if (around(0, 1) !== 'W' && around(0, 1) !== 'D') g.fillRect(px, py + 14, 16, 2)
      if (around(-1, 0) !== 'W' && around(-1, 0) !== 'D') g.fillRect(px, py, 2, 16)
      if (around(1, 0) !== 'W' && around(1, 0) !== 'D') g.fillRect(px + 14, py, 2, 16)
      if (ch === 'D') { g.fillStyle = C.wood; g.fillRect(px, py + 4, 16, 8); g.fillStyle = C.wood2; for (let i = 0; i < 16; i += 4) g.fillRect(px + i, py + 4, 1, 8) }
      break
    }
    case 'P': case 'F': case 'H': case 'S': case 'B': case 'A': case 'R': case 'T': case 'f': case '.':
    default:
      grass()
      if (ch === 'f') {
        const cols = ['#f4f0f0', '#f0d040', '#e870a0', '#a080e8']
        for (let i = 0; i < 3; i++) { g.fillStyle = cols[Math.floor(R(i + 30) * cols.length)]; const fx = px + 2 + Math.floor(R(i + 40) * 11); const fy = py + 2 + Math.floor(R(i + 50) * 11); g.fillRect(fx, fy, 2, 2); g.fillStyle = '#4a8a3a'; g.fillRect(fx, fy + 2, 1, 2) }
      }
  }
}

// Things that stand on the ground, drawn after the tiles.
export function drawProp (g, ch, tx, ty, px, py, t, C = COLORS.day, around = () => '.') {
  const R = (k) => hashXY(tx, ty, k)
  if (ch === 'T') {
    g.fillStyle = C.trunk; g.fillRect(px + 6, py + 9, 4, 7)
    g.fillStyle = C.tree2; g.beginPath(); g.arc(px + 8, py + 7, 8, 0, Math.PI * 2); g.fill()
    g.fillStyle = C.tree; g.beginPath(); g.arc(px + 7, py + 6, 6, 0, Math.PI * 2); g.fill()
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(px + 4, py + 3, 3, 2)
    if (R(5) < 0.15) { g.fillStyle = '#e85a5a'; g.fillRect(px + 10, py + 6, 2, 2) }
  } else if (ch === 'F') {
    g.fillStyle = C.wood2
    const left = around(-1, 0) === 'F'
    const right = around(1, 0) === 'F'
    const up = around(0, -1) === 'F'
    const down = around(0, 1) === 'F'
    g.fillRect(px + 6, py + 4, 4, 10)
    g.fillStyle = C.wood
    if (left) g.fillRect(px, py + 7, 8, 2)
    if (right) g.fillRect(px + 8, py + 7, 8, 2)
    if (up) g.fillRect(px + 7, py, 2, 8)
    if (down) g.fillRect(px + 7, py + 8, 2, 8)
    g.fillRect(px + 7, py + 3, 2, 2)
  } else if (ch === 'R') {
    g.fillStyle = C.stone2; g.fillRect(px + 2, py + 6, 12, 8)
    g.fillStyle = C.stone; g.fillRect(px + 3, py + 5, 10, 7)
    g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(px + 4, py + 6, 3, 2)
  } else if (ch === 'A') {
    // A standing stone, with a letter that glows.
    g.fillStyle = C.stone2; g.fillRect(px + 3, py - 6, 10, 21)
    g.fillStyle = C.stone; g.fillRect(px + 4, py - 5, 8, 19)
    const glow = 0.45 + 0.35 * Math.sin(t / 700 + tx)
    g.fillStyle = `rgba(150, 200, 255, ${glow})`
    const letter = 'AEIOUKQRSTXZ'[Math.floor(R(7) * 12)]
    g.font = 'bold 9px monospace'; g.textAlign = 'center'; g.fillText(letter, px + 8, py + 5)
  }
}

// The farmhouse, the seed stall and the shipping bin, drawn once each at
// their top-left tile.
export function drawBuildings (g, T, t, C = COLORS.day, night = 0) {
  // Farmhouse: tiles (2..6, 2..5).
  const hx = 2 * T; const hy = 2 * T
  g.fillStyle = C.wall; g.fillRect(hx + 4, hy + 22, 5 * T - 8, 2 * T + 10)
  g.fillStyle = C.roof2; g.beginPath(); g.moveTo(hx - 2, hy + 26); g.lineTo(hx + 2.5 * T, hy - 6); g.lineTo(hx + 5 * T + 2, hy + 26); g.fill()
  g.fillStyle = C.roof; g.beginPath(); g.moveTo(hx + 2, hy + 24); g.lineTo(hx + 2.5 * T, hy - 2); g.lineTo(hx + 5 * T - 2, hy + 24); g.fill()
  for (let i = 0; i < 6; i++) { g.fillStyle = C.roof2; g.fillRect(hx + 10 + i * 10, hy + 4 + Math.abs(i - 2.5) * 6, 6, 1) }
  // Chimney with a little smoke.
  g.fillStyle = C.stone2; g.fillRect(hx + 3.6 * T, hy - 2, 8, 14)
  for (let i = 0; i < 3; i++) { const k = ((t / 1400 + i / 3) % 1); g.fillStyle = `rgba(240,240,240,${0.5 * (1 - k)})`; g.beginPath(); g.arc(hx + 3.6 * T + 4 + Math.sin(k * 6 + i) * 3, hy - 4 - k * 20, 3 + k * 4, 0, Math.PI * 2); g.fill() }
  // Door and windows (lit at night).
  g.fillStyle = C.wood2; g.fillRect(hx + 2 * T + 2, hy + 3 * T + 2, 12, 22)
  g.fillStyle = '#e8c048'; g.fillRect(hx + 2 * T + 11, hy + 3 * T + 13, 2, 2)
  const win = night > 0.3 ? '#f8d878' : '#a8d8f0'
  for (const wx of [hx + 12, hx + 4 * T - 4]) { g.fillStyle = C.wood2; g.fillRect(wx - 1, hy + 2 * T + 5, 18, 14); g.fillStyle = win; g.fillRect(wx, hy + 2 * T + 6, 16, 12); g.fillStyle = C.wood2; g.fillRect(wx + 7, hy + 2 * T + 6, 2, 12) }
  // Seed stall: tiles (10..12, 2..3), a striped awning over crates.
  const sx = 10 * T; const sy = 2 * T
  g.fillStyle = C.wood2; g.fillRect(sx + 2, sy + 8, 3, 2 * T - 6); g.fillRect(sx + 3 * T - 5, sy + 8, 3, 2 * T - 6)
  g.fillStyle = C.wood; g.fillRect(sx, sy + T + 4, 3 * T, T - 2)
  for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#f4f0e8' : '#4aa86a'; g.fillRect(sx - 2 + i * 9, sy, 9, 10) }
  g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(sx - 2, sy + 9, 3 * T + 4, 2)
  const crops = ['#b0305a', '#e8b82a', '#6ac85a', '#e87a2a', '#3a5ad8']
  crops.forEach((c, i) => { g.fillStyle = c; g.fillRect(sx + 4 + i * 8, sy + T + 1, 5, 4) })
  g.fillStyle = '#3a2a1a'; g.font = 'bold 7px monospace'; g.textAlign = 'center'; g.fillText('SEEDS', sx + 1.5 * T, sy + 2 * T - 3)
  // Shipping bin: tile (7, 5).
  const bx = 7 * T; const by = 5 * T
  g.fillStyle = C.wood2; g.fillRect(bx + 1, by + 3, 14, 12)
  g.fillStyle = C.wood; g.fillRect(bx + 2, by + 4, 12, 4); g.fillRect(bx + 2, by + 9, 12, 5)
  g.fillStyle = C.wood2; g.fillRect(bx, by + 2, 16, 3)
}

// --- crops -------------------------------------------------------------------------------
export function drawCrop (g, p, crop, px, py, t) {
  const stage = p.ready ? 4 : Math.min(3, Math.floor(p.progress * 4))
  const sway = Math.sin(t / 800 + px) * (stage >= 2 ? 0.6 : 0.3)
  const leaf = crop.leaf
  g.save()
  g.translate(px + 8, py + 13)
  // A sprout, then a plant, then the crop.
  g.fillStyle = leaf
  if (stage === 0) { g.fillRect(-1, -3, 2, 3); g.fillRect(-3 + sway, -4, 2, 2); g.fillRect(1 + sway, -4, 2, 2) } else {
    const h = [0, 5, 8, 10, 10][stage]
    g.fillRect(-1, -h, 2, h)
    g.fillRect(-4 + sway, -h + 2, 3, 2); g.fillRect(1 + sway, -h + 3, 3, 2)
    if (stage >= 2) { g.fillRect(-5 + sway, -h + 5, 3, 2); g.fillRect(2 + sway, -h + 6, 3, 2) }
  }
  if (stage === 4) {
    g.fillStyle = crop.color
    switch (crop.shape) {
      case 'root': g.fillRect(-3, -3, 6, 4); g.fillRect(-2, 1, 4, 1); break
      case 'herb': for (let i = 0; i < 4; i++) g.fillRect(-5 + i * 3, -9 + (i % 2) * 2, 2, 2); break
      case 'hang': g.fillRect(2, -7, 4, 6); g.fillRect(-6, -6, 4, 6); break
      case 'bush': for (const [x, y] of [[-5, -8], [-2, -10], [2, -9], [4, -6], [-4, -5], [0, -6]]) g.fillRect(x, y, 2, 2); break
      case 'flower': g.fillStyle = '#e8b82a'; g.fillRect(-4, -14, 8, 8); g.fillStyle = '#7a4a1a'; g.fillRect(-2, -12, 4, 4); break
      case 'stalk': g.fillRect(2, -9, 3, 6); g.fillStyle = '#7ab84a'; g.fillRect(2, -10, 3, 1); break
      case 'melon': g.beginPath(); g.ellipse(0, -2, 6, 5, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(-1, -6, 1, 9); g.fillRect(-4, -5, 1, 7); g.fillRect(3, -5, 1, 7); break
      case 'word': {
        // A little scroll with the word's first letter.
        g.fillStyle = '#f4ecd8'; g.fillRect(-5, -13, 10, 8)
        g.fillStyle = '#c8a888'; g.fillRect(-6, -13, 1, 8); g.fillRect(5, -13, 1, 8)
        g.fillStyle = '#5a3a8a'; g.font = 'bold 7px monospace'; g.textAlign = 'center'; g.fillText((p.word || '?')[0].toUpperCase(), 0, -6)
        break
      }
      default: g.fillRect(-3, -6, 6, 6)
    }
    // A soft sparkle: ready to pick.
    const s = (Math.sin(t / 300 + px) + 1) / 2
    g.fillStyle = `rgba(255,255,255,${0.4 + 0.5 * s})`; g.fillRect(5, -12, 1, 3); g.fillRect(4, -11, 3, 1)
  } else if (crop.shape === 'word' && stage >= 2) {
    g.fillStyle = '#c8a0e8'; g.fillRect(-1, -11, 3, 3)
  }
  g.restore()
}

// A little fish, any colour, for the bag and the catch.
export function drawFish (g, color, x, y, s = 1, legendary = false) {
  const px = (dx, dy, w = 1, h = 1) => g.fillRect(x + dx * s, y + dy * s, w * s, h * s)
  g.fillStyle = '#1a2a3a'
  px(2, 1, 7, 1); px(1, 2, 1, 3); px(2, 5, 7, 1); px(9, 2, 1, 3); px(10, 1, 1, 1); px(10, 5, 1, 1); px(11, 1, 1, 5)
  g.fillStyle = color; px(2, 2, 7, 3); px(10, 2, 1, 3)
  g.fillStyle = 'rgba(255,255,255,.45)'; px(3, 2, 4, 1)
  g.fillStyle = '#1a2a3a'; px(3, 3, 1, 1)
  if (legendary) { g.fillStyle = '#fff6a0'; px(5, 0, 1, 1); px(8, 0, 1, 1); px(6, -1, 1, 1) }
}

// Things on the ground to pick up.
export function drawForage (g, kind, px, py, t) {
  const bob = Math.sin(t / 600 + px) > 0.6 ? -1 : 0
  g.save(); g.translate(px, py + bob)
  const d = (c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h) }
  if (kind === 'dandelion') { d('#4a8a3a', 7, 8, 1, 6); d('#f0d040', 5, 5, 5, 4); d('#f8e870', 6, 6, 3, 2) } else if (kind === 'lavender') { d('#4a8a3a', 7, 6, 1, 8); for (let i = 0; i < 4; i++) d('#9a7ad8', 6 + (i % 2), 3 + i * 2, 2, 2) } else if (kind === 'clover') { d('#3a9a3a', 7, 9, 1, 5); d('#4ac84a', 4, 5, 4, 4); d('#4ac84a', 8, 5, 4, 4); d('#4ac84a', 4, 1 + 8, 0, 0); d('#5ad85a', 6, 2, 4, 4) } else if (kind === 'inkcap') { d('#f0ece4', 7, 8, 2, 6); d('#e0d8d0', 4, 3, 8, 5); d('#f8f4f0', 5, 3, 4, 2); d('#3a3a5a', 4, 8, 1, 2); d('#3a3a5a', 7, 8, 1, 1); d('#3a3a5a', 11, 8, 1, 3) } else if (kind === 'shell') { d('#f0d0c0', 4, 8, 8, 5); d('#d8a090', 6, 8, 1, 5); d('#d8a090', 9, 8, 1, 5); d('#f8e8e0', 5, 9, 1, 1) }
  g.restore()
}
