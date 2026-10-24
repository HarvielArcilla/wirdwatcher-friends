import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { api, Coins, useToast, celebrate } from './ui.jsx'
import MAP from './catchword/map.json'
import { REGIONS, REGION, LANG_NAMES } from '../shared/catchword/regions.js'
import { TREES, TRAITS, TRAIT, traitCost, canEvolve, canDevolve, DEVOLVE_COST, totalFx } from '../shared/catchword/traits.js'
import { step, evolve, devolve, pop, popAll, totals, notoriety, regionView, serialize, restore, DIFFICULTIES, cleanWord, validWord, MAX_DAYS } from '../shared/catchword/sim.js'
import { MIN_RATED_CW } from '../shared/catchword/content.js'
import { synth } from './sound.js'

// Catchword: coin a word from two you've rated, pick where someone first
// says it, and evolve it until the whole world has absorbed it, before the
// Purists rule it isn't a word. The menu, picking a start, the game (a map
// drawn in SVG) and the note at the end.

const SPEEDS = [0, 600, 300, 150] // milliseconds a day: paused, 1×, 2×, 3×
const fmtPeople = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)}B` : m >= 1 ? `${m.toFixed(m >= 100 ? 0 : 1)}M` : m * 1e6 >= 1000 ? `${Math.round(m * 1000)}K` : `${Math.round(m * 1e6)}`)
const pct = (x) => `${x >= 0.995 && x < 1 ? '99' : x > 0 && x < 0.01 ? '<1' : Math.round(x * 100)}%`

export default function Catchword ({ settings }) {
  const toast = useToast()
  const [v, setV] = useState(null)
  const [screen, setScreen] = useState('menu') // menu | pick | game | end
  const [coins, setCoins] = useState([])
  const [chosen, setChosen] = useState(null) // { word, from }
  const [custom, setCustom] = useState('')
  const [diff, setDiff] = useState(() => { try { return localStorage.getItem('cw-diff') || 'normal' } catch { return 'normal' } })
  const [game, setGame] = useState(null)
  const [ending, setEnding] = useState(null)
  const load = useCallback(() => api('catchword').then(setV).catch(() => {}), [])
  const reroll = useCallback(() => api('catchwordCoin').then((c) => { setCoins(c); setChosen((x) => (x && !x.from.length ? x : c[0] || null)) }).catch(() => {}), [])
  useEffect(() => { load(); reroll() }, [load, reroll])
  useEffect(() => { try { localStorage.setItem('cw-diff', diff) } catch {} }, [diff])

  const begin = async (start) => {
    try {
      const res = await api('catchwordStart', { word: chosen.word, from: chosen.from, start, difficulty: diff })
      for (const l of res.looks || []) toast({ emoji: '✨', title: `New look: ${l.name}`, text: 'It’s in the Shop, ready to wear.' })
      setGame(res.game)
      setScreen('game')
    } catch (err) { toast({ error: true, title: 'Can’t start', text: err.message }) }
  }
  const resume = async () => {
    const saved = restore(await api('catchwordResume'))
    if (!saved) { load(); return }
    setGame(saved)
    setScreen('game')
  }
  const finish = async (g) => {
    try {
      const reward = await api('catchwordEnd', serialize(g))
      setEnding({ g, reward })
      celebrate(toast, { badges: reward.badges || [] })
    } catch (err) { setEnding({ g, reward: null }); toast({ error: true, title: 'Couldn’t save that game', text: err.message }) }
    setScreen('end')
    load()
    reroll()
  }

  if (!v) return null
  if (screen === 'game' && game) return <Game key={game.id} init={game} settings={settings} onEnd={finish} onQuit={() => { setScreen('menu'); load() }} />
  if (screen === 'end' && ending) return <EndNote ending={ending} onMenu={() => { setEnding(null); setScreen('menu') }} />
  if (screen === 'pick' && chosen) return <PickStart word={chosen.word} diff={diff} onBack={() => setScreen('menu')} onStart={begin} />

  const typed = cleanWord(custom)
  return (
    <div className='page cw-menu'>
      <div className='cw-hero'>
        <h1 className='cw-logo'>Catch<span>word</span></h1>
        <p className='lede'>Coin a word and get the whole world saying it. Evolve how it spreads, what it sounds like and how well it lasts, until everyone on Earth has absorbed it into their language. Spread it too slowly and the Purists will rule it isn’t a word; make it ordinary too soon and people stop passing it on before it’s reached everyone.</p>
      </div>
      {!v.canPlay && <div className='wl-need'>You’ve rated {v.rated} word{v.rated === 1 ? '' : 's'}. Rate at least {MIN_RATED_CW}: your new words are blended from them.</div>}
      {v.run && (
        <div className='wl-continue'>
          <span className='cw-bubble-ico' aria-hidden='true'>💬</span>
          <div><strong>“{v.run.word}” is still spreading</strong><span>Day {v.run.day}, {DIFFICULTIES[v.run.difficulty]?.name}</span></div>
          <button className='btn primary' onClick={resume}>Continue</button>
          <button className='btn ghost small' onClick={async () => { await api('catchwordAbandon'); load() }}>Abandon</button>
        </div>
      )}
      <h2 className='wl-h'>Coin a word</h2>
      <div className='cw-coins' role='radiogroup' aria-label='Your new word'>
        {coins.map((c) => (
          <button key={c.word} className={`cw-coin ${chosen?.word === c.word ? 'on' : ''}`} aria-pressed={chosen?.word === c.word} onClick={() => setChosen(c)}>
            <b>{c.word}</b>
            <small>{c.from[0]} + {c.from[1]}</small>
          </button>
        ))}
        <button className='cw-coin reroll' onClick={reroll} disabled={!v.canPlay}><b>↻</b><small>New blends</small></button>
      </div>
      <form className='cw-custom' onSubmit={(e) => { e.preventDefault(); if (validWord(typed)) setChosen({ word: typed, from: [] }) }}>
        <label>Or make one up <input className='field' value={custom} maxLength={14} onChange={(e) => { setCustom(e.target.value); const w = cleanWord(e.target.value); if (validWord(w)) setChosen({ word: w, from: [] }) }} placeholder='3 to 14 letters' /></label>
        <small>Blends of words you rated highly start a little catchier. Short, easy-to-say words catch on faster.</small>
      </form>
      <div className='cw-pickrow'>
        <div className='seg cw-diff'>{Object.entries(DIFFICULTIES).map(([id, d]) => <button key={id} className={diff === id ? 'on' : ''} onClick={() => setDiff(id)} title={d.blurb}>{d.name}</button>)}</div>
        <p className='wl-blurb'>{DIFFICULTIES[diff].blurb}</p>
        <button className='btn primary big' disabled={!v.canPlay || !chosen} onClick={() => setScreen('pick')}>Spread “{chosen?.word || '…'}” →</button>
      </div>
      <div className='wl-grid'>
        <section className='wl-panel'>
          <h3>Progress</h3>
          <dl className='wl-stats'>
            <div><dt>Games</dt><dd>{v.progress.games}</dd></div>
            <div><dt>Wins</dt><dd>{v.progress.wins}</dd></div>
            <div><dt>Fastest win</dt><dd>{v.progress.fastest ? `${v.progress.fastest} days` : '–'}</dd></div>
            <div><dt>Best spread</dt><dd>{v.progress.games ? pct(v.progress.best) : '–'}</dd></div>
            <div><dt>Brutal wins</dt><dd>{v.progress.byDiff.brutal || 0}</dd></div>
          </dl>
          <h3>Your words in the world</h3>
          {v.progress.words.length
            ? <ul className='cw-words'>{v.progress.words.map((w, i) => <li key={i} className={w.won ? 'won' : ''}><b>{w.word}</b><span>{w.won ? `in every dictionary, ${w.day} days` : `died out on day ${w.day}, ${pct(w.absorbed)} absorbed`}</span><small>{DIFFICULTIES[w.difficulty]?.name} · from {REGION[w.start]?.name}</small></li>)}</ul>
            : <p className='wl-note'>None yet. The first word you spread will be remembered here.</p>}
        </section>
        <section className='wl-panel'>
          <h3>Goals</h3>
          <ul className='wl-goals'>{v.goals.map((g) => <li key={g.id} className={g.done ? 'done' : ''}>{g.done ? '✓' : '○'} {g.text}</li>)}</ul>
          <h3>Looks from Catchword</h3>
          <ul className='wl-goals'>{v.looks.map((l) => <li key={`${l.kind}:${l.id}`} className={l.have ? 'done' : ''}>{l.have ? '✓' : '🔒'} <b>{l.name}</b> <small>{l.kind === 'cardBack' ? 'card back' : l.kind === 'name' ? 'name style' : l.kind}</small> · {l.goal}</li>)}</ul>
        </section>
      </div>
    </div>
  )
}

// --- the map ------------------------------------------------------------------------------
const Region = memo(function Region ({ id, fill, on, hot, onPick, onHover }) {
  return (
    <g className={`cw-region ${on ? 'on' : ''} ${hot ? 'hot' : ''}`} style={{ '--fill': fill }} onClick={onPick ? () => onPick(id) : undefined} onMouseEnter={onHover ? () => onHover(id) : undefined} onMouseLeave={onHover ? () => onHover(null) : undefined}>
      {MAP.regions[id].paths.map((d, i) => <path key={i} d={d} />)}
    </g>
  )
})

const Dots = memo(function Dots ({ id, a, s }) {
  const dots = MAP.regions[id].dots
  return dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.1} className={i < a ? 'da' : i < a + s ? 'ds' : 'du'} />)
})

function regionFill (z) {
  const pop = z.u + z.s + z.a
  if (!z.seen) return 'var(--cw-land)'
  const s = z.s / pop
  const a = z.a / pop
  return `color-mix(in oklab, color-mix(in oklab, var(--cw-ink) ${Math.round(a / Math.max(0.0001, a + s) * 100)}%, var(--cw-speak)) ${Math.round(Math.min(1, (s + a) * 1.1) * 70 + 8)}%, var(--cw-land))`
}

function WorldMap ({ g, selected, onPick, onHover, hover, children }) {
  return (
    <svg className='cw-map' viewBox={`0 0 ${MAP.w} ${MAP.h}`} role='img' aria-label='World map'>
      <g className='cw-other'>{MAP.other.map((d, i) => <path key={i} d={d} />)}</g>
      {REGIONS.map((r) => <Region key={r.id} id={r.id} fill={g ? regionFill(g.regions[r.id]) : undefined} on={selected === r.id} hot={hover === r.id} onPick={onPick} onHover={onHover} />)}
      {g && <g className='cw-dots'>{REGIONS.map((r) => { const z = g.regions[r.id]; const pop = z.u + z.s + z.a; const n = MAP.regions[r.id].dots.length; const a = Math.round((z.a / pop) * n); const s = z.s > 0 ? Math.max(1, Math.round((z.s / pop) * n)) : 0; return <Dots key={r.id} id={r.id} a={a} s={Math.min(n - a, s)} /> })}</g>}
      {children}
    </svg>
  )
}

// --- picking where it starts --------------------------------------------------------------
function PickStart ({ word, diff, onBack, onStart }) {
  const [sel, setSel] = useState(null)
  const [hover, setHover] = useState(null)
  const r = REGION[hover || sel]
  return (
    <div className='page cw-pick'>
      <div className='cw-pick-head'>
        <button className='btn ghost small' onClick={onBack}>← Back</button>
        <h2>Where does someone first say “{word}”?</h2>
        <span className='cw-diff-tag'>{DIFFICULTIES[diff].name}</span>
      </div>
      <div className='cw-mapbox'><WorldMap selected={sel} hover={hover} onPick={setSel} onHover={setHover} /></div>
      <div className='cw-pick-foot'>
        {r
          ? <RegionCard r={r} />
          : <p className='wl-note'>Click a region. Young, online places pick up new words fastest; formal ones resist. Somewhere central, with neighbours and an airport, gets it travelling sooner.</p>}
        <button className='btn primary big' disabled={!sel} onClick={() => onStart(sel)}>Start in {sel ? REGION[sel].name : '…'}</button>
      </div>
    </div>
  )
}

function RegionCard ({ r, live }) {
  const bar = (label, x, tip) => <div className='cw-trait' title={tip}><span>{label}</span><i style={{ '--x': x }} /></div>
  return (
    <div className='cw-rcard'>
      <div className='cw-rcard-head'><strong>{r.name}</strong><span>{fmtPeople(r.pop)} people · {LANG_NAMES[r.lang]}</span></div>
      <div className='cw-traits'>
        {bar('Online', r.net, 'Group chats and memes travel well here')}
        {bar('Young', r.young, 'Schoolyards and song lyrics travel well here')}
        {bar('Formal', r.formal, 'Slang struggles here, and the Purists are strong')}
      </div>
      <div className='cw-links'>{r.air ? (live && !live.airOpen ? '✈️ flights mostly turned away' : '✈️ airport') : '✈️ no big airport'} · {r.port ? (live && !live.seaOpen ? '🚢 ports mostly closed' : '🚢 port') : 'no port'} · {r.land.length ? `borders ${r.land.length} region${r.land.length === 1 ? '' : 's'}` : 'no land borders'}</div>
      {live && (
        <div className='cw-split'>
          <span className='u'>{fmtPeople(live.unaware)} haven’t heard it</span>
          <span className='s'>{fmtPeople(live.speakers)} saying it</span>
          <span className='a'>{fmtPeople(live.absorbed)} absorbed</span>
        </div>
      )}
    </div>
  )
}

// --- sound --------------------------------------------------------------------------------
function sfx (settings, kind) {
  try {
    if (!settings?.soundVolume || settings.ratingSound === 'off') return
    const c = synth.audio()
    const out = synth.chain(c, c.destination)
    const v = settings.soundVolume / 100
    if (kind === 'pop') synth.voice(c, out, { type: 'sine', freq: 520, glide: 900, decay: 0.12, gain: 0.25 * v })
    if (kind === 'evolve') [523, 659, 784].forEach((f, i) => synth.bell(c, out, { freq: f, start: i * 0.06, decay: 0.6, gain: 0.12 * v }))
    if (kind === 'land') synth.voice(c, out, { type: 'triangle', freq: 880, glide: 660, decay: 0.25, gain: 0.12 * v })
    if (kind === 'purist') synth.bell(c, out, { freq: 196, decay: 1.6, gain: 0.25 * v, ratio: 1.4 })
    if (kind === 'win') [523, 659, 784, 1046, 1318].forEach((f, i) => synth.bell(c, out, { freq: f, start: i * 0.1, decay: 1, gain: 0.14 * v }))
    if (kind === 'lose') [392, 330, 262].forEach((f, i) => synth.voice(c, out, { type: 'triangle', freq: f, start: i * 0.18, decay: 0.5, gain: 0.15 * v }))
  } catch {}
}

// --- the game -----------------------------------------------------------------------------
function Game ({ init, settings, onEnd, onQuit }) {
  const gRef = useRef(init)
  const [, setTick] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [sel, setSel] = useState(init.start)
  const [panel, setPanel] = useState(false)
  const [auto, setAuto] = useState(() => { try { return localStorage.getItem('cw-auto') === 'on' } catch { return false } })
  const speedRef = useRef(1)
  const autoRef = useRef(auto)
  const ended = useRef(false)
  const g = gRef.current
  const rerender = () => setTick((t) => t + 1)
  speedRef.current = panel ? 0 : speed
  autoRef.current = auto
  useEffect(() => { try { localStorage.setItem('cw-auto', auto ? 'on' : 'off') } catch {} }, [auto])

  const save = useCallback(() => { if (!gRef.current.over) api('catchwordSave', serialize(gRef.current)).catch(() => {}) }, [])
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    const loop = (now) => {
      const ms = SPEEDS[speedRef.current]
      acc += Math.min(500, now - last)
      last = now
      const game = gRef.current
      if (!ms || game.over) acc = 0
      let stepped = false
      while (ms > 0 && acc >= ms && !game.over) { // eslint-disable-line no-unmodified-loop-condition
        acc -= ms
        const ev = step(game)
        if (autoRef.current) popAll(game, true)
        stepped = true
        for (const e of ev) {
          if (e.kind === 'landed') sfx(settings, 'land')
          if (e.kind === 'purists' || e.kind === 'purist-stage' || e.kind === 'ruled') sfx(settings, 'purist')
        }
        if (game.day % 10 === 0) save()
      }
      if (stepped) rerender()
      if (game.over && !ended.current) {
        ended.current = true
        sfx(settings, game.over.won ? 'win' : 'lose')
        setTimeout(() => onEnd(game), 1800)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const vis = () => { if (document.hidden) save() }
    document.addEventListener('visibilitychange', vis)
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis); save() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === ' ') { e.preventDefault(); setSpeed((s) => (s ? 0 : 1)) }
      if (e.key >= '1' && e.key <= '3') setSpeed(Number(e.key))
      if (e.key === 'e' || e.key === 'E') setPanel((p) => !p)
      if (e.key === 'Escape') setPanel(false)
      if (e.key === 'c' || e.key === 'C') { popAll(gRef.current, true); rerender() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const tot = totals(g)
  const noto = notoriety(g)
  const ms = SPEEDS[speed] || 600
  const clickBubble = (b) => { const got = pop(g, b.id); if (got) { sfx(settings, 'pop'); rerender() } }
  const live = sel ? regionView(g, sel) : null
  const unseen = REGIONS.filter((r) => !g.regions[r.id].seen).length
  const news = g.news.slice(-6).reverse()
  return (
    <div className='cw-game'>
      <div className='cw-top'>
        <div className='cw-word'><b>{g.word}</b><small>{DIFFICULTIES[g.difficulty].name}</small></div>
        <div className='cw-day'>Day <b>{g.day}</b>{g.day > MAX_DAYS - 200 && <small> · the world moves on at {MAX_DAYS}</small>}</div>
        <div className='seg cw-speed' aria-label='Speed'>
          {['❚❚', '▶', '▶▶', '▶▶▶'].map((t, i) => <button key={i} className={speed === i ? 'on' : ''} onClick={() => setSpeed(i)} title={i ? `${i}× speed (${i})` : 'Pause (Space)'}>{t}</button>)}
        </div>
        <label className='cw-auto' title='Collect bubbles as they appear, for a little less each'><input type='checkbox' checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-collect</label>
        <button className='btn primary cw-evolve' onClick={() => setPanel(true)}>Evolve <span className='cw-buzz'>💬 {g.buzz}</span></button>
        <button className='btn ghost small' onClick={() => { save(); onQuit() }}>Save & quit</button>
      </div>
      <div className='cw-body'>
        <div className='cw-mapbox live'>
          <WorldMap g={g} selected={sel} onPick={setSel}>
            <g className='cw-trips'>{g.trips.map((t, i) => <Trip key={`${t.from}-${t.to}-${t.day}-${i}`} t={t} day={g.day} ms={ms} />)}</g>
            <g className='cw-bubbles'>{g.bubbles.map((b) => <Bubble key={b.id} b={b} day={g.day} onPop={clickBubble} />)}</g>
          </WorldMap>
          {g.over && <div className={`cw-over ${g.over.won ? 'won' : ''}`}><b>{g.over.won ? `“${g.word}” is in every dictionary on Earth.` : `“${g.word}” has died out.`}</b><span>{g.over.why}</span></div>}
        </div>
        <aside className='cw-side'>
          {live && <RegionCard r={live} live={live} />}
          <div className='cw-news' aria-live='polite'>
            {news.map((n, i) => <p key={g.news.length - i} className={`k-${n.kind}`}><small>Day {n.day}</small>{n.text}</p>)}
          </div>
        </aside>
      </div>
      <div className='cw-bottom'>
        <div className='cw-world'>
          <div className='cw-bar'>
            <i className='a' style={{ width: `${(tot.a / tot.world) * 100}%` }} />
            <i className='s' style={{ width: `${(tot.s / tot.world) * 100}%` }} />
          </div>
          <div className='cw-legend'>
            <span className='a'>Absorbed <b>{fmtPeople(tot.a)}</b></span>
            <span className='s'>Saying it <b>{fmtPeople(tot.s)}</b></span>
            <span className='u'>Haven’t heard it <b>{fmtPeople(tot.u)}</b></span>
            <span>{unseen ? `${unseen} region${unseen === 1 ? '' : 's'} still to reach` : 'Every region reached'}</span>
          </div>
        </div>
        <div className='cw-purists' title={g.purists ? 'When this fills, the ruling passes and speakers start dropping the word' : 'The Purists haven’t noticed yet. Notoriety gets their attention'}>
          <div className='cw-purists-head'><span>📜 The Purists {g.ruled ? '· ruling passed' : g.purists ? '· drafting a ruling' : '· haven’t noticed'}</span><b>{Math.floor(g.research)}%</b></div>
          <div className='cw-bar purist'><i style={{ width: `${g.research}%` }} /></div>
          <small>Notoriety {Math.round(noto)}</small>
        </div>
      </div>
      {panel && <EvolvePanel g={g} onClose={() => setPanel(false)} onChange={() => { sfx(settings, 'evolve'); rerender(); save() }} />}
    </div>
  )
}

function Trip ({ t, day, ms }) {
  const a = MAP.regions[t.from].c
  const b = MAP.regions[t.to].c
  const p = (k) => { const x = Math.max(0, Math.min(1, k)); const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) * (t.mode === 'air' ? 0.22 : 0.06); const u = 1 - x; return [u * u * a[0] + 2 * u * x * mx + x * x * b[0], u * u * a[1] + 2 * u * x * my + x * x * b[1]] }
  const span = t.arrive - t.day
  const [x, y] = p((day - t.day + 1) / span)
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) * (t.mode === 'air' ? 0.22 : 0.06)
  return (
    <g className={`cw-trip ${t.mode}`}>
      <path d={`M${a[0]},${a[1]} Q${mx},${my} ${b[0]},${b[1]}`} />
      <text style={{ transform: `translate(${x}px, ${y}px)`, transition: `transform ${ms}ms linear` }} x={0} y={0}>{t.mode === 'air' ? '✈' : '⛴'}</text>
    </g>
  )
}

function Bubble ({ b, day, onPop }) {
  const c = MAP.regions[b.region].c
  const x = c[0] + b.dx * 14
  const y = c[1] + b.dy * 10 - 6
  const age = day - b.day
  return (
    <g className={`cw-bubble k-${b.kind} ${age > 10 ? 'fading' : ''}`} transform={`translate(${x}, ${y})`} onClick={(e) => { e.stopPropagation(); onPop(b) }} role='button' aria-label={b.kind === 'purist' ? 'Purist bubble: pop to set them back' : `Buzz bubble, ${b.value}`}>
      <circle r={9} />
      <text y={3.5}>{b.kind === 'purist' ? '📜' : `+${b.value}`}</text>
    </g>
  )
}

// --- evolving -----------------------------------------------------------------------------
function EvolvePanel ({ g, onClose, onChange }) {
  const [tree, setTree] = useState('spread')
  const [pick, setPick] = useState(null)
  const [err, setErr] = useState(null)
  const list = TRAITS.filter((x) => x.tree === tree)
  const fx = totalFx(g.traits)
  const x = pick ? TRAIT[pick] : null
  const doEvolve = () => { try { evolve(g, pick); setErr(null); onChange() } catch (e) { setErr(e.message) } }
  const doDevolve = () => { try { devolve(g, pick); setErr(null); onChange() } catch (e) { setErr(e.message) } }
  const W = 110
  const H = 74
  const pos = (t) => [t.col * W + 60, t.row * H + 34]
  return (
    <div className='cw-panel-wrap' onClick={onClose}>
      <div className='cw-panel' onClick={(e) => e.stopPropagation()} role='dialog' aria-label='Evolve your word'>
        <div className='cw-panel-head'>
          <div className='seg'>{TREES.map((t) => <button key={t.id} className={tree === t.id ? 'on' : ''} onClick={() => { setTree(t.id); setPick(null) }}>{t.name}</button>)}</div>
          <span className='cw-buzz big'>💬 {g.buzz} buzz</span>
          <button className='btn ghost small' onClick={onClose}>Back to the map (Esc)</button>
        </div>
        <p className='wl-note'>{TREES.find((t) => t.id === tree).blurb}</p>
        <div className='cw-tree'>
          <svg viewBox={`0 0 ${W * 5 + 10} ${H * 6 + 10}`} className='cw-tree-lines' aria-hidden='true'>
            {list.flatMap((t) => t.req.map((r) => { const [x1, y1] = pos(TRAIT[r]); const [x2, y2] = pos(t); return <line key={`${r}-${t.id}`} x1={x1} y1={y1} x2={x2} y2={y2} className={g.traits.includes(r) ? 'lit' : ''} /> }))}
          </svg>
          {list.map((t) => {
            const [px, py] = pos(t)
            const have = g.traits.includes(t.id)
            const can = canEvolve(t.id, g.traits)
            return (
              <button key={t.id} className={`cw-node ${have ? 'have' : can ? 'can' : 'locked'} ${pick === t.id ? 'on' : ''}`} style={{ left: `${(px / (W * 5 + 10)) * 100}%`, top: `${(py / (H * 6 + 10)) * 100}%` }} onClick={() => { setPick(t.id); setErr(null) }}>
                <b>{t.name}</b>
                <small>{have ? '✓' : `💬 ${traitCost(t.id, g.traits)}`}</small>
              </button>
            )
          })}
        </div>
        <div className='cw-detail'>
          {x
            ? (
              <>
                <div><strong>{x.name}</strong><p>{x.blurb}</p>{err && <p className='cw-err'>{err}</p>}</div>
                {g.traits.includes(x.id)
                  ? <button className='btn' disabled={!canDevolve(x.id, g.traits) || g.buzz < DEVOLVE_COST} onClick={doDevolve} title='Undo it, if nothing else needs it'>Devolve · 💬 {DEVOLVE_COST}</button>
                  : <button className='btn primary' disabled={!canEvolve(x.id, g.traits) || g.buzz < traitCost(x.id, g.traits)} onClick={doEvolve}>{canEvolve(x.id, g.traits) ? `Evolve · 💬 ${traitCost(x.id, g.traits)}` : 'Needs one before it'}</button>}
              </>
              )
            : <p className='wl-note'>Pick a trait. Pop the bubbles on the map for more buzz.</p>}
        </div>
        <div className='cw-fx'>
          <span title='How readily each speaker passes it on'>Catchiness <b>{Math.round((0.24 + g.catchBonus + fx.catch) * 100)}</b></span>
          <span title='Bigger means more buzz, and the Purists notice and work faster'>Notoriety <b>{Math.round(notoriety(g))}</b></span>
          <span title='How fast speakers absorb it for good (and stop passing it on)'>Absorption <b>{((0.0006 + fx.absorb) * 1000).toFixed(1)}</b></span>
          <span title='Getting into other language families'>Across languages <b>{Math.round(Math.min(1, 0.3 + fx.lang) * 100)}%</b></span>
          <span title='Getting past formal speech'>Formal places <b>{Math.round(Math.min(1, fx.formal) * 100)}%</b></span>
        </div>
      </div>
    </div>
  )
}

// --- the end ------------------------------------------------------------------------------
function EndNote ({ ending, onMenu }) {
  const { g, reward } = ending
  const tot = totals(g)
  const won = g.over?.won
  const firstNews = g.news.find((n) => n.kind === 'start')
  return (
    <div className='page cw-end'>
      <div className={`cw-entry ${won ? 'won' : ''}`}>
        <h1>{g.word}</h1>
        <p className='cw-entry-pos'><i>n.</i> {won ? 'a word, in every language on Earth.' : '(obsolete) a word that almost was.'}</p>
        <p>First said in {REGION[g.start].name}. {won ? `Absorbed by the whole world, all ${fmtPeople(tot.world)} people, in ${g.day} days` : `Died out on day ${g.day}, after ${fmtPeople(tot.a)} people had absorbed it (${pct(tot.a / tot.world)})`}{g.ruled ? `, despite a style ruling on day ${g.stats.ruledDay}` : ''}.</p>
        {firstNews && <p className='wl-note'>{g.over?.why}</p>}
      </div>
      {reward && (
        <div className='cw-reward'>
          {reward.coins > 0 && <span><Coins n={reward.coins} /></span>}
          {reward.xp > 0 && <span>+{reward.xp} XP</span>}
          {(reward.looks || []).map((l) => <span key={l.id}>✨ New look: {l.name}</span>)}
        </div>
      )}
      <div className='cw-endstats'>
        <span>Regions reached <b>{g.stats.regions} of {REGIONS.length}</b></span>
        <span>Traits evolved <b>{g.traits.length}</b></span>
        <span>Bubbles popped <b>{g.stats.popped}</b></span>
        <span>The Purists got <b>{Math.floor(g.stats.peakResearch)}%</b> of the way</span>
      </div>
      <button className='btn primary big' onClick={onMenu}>Coin another word</button>
    </div>
  )
}
