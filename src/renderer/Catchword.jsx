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
  return dots.map(([x, y], i) => (i < a + s ? <circle key={i} cx={x} cy={y} r={i < a ? 2 : 2.3} className={i < a ? 'da' : 'ds'} /> : null))
})

function regionFill (z) {
  const pop = z.u + z.s + z.a
  if (!z.seen) return 'var(--cw-land)'
  const s = z.s / pop
  const a = z.a / pop
  return `color-mix(in oklab, color-mix(in oklab, var(--cw-ink) ${Math.round(a / Math.max(0.0001, a + s) * 100)}%, var(--cw-speak)) ${Math.round(Math.min(1, (s + a) * 1.1) * 62 + 10)}%, var(--cw-land))`
}

function WorldMap ({ g, selected, onPick, onHover, hover, children, still }) {
  return (
    <svg className={`cw-map ${still ? 'still' : ''}`} viewBox={`0 0 ${MAP.w} ${MAP.h}`} role='img' aria-label='World map'>
      <defs>
        <linearGradient id='cw-sea' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stopColor='var(--cw-sea-hi)' /><stop offset='1' stopColor='var(--cw-sea)' /></linearGradient>
      </defs>
      <path className='cw-sphere' d={MAP.sphere} />
      <path className='cw-grat' d={MAP.graticule} />
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
        <h2>Where does someone first say <b>“{word}”</b>?</h2>
        <span className='cw-diff-tag'>{DIFFICULTIES[diff].name}</span>
      </div>
      <div className='cw-pick-body'>
        <div className='cw-mapbox'><WorldMap selected={sel} hover={hover} onPick={setSel} onHover={setHover} /></div>
        <aside className='cw-pick-side'>
          {r
            ? <RegionCard r={r} />
            : <div className='cw-rcard cw-rcard-empty'><strong>Pick a region</strong><p>Young, online places pick up new words fastest; formal ones resist. Somewhere with neighbours, an airport and a port gets it travelling sooner.</p></div>}
          <button className='btn primary big' disabled={!sel} onClick={() => onStart(sel)}>{sel ? `Start in ${REGION[sel].name}` : 'Click the map'}</button>
        </aside>
      </div>
    </div>
  )
}

function RegionCard ({ r, live }) {
  const bar = (label, x, tip) => <div className='cw-trait' title={tip}><span>{label}</span><i style={{ '--x': x }} /></div>
  return (
    <div className='cw-rcard'>
      <div className='cw-rcard-head'><strong>{r.name}</strong><span>{fmtPeople(r.pop)} people · {LANG_NAMES[r.lang]}</span></div>
      {live && (
        <div className='cw-rsplit' title='Absorbed · saying it · haven’t heard it'>
          <i className='a' style={{ width: `${live.absorbedShare * 100}%` }} />
          <i className='s' style={{ width: `${live.share * 100}%` }} />
        </div>
      )}
      {live && (
        <div className='cw-split'>
          <span className='s'><b>{fmtPeople(live.speakers)}</b> saying it</span>
          <span className='a'><b>{fmtPeople(live.absorbed)}</b> absorbed</span>
          <span className='u'><b>{fmtPeople(live.unaware)}</b> haven’t heard it</span>
        </div>
      )}
      <div className='cw-traits'>
        {bar('Online', r.net, 'Group chats and memes travel well here')}
        {bar('Young', r.young, 'Schoolyards and song lyrics travel well here')}
        {bar('Formal', r.formal, 'Slang struggles here, and the Purists are strong')}
      </div>
      <div className='cw-links'>
        <span className={r.air ? (live && !live.airOpen ? 'shut' : '') : 'none'}>✈ {r.air ? (live && !live.airOpen ? 'flights turned away' : 'airport') : 'no airport'}</span>
        <span className={r.port ? (live && !live.seaOpen ? 'shut' : '') : 'none'}>⚓ {r.port ? (live && !live.seaOpen ? 'port closed' : 'port') : 'no port'}</span>
        <span className={r.land.length ? '' : 'none'}>⛰ {r.land.length ? `${r.land.length} neighbour${r.land.length === 1 ? '' : 's'}` : 'an island'}</span>
      </div>
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
        setTimeout(() => onEnd(game), 2200)
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
  const reached = REGIONS.filter((r) => g.regions[r.id].seen).length
  const headline = g.news[g.news.length - 1]
  const canEvolveAny = TRAITS.some((t) => canEvolve(t.id, g.traits) && g.buzz >= traitCost(t.id, g.traits))
  return (
    <div className='cw-game'>
      <div className='cw-hud'>
        <div className='cw-word'>
          <b>{g.word}</b>
          <small>{g.from?.length === 2 ? `${g.from[0]} + ${g.from[1]} · ` : ''}{DIFFICULTIES[g.difficulty].name}</small>
        </div>
        <div className='cw-day' title={g.day > MAX_DAYS - 200 ? `The world moves on to newer words at day ${MAX_DAYS}` : undefined}><small>Day</small><b>{g.day}</b>{g.day > MAX_DAYS - 200 && <small className='cw-late'>of {MAX_DAYS}</small>}</div>
        <div className='seg cw-speed' aria-label='Speed'>
          {['❚❚', '▶', '▶▶', '▶▶▶'].map((t, i) => <button key={i} className={speed === i ? 'on' : ''} onClick={() => setSpeed(i)} title={i ? `${i}× speed (${i})` : 'Pause (Space)'}>{t}</button>)}
        </div>
        <span className='cw-gap' />
        <label className='cw-auto' title='Collect bubbles as they appear, for a little less each'><input type='checkbox' checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-collect</label>
        <button className={`btn primary cw-evolve ${canEvolveAny ? 'ready' : ''}`} onClick={() => setPanel(true)} title='Evolve (E)'><span>Evolve</span><span className='cw-buzz'>💬 {g.buzz}</span></button>
        <button className='btn ghost small' onClick={() => { save(); onQuit() }}>Save & quit</button>
      </div>
      <div className='cw-body'>
        <div className='cw-stage'>
          <div className='cw-mapbox live'>
            <WorldMap g={g} selected={sel} onPick={setSel}>
              <g className='cw-trips'>{g.trips.map((t, i) => <Trip key={`${t.from}-${t.to}-${t.day}-${i}`} t={t} day={g.day} ms={ms} />)}</g>
              <g className='cw-bubbles'>{g.bubbles.map((b) => <Bubble key={b.id} b={b} day={g.day} onPop={clickBubble} />)}</g>
            </WorldMap>
            {g.over && <div className={`cw-over ${g.over.won ? 'won' : ''}`}><b>{g.over.won ? `“${g.word}” is in every dictionary on Earth.` : `“${g.word}” has died out.`}</b><span>{g.over.why}</span></div>}
          </div>
          {headline && <div key={g.news.length} className={`cw-ticker k-${headline.kind}`}><span>Day {headline.day}</span>{headline.text}</div>}
        </div>
        <aside className='cw-side'>
          <section className='cw-panel-card'>
            <h4>The world</h4>
            <div className='cw-bar big'>
              <i className='a' style={{ width: `${(tot.a / tot.world) * 100}%` }} />
              <i className='s' style={{ width: `${(tot.s / tot.world) * 100}%` }} />
            </div>
            <div className='cw-legend'>
              <span className='s'><i />Saying it <b>{fmtPeople(tot.s)}</b></span>
              <span className='a'><i />Absorbed <b>{fmtPeople(tot.a)}</b></span>
              <span className='u'><i />Haven’t heard it <b>{fmtPeople(tot.u)}</b></span>
            </div>
            <div className='cw-reach'><span>Regions reached</span><b>{reached} / {REGIONS.length}</b></div>
          </section>
          <section className={`cw-panel-card cw-purists ${g.ruled ? 'ruled' : g.purists ? 'on' : ''}`} title={g.purists ? 'When this fills, the ruling passes and speakers start dropping the word' : 'The Purists haven’t noticed yet. Notoriety gets their attention'}>
            <h4>📜 The Purists <small>{g.ruled ? 'ruling passed' : g.purists ? 'drafting a ruling' : 'haven’t noticed'}</small></h4>
            <div className='cw-bar purist'><i style={{ width: `${g.research}%` }} /><b>{Math.floor(g.research)}%</b></div>
            <div className='cw-noto'><span>Notoriety</span><i style={{ '--x': Math.min(1, noto / 30) }} /><b>{Math.round(noto)}</b></div>
          </section>
          {live && <RegionCard r={live} live={live} />}
          <div className='cw-news' aria-live='polite'>
            {g.news.slice(-8, -1).reverse().map((n, i) => <p key={g.news.length - i} className={`k-${n.kind}`}><small>Day {n.day}</small>{n.text}</p>)}
          </div>
        </aside>
      </div>
      {panel && <EvolvePanel g={g} onClose={() => setPanel(false)} onChange={() => { sfx(settings, 'evolve'); rerender(); save() }} />}
    </div>
  )
}

// A flight arcs over land; a ship follows its sea lane.
function lane (from, to) {
  const k = from < to ? `${from}|${to}` : `${to}|${from}`
  const legs = MAP.sea?.[k]
  if (!legs) return null
  return from < to ? legs : legs.slice().reverse().map((l) => l.slice().reverse())
}
function along (legs, k) {
  const lens = legs.map((l) => l.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - l[i][0], p[1] - l[i][1]), 0))
  let d = Math.max(0, Math.min(1, k)) * lens.reduce((a, b) => a + b, 0)
  for (let li = 0; li < legs.length; li++) {
    const l = legs[li]
    if (d > lens[li] && li < legs.length - 1) { d -= lens[li]; continue }
    for (let i = 1; i < l.length; i++) {
      const sl = Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1])
      if (d <= sl || i === l.length - 1) { const f = sl ? Math.min(1, d / sl) : 0; return { x: l[i - 1][0] + (l[i][0] - l[i - 1][0]) * f, y: l[i - 1][1] + (l[i][1] - l[i - 1][1]) * f, leg: li } }
      d -= sl
    }
  }
  const last = legs[legs.length - 1]
  return { x: last[last.length - 1][0], y: last[last.length - 1][1], leg: legs.length - 1 }
}
function Trip ({ t, day, ms }) {
  const k = Math.max(0, Math.min(1, (day - t.day + 1) / (t.arrive - t.day)))
  if (t.mode === 'sea') {
    const legs = lane(t.from, t.to)
    if (legs) {
      const p = along(legs, k)
      return (
        <g className='cw-trip sea'>
          {legs.map((l, i) => <polyline key={i} points={l.map((q) => q.join(',')).join(' ')} />)}
          <g className='cw-ship' style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: p.leg === along(legs, Math.max(0, k - 1 / (t.arrive - t.day))).leg ? `transform ${ms}ms linear` : 'none' }}>
            <path d='M-5 0 L5 0 L3.5 3 L-3.5 3 Z' /><rect x={-1} y={-4} width={2} height={4} />
          </g>
        </g>
      )
    }
  }
  const a = MAP.regions[t.from].c
  const b = MAP.regions[t.to].c
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.22
  const u = 1 - k
  const x = u * u * a[0] + 2 * u * k * mx + k * k * b[0]
  const y = u * u * a[1] + 2 * u * k * my + k * k * b[1]
  const dx = 2 * u * (mx - a[0]) + 2 * k * (b[0] - mx)
  const dy = 2 * u * (my - a[1]) + 2 * k * (b[1] - my)
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI
  return (
    <g className='cw-trip air'>
      <path d={`M${a[0]},${a[1]} Q${mx},${my} ${b[0]},${b[1]}`} />
      <g className='cw-plane' style={{ transform: `translate(${x}px, ${y}px) rotate(${ang}deg)`, transition: `transform ${ms}ms linear` }}>
        <path d='M6 0 L-4 -1.2 L-6 -4.5 L-7 -4.5 L-5.5 -1 L-7 -0.8 L-8 -2.5 L-8.8 -2.5 L-8 0 L-8.8 2.5 L-8 2.5 L-7 0.8 L-5.5 1 L-7 4.5 L-6 4.5 L-4 1.2 Z' />
      </g>
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
      <g className='cw-bubble-in'>
        <path d='M-10 -9 Q-10 -12 -7 -12 L7 -12 Q10 -12 10 -9 L10 3 Q10 6 7 6 L-1 6 L-5 10 L-4 6 L-7 6 Q-10 6 -10 3 Z' />
        <text y={-1.5}>{b.kind === 'purist' ? '📜' : `+${b.value}`}</text>
      </g>
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
            const afford = can && g.buzz >= traitCost(t.id, g.traits)
            return (
              <button key={t.id} className={`cw-node ${have ? 'have' : can ? 'can' : 'locked'} ${afford ? 'afford' : ''} ${pick === t.id ? 'on' : ''}`} style={{ left: `${(px / (W * 5 + 10)) * 100}%`, top: `${(py / (H * 6 + 10)) * 100}%` }} onClick={() => { setPick(t.id); setErr(null) }}>
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
// How it went, over time: speakers and absorbed (stacked), and the Purists.
function History ({ g }) {
  const h = g.hist && g.hist.length > 1 ? g.hist : [[0, 0, 0, 0], [g.day, 0, 0, 0]]
  const W = 600
  const H = 170
  const maxD = Math.max(1, h[h.length - 1][0])
  const X = (d) => (d / maxD) * W
  const Y = (v) => H - v * H
  const area = (top, bot) => `M${h.map((p) => `${X(p[0])},${Y(top(p))}`).join(' L')} L${h.slice().reverse().map((p) => `${X(p[0])},${Y(bot(p))}`).join(' L')} Z`
  const absorbed = area((p) => p[2], () => 0)
  const speaking = area((p) => p[2] + p[1], (p) => p[2])
  const purists = `M${h.map((p) => `${X(p[0])},${Y(p[3] / 100)}`).join(' L')}`
  const ruled = g.stats.ruledDay
  return (
    <svg className='cw-hist' viewBox={`0 -10 ${W} ${H + 30}`} role='img' aria-label='How the word spread over time'>
      {[0.25, 0.5, 0.75, 1].map((v) => <line key={v} x1={0} x2={W} y1={Y(v)} y2={Y(v)} className='grid' />)}
      <path d={absorbed} className='a' />
      <path d={speaking} className='s' />
      <path d={purists} className='p' />
      {ruled && <><line x1={X(ruled)} x2={X(ruled)} y1={0} y2={H} className='ruled' /><text x={X(ruled) + 4} y={12} className='lbl'>ruling</text></>}
      <text x={0} y={H + 16} className='lbl'>Day 0</text>
      <text x={W} y={H + 16} className='lbl end'>Day {g.day}</text>
    </svg>
  )
}

function EndNote ({ ending, onMenu }) {
  const { g, reward } = ending
  const tot = totals(g)
  const won = g.over?.won
  const stats = [
    ['Days', g.day],
    ['Regions reached', `${g.stats.regions} / ${REGIONS.length}`],
    ['Absorbed', pct(tot.a / tot.world)],
    ['Traits evolved', g.traits.length],
    ['Bubbles popped', g.stats.popped],
    ['The Purists got', `${Math.floor(g.stats.peakResearch)}%`]
  ]
  return (
    <div className={`page cw-end ${won ? 'won' : 'lost'}`}>
      <div className='cw-end-banner'>
        <span className='cw-end-tag'>{won ? 'Absorbed worldwide' : 'Died out'}</span>
        <h2>{won ? `Everyone on Earth says “${g.word}” now, and nobody notices.` : `“${g.word}” didn’t make it.`}</h2>
        <p>{won ? `${fmtPeople(tot.world)} people, ${g.day} days, ${DIFFICULTIES[g.difficulty].name}.` : g.over?.why}</p>
      </div>
      <div className='cw-end-grid'>
        <article className='cw-entry'>
          <div className='cw-entry-word'>
            <h1>{g.word}</h1>
            <span className='cw-entry-pos'>{won ? 'n., v. & adj.' : 'n. (obsolete)'}</span>
          </div>
          <p className='cw-entry-def'><b>1.</b> {won ? `A word every language on Earth has taken in, first heard in ${REGION[g.start].name}.` : `A word briefly said in ${g.stats.regions} region${g.stats.regions === 1 ? '' : 's'}, then forgotten.`}</p>
          <p className='cw-entry-ex'>“{won ? `Honestly, I can’t remember a time before ${g.word}.` : `Does anyone still say ${g.word}?`}”</p>
          <p className='cw-entry-ety'><b>Origin</b> {g.from?.length === 2 ? <>A blend of <i>{g.from[0]}</i> and <i>{g.from[1]}</i>.</> : 'Made up on the spot.'} First recorded in {REGION[g.start].name}{g.ruled ? `; ruled “not a word” on day ${g.stats.ruledDay}` : ''}.</p>
        </article>
        <div className='cw-end-map'>
          <WorldMap g={g} still />
        </div>
      </div>
      <div className='cw-end-grid two'>
        <section className='cw-panel-card'>
          <h4>How it spread</h4>
          <History g={g} />
          <div className='cw-legend'><span className='s'><i />Saying it</span><span className='a'><i />Absorbed</span><span className='p'><i />The Purists’ ruling</span></div>
        </section>
        <section className='cw-panel-card'>
          <h4>The numbers</h4>
          <dl className='cw-end-stats'>{stats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          {reward && (
            <div className='cw-reward'>
              {reward.coins > 0 && <span><Coins n={reward.coins} /></span>}
              {reward.xp > 0 && <span>+{reward.xp} XP</span>}
              {(reward.looks || []).map((l) => <span key={l.id}>✨ {l.name}</span>)}
            </div>
          )}
        </section>
      </div>
      <div className='cw-end-acts'><button className='btn primary big' onClick={onMenu}>Coin another word</button></div>
    </div>
  )
}
