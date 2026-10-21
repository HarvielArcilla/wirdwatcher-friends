import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, Coins, useToast } from './ui.jsx'
import { formatCoins } from '../shared/economy.js'
import { GODS, BUGS, FIELD_W, FIELD_H, WHERE, itemInfo, outingPoints } from '../shared/valley.js'
import { spriteDataUrl, drawCrop, drawFish, drawForage, drawBug } from './valleyArt.js'
import { drawValley, fieldGeo, VW, VH, PLACE_ORDER } from './valleyScenes.js'

// Word Valley, through your own eyes: six places along one valley (home,
// the field, the meadow, the woods, the lake, the hill). Moving between
// them pans along the landscape. Each place has something to do, and the
// word gods are out and about: talk to them where you find them, give them
// gifts, and bring one along to grow closer.

const PLACES = {
  home: { name: 'Home', emoji: '🏡' },
  field: { name: 'The field', emoji: '🌱' },
  meadow: { name: 'The meadow', emoji: '🦋' },
  woods: { name: 'The woods', emoji: '🍄' },
  lake: { name: 'The lake', emoji: '🎣' },
  hill: { name: 'The hill', emoji: '✨' }
}
const PAN_MS = 900
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const hourNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 }
const monthDay = ([m, d]) => new Date(2026, m - 1, d).toLocaleDateString([], { month: 'long', day: 'numeric' })
const untilText = (t) => { const m = Math.max(0, Math.round((t - Date.now()) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m` }
const pick = (list) => list[Math.floor(Math.random() * list.length)]

export default function Valley () {
  const toast = useToast()
  const [v, setV] = useState(null)
  const [place, setPlace] = useState(() => { try { const p = localStorage.getItem('valley-place'); return PLACES[p] ? p : 'home' } catch { return 'home' } })
  const [god, setGod] = useState(null) // the god you're talking to
  const [drawer, setDrawer] = useState(null) // 'bag' | 'stall' | 'journal'
  const [dialog, setDialog] = useState(null)
  const [companion, setCompanion] = useState(null)
  const [cheer, setCheer] = useState(null)
  const [fishing, setFishing] = useState(null)
  const [net, setNet] = useState(null)
  const [picked, setPicked] = useState([])
  const [tool, setTool] = useState('hoe')
  const [hover, setHover] = useState(null)
  const farmActs = useRef(0)
  const found = useRef(0)

  const load = useCallback(() => api('valley').then(setV).catch(() => {}), [])
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t) }, [load])
  useEffect(() => { try { localStorage.setItem('valley-place', place) } catch {} }, [place])

  const act = useCallback(async (action, ...args) => {
    try {
      const res = await api('valleyAction', action, ...args)
      setV(res.valley)
      return res.out
    } catch (err) { toast({ error: true, title: 'Not now', text: err.message }); return undefined }
  }, [toast])

  // The one who came along says something about how it's going.
  const react = useCallback((good) => {
    if (!companion) return
    setCheer({ text: pick(GODS[companion].cheer[good ? 'yay' : 'aw']), at: Date.now() })
  }, [companion])
  useEffect(() => { if (!cheer) return; const t = setTimeout(() => setCheer(null), 2800); return () => clearTimeout(t) }, [cheer])

  // The end of an outing: how well it went, 0 to 1.
  const wrapUp = useCallback(async (activity, quality) => {
    if (!companion) return
    const id = companion
    setCompanion(null)
    farmActs.current = 0
    found.current = 0
    const out = await act('outing', id, activity, quality)
    if (out) setDialog({ god: id, lines: [out.line], note: `+${out.points} friendship${out.fav ? ' · one of their favourite things to do' : ''}` })
  }, [act, companion])

  if (!v) return <div className='vl-wait'>Heading out to the valley…</div>
  const go = (p) => { if (fishing || net) return; setGod(null); setDrawer(null); setPicked([]); setPlace(p) }

  // Something in the scene was clicked.
  const onHit = async (h) => {
    if (h.kind === 'god') { setDrawer(null); setGod(h.id); return }
    if (h.kind === 'stall') { setDrawer('stall'); return }
    if (h.kind === 'bin') { setDrawer('bag'); return }
    if (h.kind === 'door') { setDrawer('journal'); return }
    if (h.kind === 'field') {
      const i = h.cell
      if (i === null || i === undefined) return
      const c = v.field[i]
      let out
      if (c.ready) {
        out = await act('harvest', i)
        if (out) { toast({ emoji: '🧺', title: `Picked ${out.info.name}`, text: `Worth ${formatCoins(out.info.sell)}.` }); react(true); if (companion) setTimeout(() => wrapUp('farming', 1), 1600) }
      } else if (tool === 'hoe') { out = await act('till', i); if (out?.already) out = null } else if (tool === 'can') out = await act('water', i)
      else if (tool === 'hand') { if (c.crop) toast({ emoji: '🌿', title: c.crop === 'word' ? `“${c.word}” is growing` : `${v.crops[c.crop].name} is growing`, text: `About ${c.hoursLeft < 1 ? 'less than an hour' : `${Math.ceil(c.hoursLeft)} wet hours`} to go.${c.wet ? ' The soil’s damp.' : ' It could use some water.'}` }) } else out = await act('plant', i, tool)
      if (out) farmActs.current++
      return
    }
    if (h.kind === 'bug') {
      if (!net || net.caught.includes(h.id)) return
      setNet((n) => n && { ...n, caught: [...n.caught, h.id] })
      const out = await act('netCatch', h.id)
      if (out) { toast({ emoji: '🦋', title: `Caught a ${out.info.name}${out.first ? ' (a first!)' : ''}`, text: out.info.blurb }); if (Math.random() < 0.5) react(true) }
      return
    }
    if (h.kind === 'miss') { if (place === 'meadow' && net && Math.random() < 0.25) react(false); return }
    if (h.kind === 'forage') {
      const out = await act('forage', h.id)
      if (!out) return
      found.current++
      toast({ emoji: '✨', title: `Found ${out.info.name}`, text: out.info.blurb })
      react(true)
      if (out.left === 0 && companion) setTimeout(() => wrapUp('foraging', 1), 1600)
      return
    }
    if (h.kind === 'water') { if (!fishing) { const out = await act('cast'); if (out) setFishing({ ...out, phase: 'wait' }) } return }
    if (h.kind === 'star') {
      if (v.stars.done || picked.includes(h.i)) return
      const next = [...picked, h.i]
      setPicked(next)
      if (next.length === v.stars.stars.length) {
        const w = next.map((k) => v.stars.stars[k].letter).join('')
        const out = await act('stars', w)
        if (out) { toast({ emoji: '✨', title: out.word, text: 'The constellation lights up. A pinch of stardust drifts into your bag.' }); react(true); if (companion) setTimeout(() => wrapUp('stars', 1), 1600) } else { react(false); setTimeout(() => setPicked([]), 500) }
      }
    }
  }
  const reeled = (out) => {
    setFishing(null)
    if (!out) return
    if (out.early) toast({ emoji: '🎣', title: 'Too soon', text: 'Nothing was biting yet.' })
    else if (out.got) toast({ emoji: out.info.junk ? '📄' : '🐟', title: `${out.info.junk ? 'Pulled up' : 'Caught'} ${out.info.name}${out.first ? ' (a first!)' : ''}`, text: out.info.blurb })
    else toast({ emoji: '🌊', title: 'It got away', text: `Something lively. ${out.name}? Next time.` })
    if (!out.early) { const good = out.got && !out.info?.junk; react(good); if (companion) setTimeout(() => wrapUp('fishing', good ? 1 : 0.5), 1600) }
  }

  return (
    <div className='valley'>
      <div className='vl-top'>
        <b className='vl-title'>Word Valley</b>
        <span className='vl-when'>{new Date(v.at).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} · {{ morning: '🌅 Morning', day: '☀️ Afternoon', evening: '🌇 Evening', night: '🌙 Night' }[v.part]}{v.rainy ? ' · 🌧️ Rain' : ''}</span>
        <span className='grow' />
        {companion && <span className='vl-with'><img src={spriteDataUrl(companion, 2)} alt='' /> Out with <b>{GODS[companion].name}</b> <button className='linkish' onClick={() => setCompanion(null)}>say goodbye</button></span>}
        <span className='vl-coins'><Coins n={v.coins} /></span>
      </div>
      <div className='vl-stage'>
        <div className='vl-frame'>
          <View v={v} place={place} companion={companion} fishing={fishing} net={net} picked={picked} hover={hover} setHover={setHover} onHit={onHit} />
          {cheer && companion && <div className='vl-cheer'><b>{GODS[companion].name}</b>{cheer.text}</div>}
          {fishing && <Reel f={fishing} setF={setFishing} act={act} onDone={reeled} />}
          {god && <GodBox v={v} id={god} act={act} companion={companion} onClose={() => setGod(null)} setDialog={setDialog} onCome={() => { setCompanion(god); setGod(null) }} />}
          {drawer && (
            <div className='vl-drawer'>
              <div className='vl-drawer-head'>
                <div className='seg'>{[['bag', '🎒 Bag'], ['stall', '🌱 Seed stall'], ['journal', '📜 Journal']].map(([id, label]) => <button key={id} className={drawer === id ? 'on' : ''} onClick={() => setDrawer(id)}>{label}</button>)}</div>
                <button className='btn small ghost' onClick={() => setDrawer(null)}>Close</button>
              </div>
              <div className='vl-drawer-body'>
                {drawer === 'bag' && <Bag v={v} act={act} toast={toast} />}
                {drawer === 'stall' && <Stall v={v} act={act} toast={toast} />}
                {drawer === 'journal' && <Journal v={v} meet={(id) => { const where = WHERE[v.part][id][0]; setDrawer(null); setPlace(where); setTimeout(() => setGod(id), PAN_MS) }} />}
              </div>
            </div>
          )}
          {dialog && <Dialog d={dialog} onClose={() => setDialog(null)} />}
        </div>
      </div>
      <Controls v={v} place={place} act={act} toast={toast} tool={tool} setTool={setTool} fishing={fishing} setFishing={setFishing} net={net} setNet={setNet} picked={picked} setPicked={setPicked} companion={companion} wrapUp={wrapUp} react={react} farmActs={farmActs} found={found} setDrawer={setDrawer} hover={hover} />
      <nav className='vl-places' aria-label='Places in the valley'>
        {PLACE_ORDER.map((p, i) => (
          <button key={p} className={place === p ? 'on' : ''} onClick={() => go(p)} disabled={Boolean(fishing || net) && place !== p} title={`${PLACES[p].name} (${i + 1})`}>
            <span>{PLACES[p].emoji}</span><small>{PLACES[p].name.replace(/^The (.)/, (_, c) => c.toUpperCase())}</small>
            <Badge v={v} p={p} />
          </button>
        ))}
        <span className='vl-sep' />
        <button className={drawer === 'bag' ? 'on' : ''} onClick={() => setDrawer(drawer === 'bag' ? null : 'bag')}><span>🎒</span><small>Bag</small></button>
        <button className={drawer === 'journal' ? 'on' : ''} onClick={() => setDrawer(drawer === 'journal' ? null : 'journal')}><span>📜</span><small>Journal</small></button>
      </nav>
      <Keys go={go} place={place} close={() => { setGod(null); setDrawer(null) }} />
    </div>
  )
}

function Badge ({ v, p }) {
  const n = p === 'field' ? v.field.filter((c) => c.ready).length : p === 'woods' ? v.forest.items.length : p === 'hill' ? (v.night && !v.stars.done ? '★' : 0) : 0
  const gods = v.gods.filter((g) => WHERE[v.part][g.id][0] === p && !g.talkedToday).length
  return <>{n ? <i className='vl-badge'>{n}</i> : null}{gods ? <i className='vl-badge talk' title={`${gods} to say hello to`}>💬</i> : null}</>
}

function Keys ({ go, place, close }) {
  const ref = useRef({ go, place, close })
  ref.current = { go, place, close }
  useEffect(() => {
    const k = (e) => {
      if (e.target.closest('input, textarea')) return
      const { go, place, close } = ref.current
      const i = PLACE_ORDER.indexOf(place)
      if (e.key === 'ArrowRight' && i < PLACE_ORDER.length - 1) go(PLACE_ORDER[i + 1])
      else if (e.key === 'ArrowLeft' && i > 0) go(PLACE_ORDER[i - 1])
      else if (/^[1-6]$/.test(e.key)) go(PLACE_ORDER[Number(e.key) - 1])
      else if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  return null
}

// --- the view ------------------------------------------------------------------------------
function View ({ v, place, companion, fishing, net, picked, hover, setHover, onHit }) {
  const canvas = useRef(null)
  const cam = useRef({ x: PLACE_ORDER.indexOf(place) * VW, from: null, to: null, start: 0 })
  const state = useRef(null)
  const hits = useRef([])
  const onHitRef = useRef(onHit)
  onHitRef.current = onHit
  const gods = useMemo(() => v.gods.filter((g) => g.id !== companion).map((g) => {
    const home = g.married && (v.part === 'night' || v.part === 'morning')
    const [p, at, near] = WHERE[v.part][g.id]
    return { id: g.id, place: home ? 'home' : p, at: home ? 0.86 : at, near, bubble: !g.talkedToday ? (g.birthdayToday ? 'bday' : 'talk') : null }
  }), [v, companion])
  state.current = { field: v.field, fieldW: FIELD_W, fieldH: FIELD_H, crops: v.crops, wordCrop: v.wordCrop, forest: v.forest.items, rainy: v.rainy, gods, companion, fishing, net, bugs: BUGS, stars: v.stars.stars, starsDone: v.stars.done, picked, hover }
  // Pan to the place.
  useEffect(() => {
    const to = PLACE_ORDER.indexOf(place) * VW
    const c = cam.current
    if (c.x !== to) { c.from = c.x; c.to = to; c.start = performance.now() }
  }, [place])
  useEffect(() => {
    const g = canvas.current.getContext('2d')
    let raf
    const frame = (now) => {
      const c = cam.current
      if (c.to !== null) { const t = Math.min(1, (now - c.start) / PAN_MS); c.x = c.from + (c.to - c.from) * ease(t); if (t >= 1) { c.x = c.to; c.to = null } }
      hits.current = drawValley(g, c.x, now, { ...state.current, hour: hourNow() })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
  const at = (e) => { const r = canvas.current.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * VW, ((e.clientY - r.top) / r.height) * VH] }
  const find = (sx, sy) => {
    if (cam.current.to !== null) return null
    const inside = (h) => sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h
    const list = hits.current
    for (let i = list.length - 1; i >= 0; i--) if (list[i].kind === 'god' && inside(list[i])) return list[i]
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i]
      if (h.kind === 'god' || h.place !== place || !inside(h)) continue
      if (h.kind === 'field') return { ...h, cell: fieldGeo(PLACE_ORDER.indexOf(place) * VW - cam.current.x).cellAt(sx, sy) }
      return h
    }
    return { kind: 'miss' }
  }
  return (
    <canvas
      ref={canvas}
      className={`vl-view at-${place}`}
      width={VW}
      height={VH}
      onClick={(e) => { const h = find(...at(e)); if (h) onHitRef.current(h) }}
      onMouseMove={(e) => { if (place !== 'field') return; const [sx, sy] = at(e); setHover(fieldGeo(PLACE_ORDER.indexOf(place) * VW - cam.current.x).cellAt(sx, sy)) }}
      onMouseLeave={() => setHover(null)}
      aria-label={`Word Valley: ${PLACES[place].name}`}
    />
  )
}

// --- what you can do here ----------------------------------------------------------------
function Controls ({ v, place, act, toast, tool, setTool, fishing, setFishing, net, setNet, picked, setPicked, companion, wrapUp, react, farmActs, found, setDrawer, hover }) {
  const seeds = useMemo(() => v.bag.filter((x) => x.kind === 'seed' || x.kind === 'wordseed'), [v.bag])
  useEffect(() => { if (tool.includes(':') && !seeds.some((s) => s.id === tool)) setTool('hand') }, [seeds, tool, setTool])
  const [, tick] = useState(0)
  const netRef = useRef(net)
  netRef.current = net
  // The butterfly round runs out.
  useEffect(() => {
    if (!net) return
    const t = setInterval(() => tick((n) => n + 1), 500)
    const end = setTimeout(() => {
      const n = netRef.current?.caught.length || 0
      setNet(null)
      toast({ emoji: '🦋', title: n ? `You caught ${n}` : 'They all got away', text: n ? 'They’re in your bag.' : 'Lead them a little: aim where they’re going.' })
      if (companion) { react(n > 0); setTimeout(() => wrapUp('butterflies', Math.min(1, n / 4)), 1600) }
    }, net.ms)
    return () => { clearInterval(t); clearTimeout(end) }
  }, [net?.at]) // eslint-disable-line react-hooks/exhaustive-deps

  if (place === 'home') {
    const waiting = v.gods.filter((g) => !g.talkedToday)
    const bdays = v.gods.filter((g) => g.birthdayToday)
    return (
      <div className='vl-controls'>
        <div className='vl-btnrow'>
          <button className='btn small' onClick={() => setDrawer('bag')}>📦 Shipping bin</button>
          <button className='btn small' onClick={() => setDrawer('stall')}>🌱 Seed stall</button>
          <button className='btn small ghost' onClick={() => setDrawer('journal')}>📜 Journal</button>
        </div>
        <p className='vl-note'>
          {bdays.map((g) => <span key={g.id}>🎂 It’s {g.name}’s birthday. </span>)}
          {waiting.length ? `${waiting.length} god${waiting.length === 1 ? '' : 's'} still to say hello to today: look for the speech bubbles around the valley.` : 'You’ve said hello to everyone today.'}
          {v.news[0] ? ` ${v.news[0].text}` : ''}
        </p>
      </div>
    )
  }
  if (place === 'field') {
    const hc = hover !== null && hover !== undefined ? v.field[hover] : null
    const hint = !hc ? 'Pick a tool, then click the field. Ripe crops come up with a click, whatever’s in your hand.' : hc.decor ? `A ${hc.decor}: the hoe clears it.` : hc.crop ? (hc.ready ? 'Ready to pick.' : `${hc.crop === 'word' ? `“${hc.word}”` : v.crops[hc.crop].name}: about ${Math.ceil(hc.hoursLeft)} wet hours to go${hc.wet ? '' : ', and the soil’s dry'}.`) : hc.soil === 'tilled' ? (hc.wet ? 'Tilled and damp: plant a seed.' : 'Tilled: plant a seed, and water it.') : 'Grass: till it with the hoe.'
    return (
      <div className='vl-controls'>
        <div className='vl-tools' role='toolbar' aria-label='Tools and seeds'>
          {[['hoe', '⛏️', 'Hoe'], ['can', '💧', 'Can'], ['hand', '✋', 'Hands']].map(([id, e, name]) => <button key={id} className={`vl-tool ${tool === id ? 'on' : ''}`} onClick={() => setTool(id)}>{e}<small>{name}</small></button>)}
          {seeds.map((s) => <button key={s.id} className={`vl-tool ${tool === s.id ? 'on' : ''}`} onClick={() => setTool(s.id)} title={s.name}><ItemIcon it={s} v={v} /><small>{s.kind === 'wordseed' ? `“${s.word}”` : s.name.replace(/ seeds$/, '')}</small><i>{s.n}</i></button>)}
          {!seeds.length && <button className='btn small ghost' onClick={() => setDrawer('stall')}>Buy seeds</button>}
        </div>
        <p className='vl-note'>{hint} {companion && <button className='linkish' onClick={() => wrapUp('farming', Math.min(1, farmActs.current / 8))}>Finish up with {GODS[companion].name}</button>}</p>
      </div>
    )
  }
  if (place === 'meadow') {
    const left = net ? Math.max(0, Math.ceil((net.ms - (performance.now() - net.began)) / 1000)) : 0
    return (
      <div className='vl-controls'>
        {net
          ? <p className='vl-note'><b>{left}s</b> in the meadow · caught {net.caught.length}. Click a butterfly to catch it.</p>
          : <button className='btn' disabled={v.rainy} onClick={async () => { const out = await act('netStart'); if (out) setNet({ ...out, began: performance.now(), caught: [] }) }}>🦋 Wade into the meadow</button>}
        {!net && <p className='vl-note'>{v.rainy ? 'The butterflies are sheltering from the rain today.' : 'Forty seconds at a time. Bright ones by day; moths and fireflies come out in the evening.'}</p>}
      </div>
    )
  }
  if (place === 'woods') {
    return (
      <div className='vl-controls'>
        <p className='vl-note'>{v.forest.items.length ? `${v.forest.items.length} thing${v.forest.items.length === 1 ? '' : 's'} hidden in the undergrowth. Look closely and click them.` : 'You’ve found everything for now.'} The woods refill in {untilText(v.forest.until)}.
          {companion && found.current > 0 && v.forest.items.length > 0 && <> <button className='linkish' onClick={() => wrapUp('foraging', Math.min(1, found.current / v.forest.total))}>Head home with {GODS[companion].name}</button></>}
        </p>
      </div>
    )
  }
  if (place === 'lake') {
    return (
      <div className='vl-controls'>
        {!fishing && <button className='btn' onClick={async () => { const out = await act('cast'); if (out) setFishing({ ...out, phase: 'wait' }) }}>🎣 Cast a line</button>}
        <p className='vl-note'>{fishing ? 'Watch the bobber…' : 'Click the water or cast a line. When something bites, hold the mouse button (or space) to keep the green bar on the fish until the meter fills.'}</p>
      </div>
    )
  }
  if (place === 'hill') {
    const word = picked.map((i) => v.stars.stars[i].letter).join('')
    return (
      <div className='vl-controls'>
        <p className='vl-note'>
          {!v.night
            ? 'You can see the whole valley from up here. Come back after 9 in the evening: a new constellation rises every night, and it spells a word.'
            : v.stars.done
              ? 'You’ve traced tonight’s constellation. A new one rises tomorrow night.'
              : <>Tonight’s constellation is a word. Click its stars in order to spell it: <b className='vl-spell'>{word || '…'}</b> {picked.length > 0 && <button className='linkish' onClick={() => setPicked([])}>start over</button>}</>}
        </p>
      </div>
    )
  }
  return null
}

// --- the gods ------------------------------------------------------------------------------
function Hearts ({ g }) {
  return <span className='vl-hearts' title={`${g.hearts} of ${g.maxHearts} hearts`}>{Array.from({ length: g.maxHearts }, (_, i) => <i key={i} className={i < g.hearts ? 'on' : ''}>♥</i>)}</span>
}
const Portrait = ({ id, size = 6 }) => <img className='vl-portrait' src={spriteDataUrl(id, size)} alt='' />

function GodBox ({ v, id, act, companion, onClose, setDialog, onCome }) {
  const g = v.gods.find((x) => x.id === id)
  const [gifting, setGifting] = useState(false)
  if (!g) return null
  const giftable = v.bag.filter((x) => x.kind !== 'seed' && x.kind !== 'wordseed')
  const mark = { love: '❤️', like: '🙂', neutral: '😐', dislike: '🙁', hate: '😖' }
  const talk = async () => { onClose(); const out = await act('talk', id); if (out) setDialog({ god: id, lines: out.lines, event: out.event, note: out.gift ? `${g.name} gave you ${out.giftName}.` : out.gained ? `+${out.gained} friendship` : 'You’ve chatted today already.' }) }
  const give = async (item) => { onClose(); const out = await act('gift', id, item); if (out) setDialog({ god: id, lines: [out.line], note: out.married ? `You and ${g.name} are married! 💍` : out.dating ? `You and ${g.name} are dating 💐` : `${out.points >= 0 ? '+' : ''}${out.points} friendship${out.birthday ? ' (birthday!)' : ''}` }) }
  return (
    <div className='vl-box vl-godbox'>
      <Portrait id={id} />
      <div className='vl-godbox-body'>
        <b className='vl-name'>{g.name} <small>{g.title}</small></b>
        <Hearts g={g} />
        <small className='vl-note'>
          {g.married ? 'Your spouse 💍 · ' : g.dating ? 'Dating 💐 · ' : ''}
          {g.birthdayToday ? '🎂 Birthday today! · ' : `Birthday ${monthDay(g.birthday)} · `}
          {g.giftsLeft} gift{g.giftsLeft === 1 ? '' : 's'} left this week
          {g.fav ? ` · loves ${g.fav.map((a) => v.activities[a].name.toLowerCase()).join(' and ')}` : ''}
        </small>
        {gifting
          ? (
            <div className='vl-items'>
              {giftable.length ? giftable.map((it) => <button key={it.id} className='vl-item' onClick={() => give(it.id)} title={it.blurb}><ItemIcon it={it} v={v} /><span>{it.name}</span><i>{it.n}</i>{g.known[it.id] && <em>{mark[g.known[it.id]]}</em>}</button>) : <small className='vl-note'>Nothing to give yet. Pick, catch or find something first.</small>}
              <button className='btn small ghost' onClick={() => setGifting(false)}>Back</button>
            </div>
            )
          : (
            <div className='vl-choices'>
              <button className='btn' onClick={talk}>💬 {g.talkedToday ? 'Chat again' : 'Chat'}</button>
              <button className='btn' onClick={() => setGifting(true)}>🎁 Give a gift</button>
              {!g.outingToday && companion !== id && <button className='btn' onClick={onCome}>🧺 Come along with me?</button>}
              {g.outingToday && <small className='vl-note'>You’ve been out together today.</small>}
              <button className='btn ghost' onClick={onClose}>Goodbye</button>
            </div>
            )}
      </div>
    </div>
  )
}

function Dialog ({ d, onClose }) {
  const [i, setI] = useState(0)
  const [shown, setShown] = useState(0)
  const line = d.lines[i] || ''
  useEffect(() => { setShown(0); const t = setInterval(() => setShown((n) => { if (n >= line.length) { clearInterval(t); return n } return n + 1 }), 20); return () => clearInterval(t) }, [line])
  const next = useCallback(() => { if (shown < line.length) setShown(line.length); else if (i + 1 < d.lines.length) setI(i + 1); else onClose() }, [shown, line, i, d, onClose])
  useEffect(() => { const k = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); next() } if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [next, onClose])
  return (
    <div className='vl-box vl-dialog' onClick={next} role='button' tabIndex={0}>
      <Portrait id={d.god} />
      <div>
        <b className='vl-name'>{GODS[d.god].name}{d.event ? <small> · a {d.event}-heart moment</small> : null}</b>
        <p>{line.slice(0, shown)}</p>
        <small className='vl-note'>{i + 1 < d.lines.length || shown < line.length ? 'Click or press space ▸' : d.note || 'Click to close'}</small>
      </div>
    </div>
  )
}

function ItemIcon ({ it, v }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !it) return
    const g = c.getContext('2d')
    g.clearRect(0, 0, 16, 16)
    g.imageSmoothingEnabled = false
    if (it.kind === 'fish') drawFish(g, it.color, 2, 5, 1, it.legendary)
    else if (it.kind === 'forage') drawForage(g, it.id, 0, 1, 0)
    else if (it.kind === 'bug') drawBug(g, { kind: it.id, color: it.color, wing2: it.wing2 }, 8, 9, 0)
    else if (it.kind === 'crop' || it.kind === 'word') drawCrop(g, { ready: true, progress: 1, word: it.word }, it.kind === 'word' ? v.wordCrop : v.crops[it.id], 0, 2, 0)
    else if (it.kind === 'seed' || it.kind === 'wordseed') { const col = it.kind === 'wordseed' ? v.wordCrop.color : v.crops[it.crop]?.color; g.fillStyle = '#c8a070'; g.fillRect(4, 4, 8, 10); g.fillStyle = col || '#888'; g.fillRect(6, 7, 4, 4) } else if (it.id === 'stardust') { g.fillStyle = '#f8e890'; for (const [x, y] of [[8, 3], [4, 8], [11, 9], [7, 12], [9, 7]]) g.fillRect(x, y, 2, 2) } else { g.fillStyle = it.id === 'bouquet' ? '#e86a9a' : '#f0f0f0'; g.fillRect(5, 3, 6, 10); if (it.id === 'quill') { g.fillStyle = '#3a6ad8'; g.fillRect(7, 3, 2, 10) } }
  }, [it, v])
  return <canvas ref={ref} width={16} height={16} className='vl-icon' aria-hidden='true' />
}

// --- fishing ------------------------------------------------------------------------------
// Keep the green bar over the fish: hold to rise, let go to sink.
function Reel ({ f, setF, act, onDone }) {
  const ref = useRef(null)
  const finished = useRef(false)
  const finish = useCallback(async (ok) => { if (finished.current) return; finished.current = true; onDone(await act('reel', ok)) }, [act, onDone])
  useEffect(() => {
    let t1, t2
    if (f.phase === 'wait') t1 = setTimeout(() => setF((x) => x && { ...x, phase: 'bite' }), f.bite)
    if (f.phase === 'bite') t2 = setTimeout(() => { if (f.junk) finish(true); else setF((x) => x && { ...x, phase: 'reel' }) }, 650)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [f.phase]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (f.phase !== 'reel') return
    const c = ref.current
    const g = c.getContext('2d')
    const diff = f.diff / 100
    const s = { bar: 0.1, vel: 0, fish: 0.3, fishV: 0, target: 0.5, progress: 0.32, hold: false }
    const size = 0.3 - diff * 0.08
    const key = (e) => e.key === ' ' || e.key.toLowerCase() === 'e'
    const down = (e) => { if (e.type === 'keydown' && !key(e)) return; e.preventDefault(); s.hold = true }
    const up = (e) => { if (e.type === 'keyup' && !key(e)) return; s.hold = false }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    c.addEventListener('mousedown', down); window.addEventListener('mouseup', up)
    let raf
    let last = performance.now()
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000) * 60
      last = now
      s.vel += (s.hold ? 0.0016 : -0.0016) * dt
      s.vel = Math.max(-0.03, Math.min(0.03, s.vel))
      s.bar += s.vel * dt
      if (s.bar < 0) { s.bar = 0; s.vel = -s.vel * 0.35 }
      if (s.bar > 1 - size) { s.bar = 1 - size; s.vel = 0 }
      if (Math.random() < (0.012 + diff * 0.03) * dt) {
        let tgt = Math.random()
        if (f.moves === 'sinker') tgt *= 0.6
        if (f.moves === 'floater') tgt = 0.4 + tgt * 0.6
        if (f.moves === 'dart' && Math.random() < 0.5) tgt = s.fish > 0.5 ? 0.05 : 0.95
        s.target = tgt
      }
      const pull = f.moves === 'smooth' ? 0.0015 : f.moves === 'dart' ? 0.004 : 0.0025
      s.fishV += (s.target - s.fish) * pull * (0.5 + diff) * dt
      s.fishV *= Math.pow(0.9, dt)
      s.fish = Math.max(0, Math.min(1, s.fish + s.fishV * dt))
      const inBar = s.fish >= s.bar - 0.02 && s.fish <= s.bar + size + 0.02
      s.progress += (inBar ? 0.0042 : -(0.0022 + diff * 0.0012)) * dt
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
  if (f.phase !== 'reel') return f.phase === 'wait' ? <button className='btn small vl-reelin' onClick={() => finish(false)}>Reel in</button> : null
  return (
    <div className='vl-box vl-reel'>
      <canvas ref={ref} width={76} height={260} className='vl-reelcanvas' />
      <small className='vl-note'>Hold to rise.<br />Keep the fish<br />in the green.</small>
    </div>
  )
}

// --- the drawers -------------------------------------------------------------------------
function Bag ({ v, act, toast }) {
  const groups = [['From the field', ['crop', 'word']], ['From the lake', ['fish']], ['From the woods', ['forage']], ['From the meadow', ['bug']], ['Treasures', ['treasure', 'special']], ['Seeds', ['seed', 'wordseed']]]
  const sellable = v.bag.filter((x) => x.sell > 0 && !['seed', 'wordseed', 'special'].includes(x.kind))
  const total = sellable.reduce((a, x) => a + x.sell * x.n, 0)
  const sell = async (it, n) => { const out = await act('sell', it.id, n); if (out) toast({ emoji: '📦', title: `Shipped ${out.n} × ${it.name}`, text: `+${formatCoins(out.coins)} coins` }) }
  return (
    <div className='vl-bag'>
      {groups.map(([label, kinds]) => {
        const items = v.bag.filter((x) => kinds.includes(x.kind))
        if (!items.length) return null
        return (
          <section key={label}>
            <h4>{label}</h4>
            <div className='vl-rows'>
              {items.map((it) => (
                <div key={it.id} className='vl-row' title={it.blurb}>
                  <ItemIcon it={it} v={v} />
                  <span className='vl-row-name'><b>{it.name}</b> <small>× {it.n}</small><small className='vl-blurb'>{it.blurb}</small></span>
                  {it.sell > 0 && !['seed', 'wordseed', 'special'].includes(it.kind)
                    ? <><small className='vl-price'>{formatCoins(it.sell)} each</small><button className='btn small ghost' onClick={() => sell(it, 1)}>Ship 1</button><button className='btn small ghost' onClick={() => sell(it, it.n)}>Ship all</button></>
                    : <><span /><span /><span /></>}
                </div>
              ))}
            </div>
          </section>
        )
      })}
      {!v.bag.length && <p className='vl-note'>Your bag is empty.</p>}
      {sellable.length > 0 && <p className='vl-note'>Everything you could ship comes to <Coins n={total} />. Keep a few things back as gifts for the gods.</p>}
      <p className='vl-note'>Every new word you rate drops a seed of itself here, whatever you rated it. Plant it and the word grows.</p>
    </div>
  )
}

function Stall ({ v, act, toast }) {
  const buy = async (it, n) => { const out = await act('buy', it.id, n); if (out) toast({ emoji: '🛒', title: `${n} × ${it.name}`, text: `${formatCoins(it.price * n)} coins.` }) }
  return (
    <div className='vl-rows'>
      {v.shop.map((it) => {
        const crop = it.id.startsWith('seed:') ? v.crops[it.id.slice(5)] : null
        return (
          <div key={it.id} className='vl-row'>
            <ItemIcon it={itemInfo(it.id)} v={v} />
            <span className='vl-row-name'><b>{it.name}</b><small className='vl-blurb'>{crop ? `${crop.hours} wet hours${crop.regrow ? `, then again every ${crop.regrow}` : ''} · sells for ${formatCoins(crop.sell)}` : it.blurb}</small></span>
            <b className='vl-price'><Coins n={it.price} /></b>
            <button className='btn small' disabled={v.coins < it.price} onClick={() => buy(it, 1)}>Buy</button>
            {crop ? <button className='btn small ghost' disabled={v.coins < it.price * 5} onClick={() => buy(it, 5)}>×5</button> : <span />}
          </div>
        )
      })}
    </div>
  )
}

function Journal ({ v, meet }) {
  const s = v.stats
  const place = (id) => ({ home: 'at home', field: 'in the field', meadow: 'in the meadow', woods: 'in the woods', lake: 'by the lake', hill: 'up on the hill' })[WHERE[v.part][id][0]]
  return (
    <div className='vl-journal'>
      <h4>Friends</h4>
      <div className='vl-friends'>
        {v.gods.map((g) => (
          <button key={g.id} className='vl-friend' onClick={() => meet(g.id)}>
            <img src={spriteDataUrl(g.id, 3)} alt='' />
            <span>
              <b>{g.name}</b> <small>{g.title}</small>
              <Hearts g={g} />
              <small>{g.married ? 'Your spouse 💍 · ' : g.dating ? 'Dating 💐 · ' : ''}{g.talkedToday ? 'chatted today' : 'hasn’t heard from you today'} · {place(g.id)}{g.birthdayToday ? ' · 🎂 birthday!' : ''}</small>
              {g.fav && <small>Loves {g.fav.map((a) => v.activities[a].name.toLowerCase()).join(' and ')} · up to +{outingPoints(g.id, g.fav[0], 1)} on an outing</small>}
            </span>
          </button>
        ))}
      </div>
      <h4>The season so far</h4>
      <div className='vl-stats'>
        {[['Picked', s.harvested], ['Fish', Object.values(s.fish).reduce((a, x) => a + x, 0)], ['Kinds of fish', Object.keys(s.fish).length], ['Butterflies', Object.values(s.bugs).reduce((a, x) => a + x, 0)], ['Found in the woods', s.found], ['Constellations', s.constellations], ['Outings', s.outings], ['Gifts', s.gifts]].map(([k, x]) => <span key={k}><small>{k}</small><b>{x}</b></span>)}
        <span><small>Earned</small><b><Coins n={s.earned} /></b></span>
      </div>
      {v.news.length > 0 && <><h4>Lately</h4><ul className='vl-list'>{v.news.map((n, i) => <li key={i}>{n.text} <small>{new Date(n.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></li>)}</ul></>}
      <h4>How it works</h4>
      <ul className='vl-list'>
        <li>The gods move around the valley through the day. A speech bubble means they haven’t heard from you yet today: click them to chat, give a gift, or ask them along.</li>
        <li>Chat once a day, give two gifts a week (one more on a birthday, worth five times as much), and go on one outing a day with each. Their favourite things to do count for more.</li>
        <li>At 8 hearts, a bouquet from the seed stall starts dating. At 10, a promise quill asks them to marry you.</li>
        <li>Crops grow while the soil is damp: watering lasts eight hours and rain waters everything. Nothing ever wilts. The woods refill every three hours, and a new constellation rises every night after 9.</li>
        <li>Use ← and → (or 1 to 6) to move along the valley.</li>
      </ul>
    </div>
  )
}
