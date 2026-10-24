import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, Coins, useToast, celebrate } from './ui.jsx'
import {
  step, startBook, setAlloc, proofread, publish, abandonBook, hire, fire, hireFee, moveOffice, research, researchList, takeGig, refreshCandidates,
  bookCost, canMake, openMedia, knownFit, knownMFit, weeklyCosts, dateText, year, serialize, restore, END_WEEK, skill
} from '../shared/tycoon/sim.js'
import { STAGES, AREAS, FORMATS, FORMAT, SUBJECTS, SUBJECT, MEDIUM, SIZES, SIZE, OFFICES, FEATURES, ROLES, featureFits, marketSize, START_YEAR, END_YEAR } from '../shared/tycoon/content.js'
import { synth } from './sound.js'

// Wird Tycoon: run a dictionary publisher from a garage in 1985 to 2030.
// The menu, the company (an office drawn in SVG, with the book in progress,
// sales and news beside it) and the dialogs for everything you decide.

const SPEEDS = [0, 800, 400, 200] // milliseconds a week
const money = (n) => { const a = Math.abs(n); const t = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M` : a >= 1e4 ? `${Math.round(a / 1000)}k` : Math.round(a).toLocaleString(); return `${n < 0 ? '−' : ''}$${t}` }
const count = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString())
const FIT_MARK = { great: '✓✓', fine: '✓', poor: '✗' }
const FIT_TEXT = { great: 'a great fit', fine: 'a fine fit', poor: 'a poor fit' }
const ROLE = Object.fromEntries(ROLES.map((r) => [r.id, r]))
const ROLE_COLOR = { founder: '#e0a030', scholar: '#4a7ad0', writer: '#3aa070', artist: '#d0508a', editor: '#8a5ad0' }

export default function Tycoon ({ settings }) {
  const toast = useToast()
  const [v, setV] = useState(null)
  const [screen, setScreen] = useState('menu')
  const [game, setGame] = useState(null)
  const [name, setName] = useState('')
  const [ending, setEnding] = useState(null)
  const load = useCallback(() => api('tycoon').then(setV).catch(() => {}), [])
  useEffect(() => { load() }, [load])

  const start = async () => {
    try { setGame(await api('tycoonStart', { name })); setScreen('game') } catch (err) { toast({ error: true, title: 'Can’t start', text: err.message }) }
  }
  const resume = async () => {
    const g = restore(await api('tycoonResume'))
    if (!g) { load(); return }
    setGame(g)
    setScreen('game')
  }
  const finish = async (g) => {
    try {
      const res = await api('tycoonEnd', serialize(g))
      for (const l of res.looks || []) toast({ emoji: '✨', title: `New look: ${l.name}`, text: 'It’s in the Shop, ready to wear.' })
      celebrate(toast, { badges: res.badges || [] })
      setEnding({ g, res })
    } catch (err) { setEnding({ g, res: null }); toast({ error: true, title: 'Couldn’t close the company', text: err.message }) }
    setScreen('end')
    load()
  }

  if (!v) return null
  if (screen === 'game' && game) return <Company key={game.id} init={game} settings={settings} onEnd={finish} onQuit={() => { setScreen('menu'); load() }} />
  if (screen === 'end' && ending) return <Retired ending={ending} onMenu={() => { setEnding(null); setScreen('menu') }} />
  return (
    <div className='page lx-menu'>
      <div className='lx-hero'>
        <h1 className='lx-logo'>Wird <span>Tycoon</span></h1>
        <p className='lede'>Start a dictionary publisher in a garage in 1985 and see it through to 2030. Choose what each book is about, what kind of book it is and what it’s published on, split your team’s time between the parts that matter, and read what the critics think. Hire, research, move into bigger offices, and keep up as paperbacks give way to CD-ROMs, websites, apps and whatever comes next.</p>
      </div>
      {v.run && (
        <div className='wl-continue'>
          <span className='cw-bubble-ico' aria-hidden='true'>📚</span>
          <div><strong>{v.run.name}</strong><span>{dateText(v.run.week)} · {money(v.run.cash)} · {v.run.books} book{v.run.books === 1 ? '' : 's'}</span></div>
          <button className='btn primary' onClick={resume}>Back to work</button>
          <button className='btn ghost small' onClick={async () => { await api('tycoonAbandon'); load() }}>Close it</button>
        </div>
      )}
      <div className='lx-start'>
        <label>Your company <input className='field' value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder='Wird & Co.' /></label>
        <button className='btn primary big' onClick={start}>{v.run ? 'Start a new company' : 'Open for business'}</button>
      </div>
      {v.run && <p className='wl-note'>Starting a new company closes the one you have.</p>}
      <div className='wl-grid'>
        <section className='wl-panel'>
          <h3>Your record</h3>
          <dl className='wl-stats'>
            <div><dt>Companies</dt><dd>{v.progress.companies}</dd></div>
            <div><dt>Books</dt><dd>{v.progress.books}</dd></div>
            <div><dt>Best review</dt><dd>{v.progress.books ? v.progress.best.toFixed(1) : '–'}</dd></div>
            <div><dt>Most in the bank</dt><dd>{v.progress.cashPeak ? money(v.progress.cashPeak) : '–'}</dd></div>
            <div><dt>Best seller</dt><dd>{v.progress.bestseller ? `${count(v.progress.bestseller)} copies` : '–'}</dd></div>
          </dl>
          <h3>Companies you’ve run</h3>
          {v.progress.history.length
            ? <ul className='cw-words'>{v.progress.history.map((h, i) => <li key={i} className={h.retired ? 'won' : ''}><b>{h.name}</b><span>{h.retired ? `made it to ${END_YEAR}` : `went bust in ${h.year}`}, {h.books} books, best {h.best.toFixed(1)}</span><small>{money(h.cash)} at the end</small></li>)}</ul>
            : <p className='wl-note'>None yet.</p>}
        </section>
        <section className='wl-panel'>
          <h3>Goals</h3>
          <ul className='wl-goals'>{v.goals.map((g) => <li key={g.id} className={g.done ? 'done' : ''}>{g.done ? '✓' : '○'} {g.text}</li>)}</ul>
          <h3>Looks from Wird Tycoon</h3>
          <ul className='wl-goals'>{v.looks.map((l) => <li key={`${l.kind}:${l.id}`} className={l.have ? 'done' : ''}>{l.have ? '✓' : '🔒'} <b>{l.name}</b> <small>{l.kind === 'cardBack' ? 'card back' : l.kind === 'name' ? 'name style' : l.kind}</small> · {l.goal}</li>)}</ul>
          <p className='wl-note'>Every book pays you some coins, more for better reviews and bigger books; making it to {END_YEAR} pays a pension.</p>
        </section>
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
    if (kind === 'stage') synth.bell(c, out, { freq: 784, decay: 0.6, gain: 0.12 * v })
    if (kind === 'done') [523, 784].forEach((f, i) => synth.bell(c, out, { freq: f, start: i * 0.1, decay: 0.8, gain: 0.13 * v }))
    if (kind === 'cash') synth.bell(c, out, { freq: 1318, decay: 0.4, gain: 0.08 * v, ratio: 2 })
    if (kind === 'review') synth.noise(c, out, { decay: 0.05, gain: 0.25 * v, freq: 1800 })
    if (kind === 'good') [523, 659, 784, 1046].forEach((f, i) => synth.bell(c, out, { freq: f, start: i * 0.09, decay: 0.9, gain: 0.13 * v }))
    if (kind === 'bad') [330, 262].forEach((f, i) => synth.voice(c, out, { type: 'triangle', freq: f, start: i * 0.2, decay: 0.5, gain: 0.14 * v }))
  } catch {}
}

// --- the company --------------------------------------------------------------------------
function Company ({ init, settings, onEnd, onQuit }) {
  const toast = useToast()
  const gRef = useRef(init)
  const [, setTick] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [modal, setModal] = useState(null) // { kind, ... }
  const [pops, setPops] = useState([])
  const speedRef = useRef(1)
  const ended = useRef(false)
  const g = gRef.current
  const rerender = () => setTick((t) => t + 1)
  const waiting = g.project?.waiting === 'alloc' || g.project?.waiting === 'release'
  speedRef.current = modal || waiting ? 0 : speed

  const save = useCallback(async () => {
    try {
      const res = await api('tycoonSave', serialize(gRef.current))
      if (res?.coins) toast({ emoji: '🪙', title: 'Royalties', text: <><Coins n={res.coins} /> for your latest book.</> })
      for (const l of res?.looks || []) toast({ emoji: '✨', title: `New look: ${l.name}`, text: 'It’s in the Shop, ready to wear.' })
      if (res) celebrate(toast, { badges: res.badges || [] })
    } catch {}
  }, [toast])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let popId = 0
    const loop = (now) => {
      const ms = SPEEDS[speedRef.current]
      acc += Math.min(500, now - last)
      last = now
      const game = gRef.current
      if (!ms || game.over) acc = 0
      let stepped = false
      const fresh = []
      while (ms > 0 && acc >= ms && !game.over) { // eslint-disable-line no-unmodified-loop-condition
        acc -= ms
        const ev = step(game)
        stepped = true
        for (const e of ev) {
          if (e.kind === 'work') {
            if (e.s > 0.05 && Math.random() < 0.4) fresh.push({ id: ++popId, who: e.who, kind: 's', n: e.s })
            if (e.c > 0.05 && Math.random() < 0.4) fresh.push({ id: ++popId, who: e.who, kind: 'c', n: e.c })
            if (e.typo > 0.6) fresh.push({ id: ++popId, who: e.who, kind: 'typo' })
            if (e.typo < -0.6) fresh.push({ id: ++popId, who: e.who, kind: 'fix' })
          }
          if (e.kind === 'stage') sfx(settings, 'stage')
          if (e.kind === 'done') sfx(settings, 'done')
          if (e.kind === 'gig') sfx(settings, 'cash')
        }
        if (game.week % 8 === 0) save()
        if (game.project?.waiting === 'alloc' || game.project?.waiting === 'release') break
      }
      if (fresh.length) setPops((p) => [...p.filter((x) => x.id > popId - 40), ...fresh])
      if (stepped) rerender()
      if (game.over && !ended.current) { ended.current = true; setTimeout(() => onEnd(game), 600) }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); save() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === ' ') { e.preventDefault(); setSpeed((s) => (s ? 0 : 1)) }
      if (e.key >= '1' && e.key <= '3') setSpeed(Number(e.key))
      if (e.key === 'Escape') setModal(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const act = (fn) => { try { fn(); rerender(); return true } catch (err) { toast({ error: true, title: 'Can’t do that', text: err.message }); return false } }
  const doPublish = () => {
    const res = publish(g)
    setModal({ kind: 'review', ...res })
    sfx(settings, 'review')
    setTimeout(() => sfx(settings, res.book.score >= 7.5 ? 'good' : res.book.score < 5 ? 'bad' : 'stage'), 1900)
    rerender()
    save()
  }
  const p = g.project
  const selling = g.books.filter((b) => b.left > 0)
  const left = Math.max(0, Math.ceil((END_WEEK - g.week) / 52))
  return (
    <div className='lx-game'>
      <div className='lx-top'>
        <div className='lx-name'><b>{g.name}</b><small>{OFFICES[g.office].name}</small></div>
        <div className='lx-date'>{dateText(g.week)}{left <= 3 && <small> · {left} year{left === 1 ? '' : 's'} to go</small>}</div>
        <span className={`lx-stat ${g.cash < 0 ? 'neg' : ''}`} title={`Wages and rent: ${money(weeklyCosts(g))} a week`}>💵 <b>{money(g.cash)}</b></span>
        <span className='lx-stat' title='Fans buy your next book'>❤️ <b>{count(g.fans)}</b></span>
        <span className='lx-stat' title='Research points'>🔬 <b>{Math.floor(g.rp)}</b></span>
        <div className='seg cw-speed' aria-label='Speed'>
          {['❚❚', '▶', '▶▶', '▶▶▶'].map((t, i) => <button key={i} className={speed === i ? 'on' : ''} onClick={() => setSpeed(i)} title={i ? `${i}× speed (${i})` : 'Pause (Space)'}>{t}</button>)}
        </div>
        <button className='btn ghost small' onClick={() => { save(); onQuit() }}>Save & quit</button>
      </div>
      <div className='lx-body'>
        <div className='lx-left'>
          <Office g={g} pops={pops} />
          <div className='lx-actions'>
            <button className='btn primary' disabled={Boolean(p || g.gig)} onClick={() => setModal({ kind: 'new' })}>📖 New book</button>
            <button className='btn' disabled={Boolean(p || g.gig)} onClick={() => setModal({ kind: 'gig' })}>🧾 Freelance</button>
            <button className='btn' onClick={() => setModal({ kind: 'research' })}>🔬 Research{researchList(g).some((x) => x.rp <= g.rp) ? ' •' : ''}</button>
            <button className='btn' onClick={() => { if (!g.candidates.length) refreshCandidates(g); setModal({ kind: 'staff' }) }}>👥 Staff ({g.staff.length}/{OFFICES[g.office].staff})</button>
            <button className='btn' onClick={() => setModal({ kind: 'office' })}>🏢 Office</button>
            <button className='btn' onClick={() => setModal({ kind: 'books' })}>📚 Books ({g.stats.books})</button>
          </div>
        </div>
        <aside className='lx-side'>
          <Project g={g} onAlloc={() => setModal({ kind: 'alloc' })} onRelease={() => setModal({ kind: 'release' })} />
          {selling.length > 0 && (
            <div className='lx-card'>
              <h4>On sale</h4>
              {selling.slice(0, 4).map((b) => <div key={b.id} className='lx-sale'><span>{b.title}</span><b>{count(b.sold)}</b><small>{b.score.toFixed(1)} · {MEDIUM[b.medium].name}</small></div>)}
            </div>
          )}
          <div className='lx-card lx-news'>
            {g.news.slice(-7).reverse().map((n, i) => <p key={g.news.length - i} className={`k-${n.kind}`}><small>{dateText(n.week)}</small>{n.text}</p>)}
          </div>
        </aside>
      </div>
      {g.cash < 0 && <div className='lx-warn'>In the red: {12 - g.negWeeks} weeks to get back above zero, or the company goes bust.</div>}
      {modal?.kind === 'new' && <NewBook g={g} onClose={() => setModal(null)} onStart={(opts) => { if (act(() => startBook(g, opts))) setModal({ kind: 'alloc' }) }} />}
      {(modal?.kind === 'alloc' || (!modal && p?.waiting === 'alloc')) && <Alloc g={g} onDone={(a) => { act(() => setAlloc(g, a)); setModal(null) }} onShelve={() => { abandonBook(g); setModal(null); rerender() }} />}
      {(modal?.kind === 'release' || (!modal && p?.waiting === 'release')) && <Release g={g} onProof={() => { act(() => proofread(g)); setModal(null); setSpeed((s) => s || 1) }} onPublish={doPublish} />}
      {modal?.kind === 'review' && <Review g={g} book={modal.book} a={modal.appraisal} onClose={() => setModal(null)} />}
      {modal?.kind === 'research' && <Research g={g} onClose={() => setModal(null)} onPick={(it) => act(() => research(g, it.kind, it.id))} />}
      {modal?.kind === 'staff' && <Staff g={g} onClose={() => setModal(null)} onHire={(i) => act(() => hire(g, i))} onFire={(id) => act(() => fire(g, id))} />}
      {modal?.kind === 'office' && <OfficeDlg g={g} onClose={() => setModal(null)} onMove={() => act(() => moveOffice(g))} />}
      {modal?.kind === 'gig' && <Gigs g={g} onClose={() => setModal(null)} onTake={(i) => { if (act(() => takeGig(g, i))) setModal(null) }} />}
      {modal?.kind === 'books' && <Books g={g} onClose={() => setModal(null)} />}
      {g.over && <div className='cw-over lx-over'><b>{g.over.why === 'retired' ? `${END_YEAR + 1}. Time to retire.` : 'The bank has taken the typewriter.'}</b></div>}
    </div>
  )
}

// The office: desks, people at them, and what they're producing.
function Office ({ g, pops }) {
  const lvl = g.office
  const W = 640
  const H = 360
  const cols = [1, 2, 4, 4][lvl]
  const rows = [1, 2, 2, 3][lvl]
  const desks = OFFICES[lvl].staff
  const busy = g.project && (g.project.waiting === null || g.project.waiting === 'proofing')
  const slot = (i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    const x = W * (0.12 + (0.76 * (c + 0.5)) / cols)
    const yy = rows > 1 ? 205 + r * (122 / (rows - 1)) : 260
    return [x, yy]
  }
  const scale = [1.1, 1, 0.8, 0.68][lvl]
  return (
    <div className={`lx-office lvl-${lvl}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role='img' aria-label={OFFICES[lvl].name}>
        <rect className='wall' x={0} y={0} width={W} height={150} />
        <rect className='floor' x={0} y={150} width={W} height={H - 150} />
        {lvl === 0 && <><rect className='door' x={20} y={30} width={160} height={120} rx={4} /><g className='door-lines'>{[0, 1, 2, 3, 4, 5].map((i) => <line key={i} x1={20} x2={180} y1={50 + i * 18} y2={50 + i * 18} />)}</g><rect className='shelf' x={470} y={60} width={140} height={90} /></>}
        {lvl >= 1 && <><rect className='window' x={40} y={24} width={lvl >= 3 ? 560 : 150} height={90} rx={4} />{lvl >= 3 && <g className='skyline'>{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => <rect key={i} x={50 + i * 55} y={60 + ((i * 37) % 40)} width={40} height={54 - ((i * 37) % 40)} />)}</g>}</>}
        {lvl >= 1 && lvl < 3 && <><rect className='shelf' x={230} y={40} width={lvl >= 2 ? 360 : 180} height={100} />{Array.from({ length: lvl >= 2 ? 30 : 15 }, (_, i) => <rect key={i} className='book' x={236 + (i % 15) * 11.5 + (i >= 15 ? 180 : 0)} y={i % 2 ? 50 : 96} width={9} height={36} style={{ '--h': (i * 47) % 360 }} />)}</>}
        {lvl === 0 && Array.from({ length: 10 }, (_, i) => <rect key={i} className='book' x={476 + i * 13} y={i % 2 ? 70 : 108} width={10} height={34} style={{ '--h': (i * 61) % 360 }} />)}
        {Array.from({ length: desks }, (_, i) => {
          const [x, yy] = slot(i)
          const person = g.staff[i]
          return (
            <g key={i} transform={`translate(${x}, ${yy}) scale(${scale})`} className={`desk ${person ? '' : 'empty'} ${busy && person ? 'busy' : ''}`}>
              {person && (
                <g className='person' style={{ '--pc': ROLE_COLOR[person.role] }}>
                  <circle cx={0} cy={-34} r={11} className='head' />
                  <path d='M-15 -6 Q-15 -22 0 -22 Q15 -22 15 -6 Z' className='body' />
                  <text y={-30} className='initial'>{person.name[0]}</text>
                </g>
              )}
              <rect x={-36} y={-8} width={72} height={10} rx={2} className='top' />
              <rect x={-32} y={2} width={4} height={22} className='leg' />
              <rect x={28} y={2} width={4} height={22} className='leg' />
              {person && <rect x={-12} y={-20} width={24} height={13} rx={2} className={`machine ${g.office >= 1 && year(g) >= 1990 ? 'pc' : 'type'}`} />}
              {person && <text y={34} className='label'>{person.founder ? 'You' : person.name.split(' ')[0]}</text>}
            </g>
          )
        })}
        {pops.map((p) => {
          const i = g.staff.findIndex((x) => x.id === p.who)
          if (i < 0) return null
          const [x, yy] = slot(i)
          return <text key={p.id} className={`pop k-${p.kind}`} x={x + ((p.id * 13) % 30) - 15} y={yy - 50 * scale}>{p.kind === 's' ? 'S' : p.kind === 'c' ? 'C' : p.kind === 'typo' ? 'typo!' : '✓'}</text>
        })}
      </svg>
    </div>
  )
}

function Project ({ g, onAlloc, onRelease }) {
  const p = g.project
  if (g.gig) {
    return (
      <div className='lx-card'>
        <h4>Freelance</h4>
        <p className='lx-gig'>{g.gig.name}</p>
        <div className='lx-prog'><i style={{ width: `${(1 - g.gig.left / g.gig.weeks) * 100}%` }} /></div>
        <small className='lx-dim'>{g.gig.left} week{g.gig.left === 1 ? '' : 's'} left · {money(g.gig.pay)}</small>
      </div>
    )
  }
  if (!p) return <div className='lx-card lx-idle'><h4>Nothing on the desk</h4><p className='lx-dim'>Start a new book, or take a freelance job for some cash and research.</p></div>
  const total = p.stageWeeks * 3
  const done = p.stage * p.stageWeeks + p.inStage
  return (
    <div className='lx-card'>
      <h4>{p.title}</h4>
      <small className='lx-dim'>{SIZE[p.size].name} · {SUBJECT[p.subject].name} · {FORMAT[p.format].name} · {MEDIUM[p.medium].name}</small>
      <div className='lx-stages'>{STAGES.map((s, i) => <span key={s.id} className={i < p.stage || p.waiting === 'release' || p.waiting === 'proofing' ? 'done' : i === p.stage ? 'on' : ''}>{s.name}</span>)}</div>
      <div className='lx-prog'><i style={{ width: `${(Math.min(total, done) / total) * 100}%` }} /></div>
      <div className='lx-points'>
        <span className='s'>Scholarship <b>{Math.round(p.s)}</b></span>
        <span className='c'>Charm <b>{Math.round(p.c)}</b></span>
        <span className='t'>Typos <b>{Math.round(p.typos)}</b></span>
      </div>
      {p.waiting === 'alloc' && <button className='btn primary' onClick={onAlloc}>Plan {STAGES[p.stage].name.toLowerCase()}</button>}
      {p.waiting === 'release' && <button className='btn primary' onClick={onRelease}>It’s ready</button>}
      {p.waiting === 'proofing' && <small className='lx-dim'>One more week of proofreading…</small>}
    </div>
  )
}

// --- dialogs ------------------------------------------------------------------------------
function Dialog ({ title, children, onClose, wide }) {
  return (
    <div className='cw-panel-wrap' onClick={onClose || undefined}>
      <div className={`cw-panel lx-dialog ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()} role='dialog' aria-label={title}>
        <div className='lx-dlg-head'><h3>{title}</h3>{onClose && <button className='btn ghost small' onClick={onClose}>Close (Esc)</button>}</div>
        {children}
      </div>
    </div>
  )
}

// "picture dictionary" → "picture dictionaries", "thesaurus" → "thesauruses".
const plural = (w) => (/[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : /(s|x|ch|sh)$/.test(w) ? `${w}es` : `${w}s`)
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1)
function titleIdeas (g, subject, format) {
  const S = SUBJECT[subject].name
  const F = FORMAT[format].name
  const words = g.words.length ? g.words : ['word']
  const w = () => cap(words[Math.floor(Math.random() * words.length)])
  return [
    `The ${S} ${F}`,
    `${w()}! A ${S} ${F}`,
    `${g.name.replace(/\.$/, '')} ${F} of ${S}`,
    `From ${w()} to ${w()}`,
    `The ${w()} Book of ${S}`,
    `${S}, Explained`
  ]
}

function NewBook ({ g, onClose, onStart }) {
  const y = year(g)
  const subjects = SUBJECTS.filter((x) => g.known.subjects.includes(x.id))
  const formats = FORMATS.filter((x) => g.known.formats.includes(x.id))
  const media = openMedia(g)
  const [subject, setSubject] = useState(g.last && subjects.length > 1 ? subjects.find((x) => x.id !== g.last.subject).id : subjects[0].id)
  const [format, setFormat] = useState(formats[0].id)
  const [medium, setMedium] = useState(media[0].id)
  const [size, setSize] = useState('small')
  const [features, setFeatures] = useState([])
  const ideas = useMemo(() => titleIdeas(g, subject, format), [g, subject, format])
  const [title, setTitle] = useState('')
  const [touched, setTouched] = useState(false)
  useEffect(() => { if (!touched) setTitle(ideas[0]) }, [ideas, touched])
  const usable = features.filter((f) => featureFits(f, medium, y))
  const opts = { title, subject, format, medium, size, features: usable }
  const why = canMake(g, opts)
  const cost = why ? 0 : bookCost(g, opts)
  const sf = knownFit(g, subject, format)
  const mf = knownMFit(g, medium, format)
  const repeat = g.last && g.last.subject === subject && g.last.format === format
  return (
    <Dialog title='A new book' onClose={onClose} wide>
      <div className='lx-title'>
        <input className='field' value={title} maxLength={60} onChange={(e) => { setTitle(e.target.value); setTouched(true) }} />
        <button className='btn small ghost' onClick={() => { setTitle(ideas[1 + Math.floor(Math.random() * (ideas.length - 1))]); setTouched(true) }} title='Another title'>↻</button>
      </div>
      <h4 className='lx-h'>Subject</h4>
      <div className='lx-chips'>{subjects.map((x) => { const fit = knownFit(g, x.id, format); return <button key={x.id} className={`lx-chip ${subject === x.id ? 'on' : ''} ${g.trend?.subject === x.id ? 'trend' : ''}`} onClick={() => setSubject(x.id)} title={x.blurb}>{x.name}{fit && <i className={`fit-${fit}`}>{FIT_MARK[fit]}</i>}{g.trend?.subject === x.id && <i>🔥</i>}</button> })}</div>
      <h4 className='lx-h'>Format</h4>
      <div className='lx-chips'>{formats.map((x) => { const fit = knownFit(g, subject, x.id); return <button key={x.id} className={`lx-chip ${format === x.id ? 'on' : ''}`} onClick={() => setFormat(x.id)} title={x.blurb}>{x.name}{fit && <i className={`fit-${fit}`}>{FIT_MARK[fit]}</i>}</button> })}</div>
      <h4 className='lx-h'>Medium</h4>
      <div className='lx-chips'>{media.map((x) => { const fit = knownMFit(g, x.id, format); return <button key={x.id} className={`lx-chip ${medium === x.id ? 'on' : ''}`} onClick={() => setMedium(x.id)} title={`${x.blurb} About ${marketSize(x.id, y).toFixed(1)} million readers.${x.licence ? ` Licence ${money(x.licence)}.` : ''}`}>{x.name}<small>{marketSize(x.id, y).toFixed(1)}M</small>{fit && <i className={`fit-${fit}`}>{FIT_MARK[fit]}</i>}</button> })}</div>
      <h4 className='lx-h'>Size</h4>
      <div className='lx-chips'>{SIZES.map((x) => <button key={x.id} className={`lx-chip ${size === x.id ? 'on' : ''}`} disabled={x.office > g.office} onClick={() => setSize(x.id)} title={x.blurb}>{x.name}<small>{x.weeks} wk</small></button>)}</div>
      {g.known.features.length > 0 && (
        <>
          <h4 className='lx-h'>Features</h4>
          <div className='lx-chips'>{FEATURES.filter((f) => g.known.features.includes(f.id)).map((f) => { const ok = featureFits(f.id, medium, y); return <button key={f.id} className={`lx-chip ${usable.includes(f.id) ? 'on' : ''}`} disabled={!ok} onClick={() => setFeatures((a) => (a.includes(f.id) ? a.filter((x) => x !== f.id) : [...a, f.id]))} title={f.blurb}>{f.name}</button> })}</div>
        </>
      )}
      <div className='lx-know'>
        {sf ? <span>{SUBJECT[subject].name} and {plural(FORMAT[format].name.toLowerCase())}: <b className={`fit-${sf}`}>{FIT_TEXT[sf]}</b></span> : <span>You don’t know yet how {SUBJECT[subject].name.toLowerCase()} suits a {FORMAT[format].name.toLowerCase()}.</span>}
        {mf ? <span>{cap(plural(FORMAT[format].name.toLowerCase()))} on {MEDIUM[medium].name.toLowerCase()}: <b className={`fit-${mf}`}>{FIT_TEXT[mf]}</b></span> : <span>Untried on {MEDIUM[medium].name.toLowerCase()}.</span>}
        {repeat && <span className='warn'>Readers have just had one of these.</span>}
      </div>
      <div className='lx-foot'>
        <span className='lx-dim'>{why || <>Costs <b>{money(cost)}</b>{MEDIUM[medium].licence ? ` (licence ${money(MEDIUM[medium].licence)})` : ''}, about {SIZE[size].weeks} weeks</>}</span>
        <button className='btn primary' disabled={Boolean(why) || cost > g.cash} onClick={() => onStart(opts)}>{cost > g.cash ? 'Can’t afford it' : 'Start writing'}</button>
      </div>
    </Dialog>
  )
}

function Alloc ({ g, onDone, onShelve }) {
  const p = g.project
  const stage = STAGES[p.stage]
  const prev = p.alloc[p.stage]
  const [vals, setVals] = useState(() => (prev ? prev.map((x) => Math.round(x * 100)) : [50, 50, 50]))
  const total = vals.reduce((a, b) => a + b, 0) || 1
  const hints = g.known.hints[p.format] || {}
  return (
    <Dialog title={`${stage.name}: ${p.title}`}>
      <p className='wl-note'>{stage.blurb} Split the team’s time between these three. What matters depends on the format; you learn more with every {FORMAT[p.format].name.toLowerCase()} you publish.</p>
      <div className='lx-sliders'>
        {stage.areas.map((area, i) => (
          <label key={area} className='lx-slider'>
            <span><b>{AREAS[area].name}</b><small>{AREAS[area].blurb}{AREAS[area].s >= 0.6 ? ' Mostly scholarship.' : AREAS[area].s <= 0.35 ? ' Mostly charm.' : ''}</small></span>
            <input type='range' min={0} max={100} value={vals[i]} onChange={(e) => setVals((v) => v.map((x, j) => (j === i ? Number(e.target.value) : x)))} />
            <em>{Math.round((vals[i] / total) * 100)}%</em>
            {hints[area] && <i className={`hint-${hints[area]}`}>{hints[area] === 'high' ? 'matters a lot' : hints[area] === 'low' ? 'matters little' : 'matters some'}</i>}
          </label>
        ))}
      </div>
      <div className='lx-foot'>
        {p.stage === 0 ? <button className='btn ghost small' onClick={onShelve}>Shelve it</button> : <span />}
        <button className='btn primary' onClick={() => onDone(vals)}>Get to work</button>
      </div>
    </Dialog>
  )
}

function Release ({ g, onProof, onPublish }) {
  const p = g.project
  return (
    <Dialog title={`“${p.title}” is finished`}>
      <div className='lx-points big'>
        <span className='s'>Scholarship <b>{Math.round(p.s)}</b></span>
        <span className='c'>Charm <b>{Math.round(p.c)}</b></span>
        <span className='t'>Typos left <b>{Math.round(p.typos)}</b></span>
      </div>
      <p className='wl-note'>Another week of proofreading catches more typos, but adds little else. Or send it to the printers.</p>
      <div className='lx-foot'>
        <button className='btn' onClick={onProof} disabled={p.typos < 1}>Proofread another week</button>
        <button className='btn primary' onClick={onPublish}>Publish</button>
      </div>
    </Dialog>
  )
}

function Review ({ g, book, a, onClose }) {
  const notes = []
  const F = FORMAT[book.format].name.toLowerCase()
  const Fs = plural(F)
  if (a.sf === 'great') notes.push(`${SUBJECT[book.subject].name} and ${Fs} go beautifully together.`)
  if (a.sf === 'poor') notes.push(`Readers didn’t see why a ${F} about ${SUBJECT[book.subject].name.toLowerCase()} should exist.`)
  if (a.mf === 'great') notes.push(`${MEDIUM[book.medium].name} suits a ${F}.`)
  if (a.mf === 'poor') notes.push(`A ${F} doesn’t work well as a ${MEDIUM[book.medium].name.toLowerCase()}.`)
  if (a.ratio > FORMAT[book.format].ratio + 0.1) notes.push(`Too scholarly for a ${F}: more charm next time.`)
  if (a.ratio < FORMAT[book.format].ratio - 0.1) notes.push(`Too light for a ${F}: more scholarship next time.`)
  if (a.split < 0.85) notes.push('The team’s time went into the wrong places.')
  if (a.typos < 0.88) notes.push('Readers found a lot of typos.')
  if (a.repeat < 1) notes.push('Readers felt they’d seen this before.')
  if (a.missing < 1) notes.push('Readers expected features it didn’t have.')
  if (a.q < 0.92) notes.push('It isn’t as good as readers now expect. More (and better) staff would help.')
  if (a.q > 1.12) notes.push('Your best work yet.')
  const hints = g.known.hints[book.format] || {}
  return (
    <Dialog title={`Reviews: ${book.title}`} onClose={onClose}>
      <div className='lx-reviews'>
        {book.reviews.map((r, i) => (
          <div key={r.by} className='lx-review' style={{ '--d': `${i * 0.45}s` }}>
            <b className={`sc ${r.score >= 8 ? 'hi' : r.score <= 4 ? 'lo' : ''}`}>{r.score}</b>
            <span>“{r.line}”</span>
            <small>{r.by}</small>
          </div>
        ))}
      </div>
      <div className='lx-avg' style={{ '--d': '1.9s' }}>Average <b>{book.score.toFixed(1)}</b></div>
      <ul className='lx-notes' style={{ '--d': '2.1s' }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      <p className='wl-note lx-learn' style={{ '--d': '2.1s' }}>What you know about {Fs}, so far: {Object.entries(hints).map(([k, x]) => `${AREAS[k].name.toLowerCase()} (${x === 'high' ? 'a lot' : x === 'low' ? 'very little' : 'somewhat'})`).join(', ')}.</p>
      <div className='lx-foot'><span className='lx-dim'>About {count(book.units)} readers will buy it over the coming months.</span><button className='btn primary' onClick={onClose}>Back to work</button></div>
    </Dialog>
  )
}

function Research ({ g, onClose, onPick }) {
  const list = researchList(g)
  const groups = [['subject', 'Subjects'], ['format', 'Formats'], ['feature', 'Features']]
  return (
    <Dialog title={`Research · 🔬 ${Math.floor(g.rp)} points`} onClose={onClose} wide>
      <p className='wl-note'>Research points come from writing books and freelance work.</p>
      {groups.map(([k, label]) => {
        const items = list.filter((x) => x.kind === k)
        if (!items.length) return null
        return (
          <div key={k}>
            <h4 className='lx-h'>{label}</h4>
            <div className='lx-research'>{items.map((it) => <button key={it.id} className='lx-ritem' disabled={g.rp < it.rp} onClick={() => onPick(it)}><b>{it.name}</b><small>{it.blurb}</small><em>🔬 {it.rp}</em></button>)}</div>
          </div>
        )
      })}
      {!list.length && <p className='wl-note'>Nothing new to research right now.</p>}
    </Dialog>
  )
}

function Staff ({ g, onClose, onHire, onFire }) {
  const full = g.staff.length >= OFFICES[g.office].staff
  return (
    <Dialog title={`Staff · ${g.staff.length} of ${OFFICES[g.office].staff} desks`} onClose={onClose} wide>
      <div className='lx-people'>
        {g.staff.map((p) => (
          <div key={p.id} className='lx-person'>
            <span className='lx-face' style={{ '--pc': ROLE_COLOR[p.role] }}>{p.name[0]}</span>
            <div><b>{p.founder ? `${p.name} (you)` : p.name}</b><small>{p.founder ? 'Founder' : ROLE[p.role].name} · scholarship {(p.s * skill(p)).toFixed(1)} · charm {(p.c * skill(p)).toFixed(1)}{p.salary ? ` · ${money(p.salary)}/wk` : ''}</small></div>
            {!p.founder && <button className='btn ghost small' onClick={() => onFire(p.id)}>Let go</button>}
          </div>
        ))}
      </div>
      <h4 className='lx-h'>Looking for work</h4>
      {g.office === 0
        ? <p className='wl-note'>There’s only room for you in the garage. Move into an office to hire.</p>
        : (
          <div className='lx-people'>
            {g.candidates.map((c, i) => (
              <div key={i} className='lx-person'>
                <span className='lx-face' style={{ '--pc': ROLE_COLOR[c.role] }}>{c.name[0]}</span>
                <div><b>{c.name}</b><small>{ROLE[c.role].name} · scholarship {c.s.toFixed(1)} · charm {c.c.toFixed(1)} · {money(c.salary)}/wk</small></div>
                <button className='btn small' disabled={full || g.cash < hireFee(c)} onClick={() => onHire(i)}>Hire · {money(hireFee(c))}</button>
              </div>
            ))}
            {!g.candidates.length && <p className='wl-note'>Nobody new right now. More people look for work every six months.</p>}
          </div>
          )}
    </Dialog>
  )
}

function OfficeDlg ({ g, onClose, onMove }) {
  const next = OFFICES[g.office + 1]
  return (
    <Dialog title='Offices' onClose={onClose}>
      <div className='lx-offices'>
        {OFFICES.map((o, i) => <div key={o.id} className={`lx-off ${i === g.office ? 'on' : i < g.office ? 'past' : ''}`}><b>{o.name}</b><small>{o.blurb}</small><span>{o.staff} desk{o.staff === 1 ? '' : 's'} · {o.rent ? `${money(o.rent)}/wk rent` : 'no rent'}{o.cost ? ` · ${money(o.cost)} to move` : ''}</span></div>)}
      </div>
      <div className='lx-foot'>
        <span className='lx-dim'>{next ? (g.project ? 'Finish the book you’re on before moving.' : `Moving costs ${money(next.cost)}.`) : 'You’re at the top.'}</span>
        {next && <button className='btn primary' disabled={Boolean(g.project) || g.cash < next.cost} onClick={onMove}>Move to {next.name.replace(/^A /, 'a ')}</button>}
      </div>
    </Dialog>
  )
}

function Gigs ({ g, onClose, onTake }) {
  return (
    <Dialog title='Freelance work' onClose={onClose}>
      <p className='wl-note'>Small jobs for other people: a little cash and research, and nobody reviews them.</p>
      <div className='lx-research'>{g.gigs.map((x, i) => <button key={i} className='lx-ritem' onClick={() => onTake(i)}><b>{x.name}</b><small>{x.weeks} week{x.weeks === 1 ? '' : 's'}{x.rp ? ` · 🔬 ${x.rp}` : ''}</small><em>{money(x.pay)}</em></button>)}</div>
    </Dialog>
  )
}

function Books ({ g, onClose }) {
  return (
    <Dialog title='Everything you’ve published' onClose={onClose} wide>
      {g.books.length
        ? (
          <table className='lx-table'>
            <thead><tr><th>Title</th><th>Year</th><th>Subject</th><th>Format</th><th>Medium</th><th>Score</th><th>Sold</th><th>Profit</th></tr></thead>
            <tbody>{g.books.map((b) => <tr key={b.id}><td>{b.title}</td><td>{START_YEAR + Math.floor(b.week / 52)}</td><td>{SUBJECT[b.subject].name}</td><td>{FORMAT[b.format].name}</td><td>{MEDIUM[b.medium].name}</td><td className={b.score >= 8 ? 'hi' : b.score < 5 ? 'lo' : ''}>{b.score.toFixed(1)}</td><td>{count(b.sold)}{b.left ? '…' : ''}</td><td className={b.revenue - b.cost < 0 ? 'lo' : ''}>{money(b.revenue - b.cost)}</td></tr>)}</tbody>
          </table>
          )
        : <p className='wl-note'>Nothing yet.</p>}
    </Dialog>
  )
}

function Retired ({ ending, onMenu }) {
  const { g, res } = ending
  const retired = g.over?.why === 'retired'
  const best = g.books.reduce((x, b) => (!x || b.score > x.score ? b : x), null)
  const seller = g.books.reduce((x, b) => (!x || b.sold > x.sold ? b : x), null)
  return (
    <div className='page cw-end'>
      <div className={`cw-entry ${retired ? 'won' : ''}`}>
        <h1>{g.name}</h1>
        <p className='cw-entry-pos'><i>{retired ? `${START_YEAR}–${END_YEAR}` : `${START_YEAR}–${year(g)}`}</i> {retired ? 'a dictionary publisher, now retired.' : 'a dictionary publisher, now bankrupt.'}</p>
        <p>{g.stats.books} book{g.stats.books === 1 ? '' : 's'} published, {money(g.cash)} in the bank at the end, {count(g.fans)} fans.{best ? ` Best reviewed: “${best.title}” (${best.score.toFixed(1)}).` : ''}{seller && seller.sold ? ` Best seller: “${seller.title}”, ${count(seller.sold)} copies.` : ''}</p>
      </div>
      {res && <div className='cw-reward'>{res.coins > 0 && <span><Coins n={res.coins} />{res.pension ? ' including your pension' : ''}</span>}{(res.looks || []).map((l) => <span key={l.id}>✨ New look: {l.name}</span>)}</div>}
      <button className='btn primary big' onClick={onMenu}>Done</button>
    </div>
  )
}
