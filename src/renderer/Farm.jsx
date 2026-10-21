import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, Coins, useToast } from './ui.jsx'
import { formatCoins } from '../shared/economy.js'
import { MAP, MAP_W, MAP_H, tileAt, SOLID, PLOTS, plotIndex, DOOR, GODS, itemInfo } from '../shared/farm.js'
import { spriteCanvas, spriteDataUrl, drawTile, drawProp, drawBuildings, drawCrop, drawFish, drawForage, COLORS } from './farmArt.js'

// The Word Farm: walk around a little pixel farm (arrow keys or WASD, or
// click where to go), plant word seeds, water, harvest, fish in the pond,
// and get to know the word gods. Everything moves in real time.

const T = 16 // pixels a tile
const W = MAP_W * T
const H = MAP_H * T
const SPEED = 4.2 // tiles a second
const REACH = 1.6

const isSolid = (x, y) => SOLID.has(tileAt(x, y))
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const hourNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 }
function darkness (h) {
  if (h < 5) return 0.55
  if (h < 7) return 0.55 * (7 - h) / 2
  if (h < 18) return 0
  if (h < 21) return 0.5 * (h - 18) / 3
  return 0.55
}

// Shortest walk from tile a to any of the goal tiles, as tile centres.
function findPath (from, goals) {
  const key = (x, y) => y * MAP_W + x
  const goalSet = new Set(goals.map(([x, y]) => key(x, y)))
  const prev = new Map([[key(from[0], from[1]), null]])
  const q = [from]
  while (q.length) {
    const [x, y] = q.shift()
    if (goalSet.has(key(x, y))) {
      const path = []
      let k = key(x, y)
      while (k !== null) { path.unshift([k % MAP_W, Math.floor(k / MAP_W)]); k = prev.get(k) }
      return path.slice(1).map(([px, py]) => ({ x: px + 0.5, y: py + 0.5 }))
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || isSolid(nx, ny) || prev.has(key(nx, ny))) continue
      prev.set(key(nx, ny), key(x, y))
      q.push([nx, ny])
    }
  }
  return null
}
// Walkable tiles next to (x, y), or the tile itself if you can stand on it.
function standTiles (x, y) {
  const out = isSolid(x, y) ? [] : [[x, y]]
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) if (!isSolid(x + dx, y + dy)) out.push([x + dx, y + dy])
  return out
}

export default function Farm () {
  const toast = useToast()
  const [farm, setFarm] = useState(null)
  const [seed, setSeed] = useState(null) // the seed in hand
  const [panel, setPanel] = useState('bag')
  const [menu, setMenu] = useState(null) // a god's menu
  const [dialog, setDialog] = useState(null) // { god, lines, after }
  const [shop, setShop] = useState(false)
  const [bin, setBin] = useState(false)
  const [picking, setPicking] = useState(null) // a god to give a gift to
  const [fishing, setFishing] = useState(null)
  const farmRef = useRef(null)
  farmRef.current = farm

  const load = useCallback(() => api('farm').then(setFarm).catch(() => {}), [])
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t) }, [load])

  const act = useCallback(async (action, ...args) => {
    try {
      const res = await api('farmAction', action, ...args)
      setFarm(res.farm)
      return res.out
    } catch (err) { toast({ error: true, title: 'Not now', text: err.message }); return undefined }
  }, [toast])

  const seeds = useMemo(() => (farm?.bag || []).filter((x) => x.kind === 'seed' || x.kind === 'wordseed'), [farm])
  useEffect(() => { if (seed && !seeds.some((s) => s.id === seed)) setSeed(null) }, [seeds, seed])
  const busy = Boolean(menu || dialog || shop || bin || picking || fishing)

  // What happens when you reach something.
  const interact = useCallback(async (target) => {
    const f = farmRef.current
    if (!f || !target) return
    if (target.kind === 'plot') {
      const p = f.plots[target.i]
      if (!p) {
        if (!seed) { toast({ emoji: '🌱', title: 'Pick a seed first', text: 'Choose one from the row of seeds under the farm.' }); return }
        await act('plant', target.i, seed)
      } else if (p.ready) {
        const out = await act('harvest', target.i)
        if (out) toast({ emoji: '🧺', title: `Picked ${out.info.name}`, text: `Worth ${formatCoins(out.info.sell)} at the shipping bin.` })
      } else if (!p.wet) await act('water', target.i)
      else toast({ emoji: '🌿', title: p.crop === 'word' ? `“${p.word}” is growing` : `${f.crops[p.crop].name} is growing`, text: `About ${p.hoursLeft < 1 ? 'less than an hour' : `${Math.ceil(p.hoursLeft)} wet hours`} to go. The soil’s still damp.` })
    } else if (target.kind === 'god') setMenu(target.id)
    else if (target.kind === 'stall') setShop(true)
    else if (target.kind === 'bin') setBin(true)
    else if (target.kind === 'forage') {
      const out = await act('forage', target.id)
      if (out) toast({ emoji: '✨', title: `Found ${out.info.name}`, text: out.info.blurb })
    } else if (target.kind === 'water') {
      const out = await act('cast')
      if (out) setFishing({ ...out, at: target, phase: 'wait', started: Date.now() })
    } else if (target.kind === 'door') {
      toast({ emoji: '🏡', title: 'Home', text: f.spouse ? `${GODS[f.spouse].name} has the kettle on.` : 'Cozy and quiet. The farm will keep growing while you’re away.' })
    }
  }, [act, seed, toast])

  if (!farm) return <div className='farm-wait'>Walking out to the farm…</div>
  const selected = farm.bag.find((x) => x.id === seed)
  return (
    <div className='farm'>
      <FarmTop farm={farm} />
      <div className='farm-stage'>
        <FarmCanvas farm={farm} busy={busy} interact={interact} fishing={fishing} />
        {fishing && <Fishing f={fishing} setF={setFishing} act={act} toast={toast} />}
        {menu && <GodMenu farm={farm} id={menu} onClose={() => setMenu(null)} onTalk={async () => { const out = await act('talk', menu); setMenu(null); if (out) setDialog({ god: menu, lines: out.lines, event: out.event, note: out.gift ? `${GODS[menu].name} gave you something: ${farm.bag.find((x) => x.id === out.gift)?.name || out.gift}.` : out.gained ? `+${out.gained} friendship` : null }) }} onGift={() => { setPicking(menu); setMenu(null) }} />}
        {picking && <GiftPicker farm={farm} id={picking} onClose={() => setPicking(null)} onGive={async (item) => { const id = picking; setPicking(null); const out = await act('gift', id, item); if (out) setDialog({ god: id, lines: [out.line], note: out.married ? `You and ${GODS[id].name} are married! 💍` : out.dating ? `You and ${GODS[id].name} are dating 💐` : `${out.points >= 0 ? '+' : ''}${out.points} friendship${out.birthday ? ' (birthday!)' : ''}` }) }} />}
        {dialog && <Dialog d={dialog} onClose={() => setDialog(null)} />}
        {shop && <Shop farm={farm} act={act} onClose={() => setShop(false)} toast={toast} />}
        {bin && <Bin farm={farm} act={act} onClose={() => setBin(false)} toast={toast} />}
      </div>
      <div className='farm-bar'>
        <div className='farm-seeds' role='toolbar' aria-label='Seeds in hand'>
          <button className={`farm-slot ${!seed ? 'on' : ''}`} onClick={() => setSeed(null)} title='Empty hands: water and pick'>✋<small>Hands</small></button>
          {seeds.slice(0, 14).map((s, i) => (
            <button key={s.id} className={`farm-slot ${seed === s.id ? 'on' : ''} ${s.kind}`} onClick={() => setSeed(s.id)} title={s.name}>
              <SeedIcon s={s} farm={farm} /><small>{s.kind === 'wordseed' ? s.word : s.name.replace(/ seeds$/, '')}</small><i>{s.n}</i>
            </button>
          ))}
          {seeds.length > 14 && <span className='farm-more'>+{seeds.length - 14} more in your bag</span>}
        </div>
        <div className='farm-btns'>
          <button className='btn small ghost' onClick={async () => { const n = await act('waterAll'); if (n !== undefined) toast({ emoji: '💧', title: n ? `Watered ${n} plot${n === 1 ? '' : 's'}` : 'Nothing needs water', text: n ? 'They’ll stay damp for eight hours.' : farm.rainy ? 'The rain has it covered.' : 'Everything is damp or ready.' }) }}>💧 Water all</button>
        </div>
      </div>
      {selected && <p className='farm-hint'>Holding <b>{selected.name}</b>. Click an empty plot to plant it.</p>}
      <div className='farm-panels'>
        <div className='seg'>
          {[['bag', '🎒 Bag'], ['gods', '✨ The gods'], ['log', '📜 Farm log']].map(([id, label]) => <button key={id} className={panel === id ? 'on' : ''} onClick={() => setPanel(id)}>{label}</button>)}
        </div>
        {panel === 'bag' && <BagPanel farm={farm} />}
        {panel === 'gods' && <GodsPanel farm={farm} />}
        {panel === 'log' && <LogPanel farm={farm} />}
      </div>
    </div>
  )
}

function FarmTop ({ farm }) {
  const d = new Date(farm.at)
  const part = { morning: '🌅 Morning', day: '☀️ Afternoon', evening: '🌇 Evening', night: '🌙 Night' }[farm.part]
  return (
    <div className='farm-top'>
      <h2>Word Farm</h2>
      <span className='farm-when'>{d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} · {part}{farm.rainy ? ' · 🌧️ Rain (the crops are watered)' : ''}</span>
      <span className='grow' />
      <span className='farm-coins'><Coins n={farm.coins} /></span>
    </div>
  )
}

function SeedIcon ({ s, farm }) {
  const c = s.kind === 'wordseed' ? farm.wordCrop : farm.crops[s.crop]
  return <span className='farm-seed' style={{ '--c': c?.color || '#c8a0e8' }} aria-hidden='true' />
}

// --- the world --------------------------------------------------------------------------
function FarmCanvas ({ farm, busy, interact, fishing }) {
  const canvas = useRef(null)
  const st = useRef({ x: DOOR[0] + 0.5, y: DOOR[1] + 0.6, path: null, target: null, keys: new Set(), moving: false, face: 1, hover: null })
  const farmRef = useRef(farm)
  farmRef.current = farm
  const busyRef = useRef(busy)
  busyRef.current = busy
  const fishRef = useRef(fishing)
  fishRef.current = fishing
  const interactRef = useRef(interact)
  interactRef.current = interact
  useEffect(() => { window.__farmWalk = st.current; return () => { delete window.__farmWalk } }, []) // for checking it in tests

  // Everything you can do something with, at the tile clicked.
  const targetAt = useCallback((tx, ty) => {
    const f = farmRef.current
    const god = f.gods.find((g) => Math.round(g.spot[0]) === tx && (Math.round(g.spot[1]) === ty || Math.round(g.spot[1]) - 1 === ty))
    if (god) return { kind: 'god', id: god.id, x: god.spot[0] + 0.5, y: god.spot[1] + 0.5, tiles: standTiles(god.spot[0], god.spot[1]) }
    const fo = f.forage.find((x) => x.x === tx && x.y === ty)
    if (fo) return { kind: 'forage', id: fo.id, x: tx + 0.5, y: ty + 0.5, tiles: standTiles(tx, ty) }
    const ch = tileAt(tx, ty)
    if (ch === 'P') return { kind: 'plot', i: plotIndex(tx, ty), x: tx + 0.5, y: ty + 0.5, tiles: standTiles(tx, ty) }
    if (ch === 'W' || ch === 'D') return { kind: 'water', x: tx + 0.5, y: ty + 0.5, tiles: standTiles(tx, ty) }
    if (ch === 'S') return { kind: 'stall', x: 11.5, y: 3.5, tiles: [[10, 4], [11, 4], [12, 4]] }
    if (ch === 'B') return { kind: 'bin', x: 7.5, y: 5.5, tiles: standTiles(7, 5) }
    if (ch === 'H') return { kind: 'door', x: DOOR[0] + 0.5, y: DOOR[1] + 0.5, tiles: [DOOR] }
    if (!isSolid(tx, ty)) return { kind: 'walk', x: tx + 0.5, y: ty + 0.5, tiles: [[tx, ty]] }
    return null
  }, [])

  const goTo = useCallback((target) => {
    const s = st.current
    if (!target) return
    if (target.kind !== 'walk' && dist(s, target) <= REACH) { s.path = null; interactRef.current(target); return }
    const path = findPath([Math.floor(s.x), Math.floor(s.y)], target.tiles)
    if (!path) return
    s.path = path
    s.target = target.kind === 'walk' ? null : target
  }, [])

  // Keyboard: walk, and E or space to use what's nearest.
  useEffect(() => {
    const down = (e) => {
      if (busyRef.current || e.target.closest('input, textarea')) return
      const k = e.key.toLowerCase()
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) { st.current.keys.add(k); st.current.path = null; e.preventDefault() }
      if (k === 'e' || k === ' ') {
        e.preventDefault()
        const s = st.current
        let best = null
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const t = targetAt(Math.floor(s.x) + dx, Math.floor(s.y) + dy)
            if (!t || t.kind === 'walk' || t.kind === 'door') continue
            const d = dist(s, t) + (t.kind === 'water' ? 0.4 : 0)
            if (d <= REACH && (!best || d < best.d)) best = { ...t, d }
          }
        }
        if (best) interactRef.current(best)
      }
    }
    const up = (e) => st.current.keys.delete(e.key.toLowerCase())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [targetAt])

  useEffect(() => {
    const c = canvas.current
    const g = c.getContext('2d')
    let raf
    let last = performance.now()
    const flies = Array.from({ length: 14 }, (_, i) => ({ x: 14 + (i * 7.3) % 16, y: 3 + (i * 3.7) % 15, p: i }))
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = st.current
      const f = farmRef.current
      // Moving: keys first, then a clicked path.
      let mx = 0; let my = 0
      if (!busyRef.current) {
        if (s.keys.has('arrowleft') || s.keys.has('a')) mx--
        if (s.keys.has('arrowright') || s.keys.has('d')) mx++
        if (s.keys.has('arrowup') || s.keys.has('w')) my--
        if (s.keys.has('arrowdown') || s.keys.has('s')) my++
      }
      if ((mx || my)) {
        const len = Math.hypot(mx, my)
        const nx = s.x + (mx / len) * SPEED * dt
        const ny = s.y + (my / len) * SPEED * dt
        const free = (x, y) => ![[-0.28, -0.1], [0.28, -0.1], [-0.28, 0.25], [0.28, 0.25]].some(([ox, oy]) => isSolid(Math.floor(x + ox), Math.floor(y + oy)))
        if (free(nx, s.y)) s.x = nx
        if (free(s.x, ny)) s.y = ny
        if (mx) s.face = mx
        s.moving = true
      } else if (s.path?.length && !busyRef.current) {
        const p = s.path[0]
        const d = dist(s, p)
        const step = SPEED * dt
        if (d <= step) { s.x = p.x; s.y = p.y; s.path.shift() } else { s.x += (p.x - s.x) / d * step; s.y += (p.y - s.y) / d * step; if (Math.abs(p.x - s.x) > 0.01) s.face = Math.sign(p.x - s.x) }
        s.moving = true
        if (!s.path.length) { s.path = null; if (s.target) { const t = s.target; s.target = null; interactRef.current(t) } }
      } else s.moving = false

      // --- draw ---
      g.imageSmoothingEnabled = false
      const C = COLORS.day
      const around = (tx, ty) => (dx, dy) => tileAt(tx + dx, ty + dy)
      for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) drawTile(g, MAP[ty][tx], tx, ty, tx * T, ty * T, now, C, around(tx, ty))
      // Soil and crops.
      PLOTS.forEach(([px, py], i) => {
        const p = f.plots[i]
        g.fillStyle = p && p.wet ? C.soilWet : C.soil
        g.fillRect(px * T + 1, py * T + 1, T - 2, T - 2)
        g.fillStyle = 'rgba(0,0,0,.12)'
        for (let k = 3; k < T; k += 4) g.fillRect(px * T + 2, py * T + k, T - 4, 1)
        if (p) drawCrop(g, p, p.crop === 'word' ? f.wordCrop : f.crops[p.crop], px * T, py * T, now)
      })
      for (const fo of f.forage) drawForage(g, fo.kind, fo.x * T, fo.y * T, now)
      drawBuildings(g, T, now, C, darkness(hourNow()))
      // Things that stand up, back to front.
      const things = []
      for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) { const ch = MAP[ty][tx]; if ('TFRA'.includes(ch)) things.push({ y: ty + 0.9, draw: () => drawProp(g, ch, tx, ty, tx * T, ty * T, now, C, around(tx, ty)) }) }
      for (const god of f.gods) {
        const [gx, gy] = god.spot
        const bob = Math.sin(now / 500 + gx) > 0.3 ? 1 : 0
        things.push({
          y: gy + 0.95,
          draw: () => {
            g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(gx * T + 8, gy * T + 15, 6, 2, 0, 0, Math.PI * 2); g.fill()
            g.drawImage(spriteCanvas(god.id, 1), gx * T, gy * T - 9 + bob)
            // A speech bubble: they've something to say today.
            if (!god.talkedToday) {
              const by = gy * T - 20 + Math.round(Math.sin(now / 400 + gx) * 1)
              g.fillStyle = '#fff'; g.fillRect(gx * T + 4, by, 9, 7); g.fillRect(gx * T + 6, by + 7, 2, 2)
              g.fillStyle = god.birthdayToday ? '#e85a8a' : '#5a5a7a'
              if (god.birthdayToday) { g.fillRect(gx * T + 6, by + 2, 5, 3); g.fillStyle = '#f0c040'; g.fillRect(gx * T + 8, by + 1, 1, 1) } else for (let k = 0; k < 3; k++) g.fillRect(gx * T + 6 + k * 2, by + 3, 1, 1)
            }
          }
        })
      }
      // The farmer, with a little walk.
      const step = s.moving ? Math.floor(now / 140) % 2 : 0
      things.push({
        y: s.y + 0.4,
        draw: () => {
          g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(s.x * T, s.y * T + 5, 6, 2, 0, 0, Math.PI * 2); g.fill()
          g.drawImage(spriteCanvas('farmer', 1), Math.round(s.x * T - 8), Math.round(s.y * T - 18 - step))
        }
      })
      things.sort((a, b) => a.y - b.y).forEach((x) => x.draw())

      // The line and bobber while fishing.
      const fi = fishRef.current
      if (fi && fi.at) {
        const bx = fi.at.x * T; const by = fi.at.y * T + (fi.phase === 'bite' ? Math.sin(now / 50) * 2 : Math.sin(now / 400))
        g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(s.x * T + 6, s.y * T - 16); g.quadraticCurveTo((s.x * T + bx) / 2, Math.min(s.y * T, by) - 10, bx, by); g.stroke()
        g.fillStyle = '#e83a3a'; g.fillRect(bx - 2, by - 2, 4, 2); g.fillStyle = '#fff'; g.fillRect(bx - 2, by, 4, 2)
        if (fi.phase === 'bite') { g.fillStyle = '#fff'; g.font = 'bold 12px monospace'; g.textAlign = 'center'; g.fillText('!', s.x * T, s.y * T - 24) }
      }

      // Weather and the time of day.
      const dark = darkness(hourNow())
      if (f.rainy) {
        g.fillStyle = 'rgba(40,60,90,.18)'; g.fillRect(0, 0, W, H)
        g.strokeStyle = 'rgba(200,220,255,.45)'; g.lineWidth = 1
        g.beginPath()
        for (let i = 0; i < 90; i++) { const rx = (i * 53 + now / 3) % W; const ry = (i * 97 + now / 1.6) % H; g.moveTo(rx, ry); g.lineTo(rx - 2, ry + 6) }
        g.stroke()
      }
      const h = hourNow()
      if (h >= 17 && h < 20) { g.fillStyle = `rgba(255,140,60,${0.12 * Math.min(1, (h - 17))})`; g.fillRect(0, 0, W, H) }
      if (dark > 0) {
        g.fillStyle = `rgba(16,20,56,${dark})`; g.fillRect(0, 0, W, H)
        // Lamplight around the house and the farmer, and fireflies.
        g.globalCompositeOperation = 'lighter'
        const glow = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,210,140,${a})`); gr.addColorStop(1, 'rgba(255,210,140,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2) }
        glow(4.5 * T, 4.6 * T, 40, 0.35 * dark)
        glow(s.x * T, s.y * T - 6, 28, 0.25 * dark)
        for (const fl of flies) {
          const fx = (fl.x + Math.sin(now / 1700 + fl.p) * 1.2) * T
          const fy = (fl.y + Math.cos(now / 1300 + fl.p * 2) * 0.8) * T
          const a = (Math.sin(now / 300 + fl.p * 3) + 1) / 2
          g.fillStyle = `rgba(220,255,140,${a * dark * 1.4})`; g.fillRect(fx, fy, 1, 1)
          glow(fx, fy, 5, a * dark * 0.5)
        }
        g.globalCompositeOperation = 'source-over'
      }
      // What's under the pointer.
      if (s.hover && !busyRef.current) {
        const [hx, hy] = s.hover
        const t = targetAt(hx, hy)
        if (t && t.kind !== 'walk') { g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1; g.strokeRect(hx * T + 0.5, hy * T + 0.5, T - 1, T - 1) }
        if (t?.kind === 'god') {
          const god = f.gods.find((x) => x.id === t.id)
          const label = `${god.name}${god.birthdayToday ? ' 🎂' : ''}`
          g.font = '7px sans-serif'; g.textAlign = 'center'
          const w = g.measureText(label).width + 6
          g.fillStyle = 'rgba(20,20,30,.75)'; g.fillRect(god.spot[0] * T + 8 - w / 2, god.spot[1] * T - 30, w, 10)
          g.fillStyle = '#fff'; g.fillText(label, god.spot[0] * T + 8, god.spot[1] * T - 22)
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [targetAt])

  const tileFrom = (e) => {
    const r = canvas.current.getBoundingClientRect()
    return [Math.floor(((e.clientX - r.left) / r.width) * MAP_W), Math.floor(((e.clientY - r.top) / r.height) * MAP_H)]
  }
  return (
    <canvas
      ref={canvas}
      className='farm-canvas'
      width={W}
      height={H}
      onMouseMove={(e) => { st.current.hover = tileFrom(e) }}
      onMouseLeave={() => { st.current.hover = null }}
      onClick={(e) => { if (busyRef.current) return; const [tx, ty] = tileFrom(e); goTo(targetAt(tx, ty)) }}
      aria-label='The Word Farm. Walk with the arrow keys or WASD, press E or space to use what’s next to you, or click where to go.'
    />
  )
}

// --- the gods ---------------------------------------------------------------------------
function Hearts ({ g }) {
  return (
    <span className='farm-hearts' title={`${g.hearts} of ${g.maxHearts} hearts`}>
      {Array.from({ length: g.maxHearts }, (_, i) => <i key={i} className={i < g.hearts ? 'on' : i === g.hearts && g.progress > 0 ? 'part' : ''} style={i === g.hearts ? { '--p': g.progress } : null}>♥</i>)}
    </span>
  )
}
const Portrait = ({ id, size = 6 }) => <img className='farm-portrait' src={spriteDataUrl(id, size)} alt='' />
const monthDay = ([m, d]) => new Date(2026, m - 1, d).toLocaleDateString([], { month: 'long', day: 'numeric' })

function GodMenu ({ farm, id, onClose, onTalk, onGift }) {
  const g = farm.gods.find((x) => x.id === id)
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return (
    <div className='farm-box farm-menu'>
      <Portrait id={id} />
      <div className='farm-menu-body'>
        <b className='farm-name'>{g.name}</b> <small>{g.title}</small>
        <Hearts g={g} />
        <small className='farm-status'>
          {g.married ? 'Your spouse 💍' : g.dating ? 'Dating 💐' : null}
          {g.birthdayToday ? ' 🎂 It’s their birthday!' : ''}
          {' '}{g.talkedToday ? 'You’ve chatted today.' : 'Hasn’t heard from you today.'} {g.giftsLeft} gift{g.giftsLeft === 1 ? '' : 's'} left this week.
        </small>
        <div className='farm-menu-btns'>
          <button className='btn' onClick={onTalk}>💬 Chat</button>
          <button className='btn' onClick={onGift}>🎁 Give a gift</button>
          <button className='btn ghost' onClick={onClose}>Leave</button>
        </div>
      </div>
    </div>
  )
}

function GiftPicker ({ farm, id, onClose, onGive }) {
  const g = farm.gods.find((x) => x.id === id)
  const items = farm.bag.filter((x) => x.kind !== 'seed' && x.kind !== 'wordseed')
  const known = (it) => g.known[it.kind === 'word' ? null : it.id]
  const mark = { love: '❤️', like: '🙂', neutral: '😐', dislike: '🙁', hate: '😖' }
  return (
    <div className='farm-box farm-picker'>
      <div className='farm-picker-head'><b>A gift for {g.name}</b><button className='btn small ghost' onClick={onClose}>Never mind</button></div>
      {g.wordHint && <small className='farm-note'>You’ve noticed {g.name} {g.wordHint}.</small>}
      {items.length
        ? <div className='farm-items'>{items.map((it) => <button key={it.id} className='farm-item' onClick={() => onGive(it.id)} title={it.blurb}><ItemIcon it={it} farm={farm} /><span>{it.name}</span><i>{it.n}</i>{known(it) && <em title='How they felt last time'>{mark[known(it)]}</em>}</button>)}</div>
        : <p className='lede'>Your bag has nothing to give yet. Pick a crop, catch a fish, or find something on the ground.</p>}
    </div>
  )
}

function Dialog ({ d, onClose }) {
  const [i, setI] = useState(0)
  const [shown, setShown] = useState(0)
  const line = d.lines[i] || ''
  useEffect(() => { setShown(0); const t = setInterval(() => setShown((n) => { if (n >= line.length) { clearInterval(t); return n } return n + 1 }), 22); return () => clearInterval(t) }, [line])
  const next = useCallback(() => { if (shown < line.length) setShown(line.length); else if (i + 1 < d.lines.length) setI(i + 1); else onClose() }, [shown, line, i, d, onClose])
  useEffect(() => { const k = (e) => { if (e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 'e') { e.preventDefault(); next() } if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [next, onClose])
  const G = GODS[d.god]
  // Scene lines (a heart event) are narrated; quotes are spoken.
  return (
    <div className='farm-box farm-dialog' onClick={next} role='button' tabIndex={0}>
      <Portrait id={d.god} />
      <div className='farm-dialog-body'>
        <b className='farm-name'>{G.name}{d.event ? <small> · a {d.event}-heart moment</small> : null}</b>
        <p>{line.slice(0, shown)}</p>
        <small className='farm-note'>{i + 1 < d.lines.length || shown < line.length ? 'Click or press space ▸' : d.note || 'Click to close'}</small>
      </div>
    </div>
  )
}

function GodsPanel ({ farm }) {
  return (
    <div className='farm-gods'>
      {farm.gods.map((g) => {
        const loved = Object.entries(g.known).filter(([k, v]) => !k.startsWith('word:') && (v === 'love' || v === 'like')).map(([k, v]) => `${itemInfo(k)?.name || k}${v === 'love' ? ' ❤️' : ''}`)
        return (
          <div key={g.id} className={`farm-god ${g.met ? '' : 'unmet'}`}>
            <Portrait id={g.id} size={4} />
            <div>
              <b>{g.name}</b> <small>{g.title}</small>
              <Hearts g={g} />
              <small className='farm-note'>
                Birthday {monthDay(g.birthday)}{g.birthdayToday ? ' (today! 🎂)' : ''} · {g.talkedToday ? 'chatted today' : 'not chatted today'} · {g.giftsLeft} gift{g.giftsLeft === 1 ? '' : 's'} left this week
                {g.married ? ' · your spouse 💍' : g.dating ? ' · dating 💐' : ''}
              </small>
              {(loved.length > 0 || g.wordHint) && <small className='farm-note'>Likes you’ve found: {[...loved, g.wordHint ? `words (${g.wordHint.replace(/^loves |^likes /, '')})` : null].filter(Boolean).join(', ')}</small>}
              {!g.met && <small className='farm-note'>You haven’t met yet. They’re out on the farm somewhere.</small>}
            </div>
          </div>
        )
      })}
      <p className='farm-note'>Chat once a day and give up to two gifts a week (and one more on a birthday, worth five times as much). At 8 hearts, a bouquet from the seed stall starts dating; at 10 hearts, a promise quill asks them to marry you.</p>
    </div>
  )
}

function ItemIcon ({ it, farm }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')
    g.clearRect(0, 0, 16, 16)
    g.imageSmoothingEnabled = false
    if (it.kind === 'fish') drawFish(g, it.color, 2, 5, 1, it.legendary)
    else if (it.kind === 'forage') drawForage(g, it.id, 0, 1, 0)
    else if (it.kind === 'crop' || it.kind === 'word') drawCrop(g, { ready: true, progress: 1, word: it.word }, it.kind === 'word' ? farm.wordCrop : farm.crops[it.id], 0, 2, 0)
    else { g.fillStyle = it.id === 'bouquet' ? '#e86a9a' : '#f0f0f0'; g.fillRect(5, 3, 6, 10); if (it.id === 'quill') { g.fillStyle = '#3a6ad8'; g.fillRect(7, 3, 2, 10) } }
  }, [it, farm])
  return <canvas ref={ref} width={16} height={16} className='farm-icon' aria-hidden='true' />
}

function BagPanel ({ farm }) {
  const groups = [['Harvest', ['crop', 'word']], ['Fish', ['fish']], ['Found', ['forage']], ['Seeds', ['seed', 'wordseed']], ['Keepsakes', ['special']]]
  return (
    <div className='farm-bag'>
      {groups.map(([label, kinds]) => {
        const items = farm.bag.filter((x) => kinds.includes(x.kind))
        if (!items.length) return null
        return (
          <section key={label}>
            <h4>{label}</h4>
            <div className='farm-items'>{items.map((it) => <div key={it.id} className='farm-item' title={it.blurb}><ItemIcon it={it} farm={farm} /><span>{it.name}</span><i>{it.n}</i>{it.sell > 0 && <small>{formatCoins(it.sell)}</small>}</div>)}</div>
          </section>
        )
      })}
      {!farm.bag.length && <p className='lede'>Your bag is empty.</p>}
      <p className='farm-note'>Every new word you rate drops a seed of itself here, whatever you rated it. Plant it and the word grows.</p>
    </div>
  )
}

function LogPanel ({ farm }) {
  const caught = Object.entries(farm.stats.fish)
  return (
    <div className='farm-log'>
      <div className='farm-stats'>
        <span><small>Picked</small><b>{farm.stats.harvested}</b></span>
        <span><small>Shipped</small><b>{farm.stats.shipped}</b></span>
        <span><small>Earned</small><b><Coins n={farm.stats.earned} /></b></span>
        <span><small>Gifts given</small><b>{farm.stats.gifts}</b></span>
        <span><small>Kinds of fish</small><b>{caught.length}</b></span>
      </div>
      {farm.news.length > 0 && <ul className='farm-news'>{farm.news.map((n, i) => <li key={i}>{n.text} <small>{new Date(n.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></li>)}</ul>}
      <h4>How it works</h4>
      <ul className='farm-help'>
        <li>Walk with the arrow keys or WASD, or click where you want to go. Press E or space to use whatever’s next to you.</li>
        <li>Crops grow while their soil is damp: watering keeps it damp for eight hours, and rain waters everything. Nothing ever wilts.</li>
        <li>The seed stall sells seeds, bouquets and promise quills. The shipping bin by the house buys what you grow, catch and find.</li>
        <li>Click the pond to fish. When something bites, hold the mouse button (or space) to keep the green bar on the fish until the meter fills.</li>
        <li>The gods move about the farm through the day. A speech bubble means they haven’t heard from you today.</li>
      </ul>
    </div>
  )
}

function Shop ({ farm, act, onClose, toast }) {
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const buy = async (it, n) => { const out = await act('buy', it.id, n); if (out) toast({ emoji: '🛒', title: `${n} × ${it.name}`, text: `${formatCoins(it.price * n)} coins.` }) }
  return (
    <div className='farm-box farm-shop'>
      <div className='farm-picker-head'><b>🌱 The seed stall</b><button className='btn small ghost' onClick={onClose}>Close</button></div>
      <div className='farm-shop-list'>
        {farm.shop.map((it) => {
          const crop = it.id.startsWith('seed:') ? farm.crops[it.id.slice(5)] : null
          return (
            <div key={it.id} className='farm-shop-row'>
              <span className='farm-seed' style={{ '--c': crop?.color || (it.id === 'bouquet' ? '#e86a9a' : '#3a6ad8') }} />
              <span className='farm-shop-name'><b>{it.name}</b><small>{crop ? `${crop.hours} wet hours${crop.regrow ? `, then every ${crop.regrow}` : ''} · sells for ${formatCoins(crop.sell)}` : it.blurb}</small></span>
              <b className='farm-price'><Coins n={it.price} /></b>
              <button className='btn small' disabled={farm.coins < it.price} onClick={() => buy(it, 1)}>Buy</button>
              {crop && <button className='btn small ghost' disabled={farm.coins < it.price * 5} onClick={() => buy(it, 5)}>×5</button>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Bin ({ farm, act, onClose, toast }) {
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const items = farm.bag.filter((x) => x.sell > 0 && !['seed', 'wordseed', 'special'].includes(x.kind))
  const total = items.reduce((a, x) => a + x.sell * x.n, 0)
  return (
    <div className='farm-box farm-shop'>
      <div className='farm-picker-head'><b>📦 Shipping bin</b><button className='btn small ghost' onClick={onClose}>Close</button></div>
      {items.length
        ? (
          <>
            <div className='farm-shop-list'>{items.map((it) => (
              <div key={it.id} className='farm-shop-row'>
                <ItemIcon it={it} farm={farm} />
                <span className='farm-shop-name'><b>{it.name} × {it.n}</b><small>{formatCoins(it.sell)} each</small></span>
                <button className='btn small ghost' onClick={async () => { const out = await act('sell', it.id, 1); if (out) toast({ emoji: '📦', title: `Shipped ${it.name}`, text: `+${formatCoins(out.coins)} coins` }) }}>Ship 1</button>
                <button className='btn small' onClick={async () => { const out = await act('sell', it.id, it.n); if (out) toast({ emoji: '📦', title: `Shipped ${out.n} × ${it.name}`, text: `+${formatCoins(out.coins)} coins` }) }}>All <Coins n={it.sell * it.n} /></button>
              </div>
            ))}
            </div>
            <button className='btn farm-shipall' onClick={async () => { const out = await act('sellAll'); if (out) { toast({ emoji: '📦', title: 'Shipped everything', text: `+${formatCoins(out.coins)} coins` }); onClose() } }}>Ship everything for <Coins n={total} /></button>
            <small className='farm-note'>Keep a few things back if you want gifts for the gods.</small>
          </>
          )
        : <p className='lede'>Nothing to ship. Crops, fish and things you find can go in here.</p>}
    </div>
  )
}

// --- fishing ------------------------------------------------------------------------------
// Keep the green bar over the fish: hold to rise, let go to sink. The meter
// fills while the fish is in the bar and drains when it isn't.
function Fishing ({ f, setF, act, toast }) {
  const ref = useRef(null)
  const done = useRef(false)
  useEffect(() => {
    done.current = false
    let t1, t2
    if (f.phase === 'wait') t1 = setTimeout(() => setF((x) => x && { ...x, phase: 'bite' }), f.bite)
    if (f.phase === 'bite') t2 = setTimeout(() => { if (f.junk) finish(true); else setF((x) => x && { ...x, phase: 'reel' }) }, 650)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [f.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async (ok) => {
    if (done.current) return
    done.current = true
    const out = await act('reel', ok)
    setF(null)
    if (!out) return
    if (out.early) toast({ emoji: '🎣', title: 'Too soon', text: 'Nothing was biting yet.' })
    else if (out.got) toast({ emoji: out.info.junk ? '📄' : '🐟', title: `${out.info.junk ? 'Pulled up' : 'Caught'} ${out.info.name}${out.first ? ' (a first!)' : ''}`, text: out.info.blurb })
    else toast({ emoji: '🌊', title: 'It got away', text: `Something lively. ${out.name}? Next time.` })
  }

  useEffect(() => {
    if (f.phase !== 'reel') return
    const c = ref.current
    const g = c.getContext('2d')
    const diff = f.diff / 100
    const s = { bar: 0.1, vel: 0, fish: 0.3, fishV: 0, target: 0.5, progress: 0.32, hold: false, t: 0 }
    const size = 0.3 - diff * 0.08
    const down = (e) => { if (e.type === 'keydown' && e.key !== ' ' && e.key.toLowerCase() !== 'e') return; e.preventDefault(); s.hold = true }
    const up = (e) => { if (e.type === 'keyup' && e.key !== ' ' && e.key.toLowerCase() !== 'e') return; s.hold = false }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    c.addEventListener('mousedown', down); window.addEventListener('mouseup', up)
    let raf
    let last = performance.now()
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000) * 60
      last = now
      s.t += dt
      // The bar: rises while held, sinks when not, bounces off the ends.
      s.vel += (s.hold ? 0.0016 : -0.0016) * dt
      s.vel = Math.max(-0.03, Math.min(0.03, s.vel))
      s.bar += s.vel * dt
      if (s.bar < 0) { s.bar = 0; s.vel = -s.vel * 0.35 }
      if (s.bar > 1 - size) { s.bar = 1 - size; s.vel = 0 }
      // The fish swims about, more wildly the livelier it is.
      const moves = f.moves
      if (Math.random() < (0.012 + diff * 0.03) * dt) {
        let tgt = Math.random()
        if (moves === 'sinker') tgt *= 0.6
        if (moves === 'floater') tgt = 0.4 + tgt * 0.6
        if (moves === 'dart' && Math.random() < 0.5) tgt = s.fish > 0.5 ? 0.05 : 0.95
        s.target = tgt
      }
      const pull = moves === 'smooth' ? 0.0015 : moves === 'dart' ? 0.004 : 0.0025
      s.fishV += (s.target - s.fish) * pull * (0.5 + diff) * dt
      s.fishV *= Math.pow(0.9, dt)
      s.fish = Math.max(0, Math.min(1, s.fish + s.fishV * dt))
      const inBar = s.fish >= s.bar - 0.02 && s.fish <= s.bar + size + 0.02
      s.progress += (inBar ? 0.0042 : -(0.0022 + diff * 0.0012)) * dt
      // Draw.
      const Hh = c.height
      g.clearRect(0, 0, c.width, Hh)
      g.fillStyle = '#2a3a5a'; g.fillRect(8, 8, 40, Hh - 16)
      g.fillStyle = '#4a7ab8'; g.fillRect(12, 12, 32, Hh - 24)
      const track = Hh - 24
      g.fillStyle = inBar ? '#7ae07a' : '#5ab05a'
      g.fillRect(12, 12 + track * (1 - s.bar - size), 32, track * size)
      drawFish(g, f.legendary ? '#e8c84a' : '#f0a060', 15, 12 + track * (1 - s.fish) - 6, 2, f.legendary)
      g.fillStyle = '#2a3a5a'; g.fillRect(56, 8, 12, Hh - 16)
      g.fillStyle = s.progress > 0.66 ? '#7ae07a' : s.progress > 0.33 ? '#e8c84a' : '#e86a5a'
      const pr = Math.max(0, Math.min(1, s.progress))
      g.fillRect(58, 10 + (Hh - 20) * (1 - pr), 8, (Hh - 20) * pr)
      if (s.progress >= 1) { finish(true); return }
      if (s.progress <= 0) { finish(false); return }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); c.removeEventListener('mousedown', down); window.removeEventListener('mouseup', up) }
  }, [f.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`farm-box farm-fishing fish-${f.phase}`}>
      {f.phase === 'reel'
        ? (
          <>
            <canvas ref={ref} width={76} height={260} className='farm-fishcanvas' />
            <small className='farm-note'>Hold the mouse button<br />(or space) to rise.<br />Keep the fish in the<br />green bar.</small>
          </>
          )
        : <p>{f.phase === 'wait' ? 'Waiting for a bite…' : 'Something’s biting!'}</p>}
      {f.phase === 'wait' && <button className='btn small ghost' onClick={() => finish(false)}>Reel in</button>}
    </div>
  )
}
