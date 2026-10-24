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

// The office: an illustrated room that grows with the company. Desks with
// the machines of the day (typewriters, beige CRTs, flat screens, laptops),
// the people at them, the books you've published on the shelf, your best
// review framed on the wall, and the year on the calendar.
const SKIN = ['#f2d0b0', '#e8b890', '#c8906a', '#a06a48', '#7a4a30', '#f6dcc4']
const HAIR = ['#2a1e16', '#5a3a22', '#8a5a2a', '#c8963a', '#e8c878', '#9a9a9a', '#b83a2a', '#1a1a1a']
const SUBJECT_HUE = Object.fromEntries(SUBJECTS.map((x, i) => [x.id, (i * 47) % 360]))
const hashId = (n) => { let h = Math.imul(n | 0, 2654435761) >>> 0; h = (h ^ (h >>> 13)) >>> 0; return h }

function Person ({ p, busy }) {
  const h = hashId(p.id + 7)
  const skin = SKIN[h % SKIN.length]
  const hair = HAIR[(h >> 4) % HAIR.length]
  const style = (h >> 8) % 4
  const shirt = ROLE_COLOR[p.role]
  return (
    <g className={`lx-person ${busy ? 'busy' : ''}`}>
      <path d='M-17 -14 Q-17 -34 0 -34 Q17 -34 17 -14 Z' fill={shirt} />
      <path d='M-6 -34 L0 -28 L6 -34 Z' fill='#fff' opacity='.7' />
      <rect x={-3.5} y={-38} width={7} height={6} fill={skin} />
      <g className='lx-arms'>
        <path d='M-16 -24 Q-20 -12 -12 -8' stroke={shirt} strokeWidth={6} fill='none' strokeLinecap='round' />
        <path d='M16 -24 Q20 -12 12 -8' stroke={shirt} strokeWidth={6} fill='none' strokeLinecap='round' />
        <circle cx={-11} cy={-8} r={3} fill={skin} /><circle cx={11} cy={-8} r={3} fill={skin} />
      </g>
      {style === 2 && <path d='M-12 -50 Q-14 -34 -10 -30 L10 -30 Q14 -34 12 -50 Z' fill={hair} />}
      <ellipse cx={0} cy={-47} rx={10} ry={11} fill={skin} />
      {style === 0 && <path d='M-10 -49 Q-10 -60 0 -60 Q10 -60 10 -49 Q6 -54 0 -53 Q-6 -54 -10 -49 Z' fill={hair} />}
      {style === 1 && <path d='M-11 -46 Q-12 -61 0 -61 Q12 -61 11 -46 L9 -50 Q0 -56 -9 -50 Z' fill={hair} />}
      {style === 2 && <path d='M-10 -48 Q-11 -60 0 -60 Q11 -60 10 -48 Q4 -55 -4 -53 Z' fill={hair} />}
      {style === 3 && <><path d='M-10 -50 Q-9 -59 0 -59 Q9 -59 10 -50 Q0 -55 -10 -50 Z' fill={hair} /><circle cx={0} cy={-62} r={5} fill={hair} /></>}
      <circle cx={-3.5} cy={-46} r={1.3} fill='#2a2030' /><circle cx={3.5} cy={-46} r={1.3} fill='#2a2030' />
      <path d='M-2.5 -41.5 Q0 -40 2.5 -41.5' stroke='#7a4a3a' strokeWidth={1} fill='none' strokeLinecap='round' />
    </g>
  )
}

function Machine ({ yr, busy }) {
  if (yr < 1990) {
    return (
      <g className='lx-machine'>
        <rect x={-15} y={-30} width={30} height={14} rx={1} fill='#f6f2e8' />
        <rect x={-19} y={-18} width={38} height={12} rx={3} fill='#3a3a40' />
        <rect x={-15} y={-12} width={30} height={4} rx={1} fill='#5a5a62' />
        <rect x={-22} y={-20} width={44} height={3} rx={1.5} fill='#2a2a30' />
      </g>
    )
  }
  if (yr < 2000) {
    return (
      <g className='lx-machine'>
        <rect x={-16} y={-36} width={32} height={28} rx={3} fill='#e2dccb' />
        <rect x={-12} y={-32} width={24} height={18} rx={2} className={busy ? 'lx-screen on' : 'lx-screen'} />
        <rect x={-8} y={-8} width={16} height={3} fill='#cfc8b4' />
        <rect x={-18} y={-5} width={36} height={4} rx={1} fill='#d8d2c0' />
      </g>
    )
  }
  if (yr < 2015) {
    return (
      <g className='lx-machine'>
        <rect x={-18} y={-38} width={36} height={23} rx={2} fill='#2a2c34' />
        <rect x={-16} y={-36} width={32} height={19} rx={1} className={busy ? 'lx-screen on' : 'lx-screen'} />
        <rect x={-2} y={-15} width={4} height={8} fill='#3a3c44' />
        <rect x={-9} y={-8} width={18} height={2.5} rx={1} fill='#3a3c44' />
        <rect x={-14} y={-4} width={28} height={3} rx={1} fill='#e8e8ec' />
      </g>
    )
  }
  return (
    <g className='lx-machine'>
      <path d='M-15 -6 L-12 -26 L12 -26 L15 -6 Z' fill='#b8bcc6' />
      <path d='M-13 -8 L-10.5 -24 L10.5 -24 L13 -8 Z' className={busy ? 'lx-screen on' : 'lx-screen'} />
      <rect x={-18} y={-6} width={36} height={3} rx={1.5} fill='#d8dce4' />
      <rect x={22} y={-14} width={7} height={11} rx={1.5} fill='#2a2c34' />
    </g>
  )
}

function Desk ({ x, y, s, person, yr, busy, lvl, papers }) {
  const wood = ['#9a6a3a', '#8a5a32', '#6a3a1e', '#e8e8ec'][lvl]
  const front = ['#7a5028', '#6a4224', '#4a2612', '#c8ccd4'][lvl]
  return (
    <g transform={`translate(${x}, ${y}) scale(${s})`} className={`lx-desk ${person ? '' : 'empty'}`}>
      <ellipse cx={0} cy={40} rx={64} ry={7} fill='rgba(0,0,0,.18)' />
      {person && <rect x={-18} y={-50} width={36} height={44} rx={8} fill='#3a3a48' />}
      {person && <Person p={person} busy={busy} />}
      <path d='M-56 -6 L56 -6 L60 2 L-60 2 Z' fill={wood} />
      <rect x={-58} y={2} width={116} height={34} rx={2} fill={front} />
      <rect x={20} y={8} width={32} height={10} rx={1.5} fill='rgba(255,255,255,.08)' stroke='rgba(0,0,0,.2)' />
      <rect x={20} y={21} width={32} height={10} rx={1.5} fill='rgba(255,255,255,.08)' stroke='rgba(0,0,0,.2)' />
      <circle cx={36} cy={13} r={1.4} fill='#d8b860' /><circle cx={36} cy={26} r={1.4} fill='#d8b860' />
      {person && <g transform={yr < 1990 ? 'translate(0, -6)' : 'translate(-30, -6) scale(.95)'}><Machine yr={yr} busy={busy} /></g>}
      {person && papers > 0 && <g transform={yr < 1990 ? 'translate(-44, -6)' : 'translate(14, -6)'}>{Array.from({ length: papers }, (_, i) => <rect key={i} x={-7 + (i % 2)} y={-3 - i * 2.2} width={15} height={2.4} fill={i % 2 ? '#f4efe4' : '#fffaf0'} stroke='#d8ccb4' strokeWidth={0.4} />)}</g>}
      {person && <g transform='translate(42, -6)'><rect x={-4} y={-9} width={8} height={9} rx={1.5} fill={['#c84a3a', '#3a7ad0', '#e8b830', '#3aa070'][hashId(person.id) % 4]} /><path d='M4 -7 Q8 -5 4 -3' stroke='#888' fill='none' strokeWidth={1.2} /></g>}
      {person && <text y={50} className='lx-label'>{person.founder ? 'You' : person.name.split(' ')[0]}</text>}
    </g>
  )
}

function Office ({ g, pops }) {
  const lvl = g.office
  const yr = year(g)
  const W = 640
  const H = 360
  const busy = Boolean(g.project && (g.project.waiting === null || g.project.waiting === 'proofing'))
  const rows = [1, 2, 2, 3][lvl]
  const cols = [1, 2, 4, 4][lvl]
  const desks = OFFICES[lvl].staff
  const p = g.project
  const papers = p ? Math.min(6, Math.round(((p.stage * p.stageWeeks + p.inStage) / (p.stageWeeks * 3)) * 6)) : 0
  const slot = (i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    const depth = rows > 1 ? r / (rows - 1) : 1
    const s = [1.15, 0.92, 0.72, 0.6][lvl] * (0.82 + 0.18 * depth)
    const spread = (cols === 1 ? 0 : 330 + depth * 150) * (lvl >= 2 ? 1.05 : 0.9)
    const x = W / 2 + (cols === 1 ? 0 : (c / (cols - 1) - 0.5) * spread)
    const y = rows > 1 ? 248 + depth * 58 : 272
    return { x, y, s }
  }
  const books = g.books.slice(0, 44).reverse()
  const best = g.books.reduce((x, b) => (!x || b.score > x.score ? b : x), null)
  const sky = yr < 2000 ? ['#9fd0f0', '#e8f4fc'] : yr < 2015 ? ['#88c0ec', '#dcefff'] : ['#f0a070', '#fcd8a8']
  const walls = ['#a8a49c', '#e8dcc4', '#b98a5a', '#dfe6ee'][lvl]
  return (
    <div className={`lx-office lvl-${lvl}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role='img' aria-label={OFFICES[lvl].name}>
        <defs>
          <linearGradient id='lx-sky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stopColor={sky[0]} /><stop offset='1' stopColor={sky[1]} /></linearGradient>
          <linearGradient id='lx-floor' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stopColor='rgba(0,0,0,.18)' /><stop offset='.4' stopColor='rgba(0,0,0,0)' /></linearGradient>
          <pattern id='lx-paper' width='14' height='14' patternUnits='userSpaceOnUse'><rect width='14' height='14' fill={walls} /><path d='M0 7 H14' stroke='rgba(0,0,0,.05)' /></pattern>
          <pattern id='lx-panel' width='60' height='200' patternUnits='userSpaceOnUse'><rect width='60' height='200' fill={walls} /><rect x='4' y='10' width='52' height='70' rx='3' fill='none' stroke='rgba(0,0,0,.14)' strokeWidth='2' /><rect x='4' y='96' width='52' height='90' rx='3' fill='none' stroke='rgba(0,0,0,.14)' strokeWidth='2' /></pattern>
          <pattern id='lx-blocks' width='40' height='20' patternUnits='userSpaceOnUse'><rect width='40' height='20' fill={walls} /><path d='M0 19.5 H40 M20 0 V10 M0 10 H40 M40 10 V20' stroke='rgba(0,0,0,.09)' fill='none' /></pattern>
        </defs>
        {/* The wall. */}
        <rect x={0} y={0} width={W} height={210} fill={lvl === 0 ? 'url(#lx-blocks)' : lvl === 2 ? 'url(#lx-panel)' : 'url(#lx-paper)'} />
        {lvl === 1 && <rect x={0} y={150} width={W} height={60} fill='#c8b896' opacity='.45' />}
        {lvl === 0 && (
          <g>
            <rect x={24} y={30} width={190} height={180} rx={3} fill='#c8c4bc' stroke='#8a867e' strokeWidth={4} />
            {Array.from({ length: 9 }, (_, i) => <rect key={i} x={28} y={36 + i * 19} width={182} height={15} fill={i % 2 ? '#bab6ae' : '#d0ccc4'} />)}
            <rect x={110} y={196} width={18} height={6} rx={2} fill='#6a665e' />
            <rect x={470} y={34} width={140} height={84} rx={2} fill='#c8a878' />
            {Array.from({ length: 30 }, (_, i) => <circle key={i} cx={480 + (i % 10) * 13} cy={44 + Math.floor(i / 10) * 13} r={1.6} fill='#8a6a42' />)}
            <path d='M500 60 l10 30 M540 54 l0 34 M575 58 l-8 30' stroke='#5a5a62' strokeWidth={4} strokeLinecap='round' />
            <path d='M260 0 V40' stroke='#3a3a40' strokeWidth={2} /><path d='M248 40 h24 l-6 12 h-12 Z' fill='#3a3a40' /><ellipse cx={260} cy={56} rx={20} ry={8} fill='#fff6c8' opacity={busy ? 0.55 : 0.25} />
          </g>
        )}
        {lvl >= 1 && (
          <g>
            <rect x={lvl === 3 ? 20 : 30} y={22} width={lvl === 3 ? 600 : 170} height={lvl === 3 ? 150 : 110} rx={4} fill='url(#lx-sky)' stroke={lvl === 3 ? '#9aa6b4' : '#fff'} strokeWidth={lvl === 3 ? 4 : 7} />
            {lvl === 3 && <g fill='#6a7c94' opacity='.85'>{Array.from({ length: 14 }, (_, i) => { const h = 40 + ((i * 53) % 70); return <rect key={i} x={26 + i * 43} y={168 - h} width={36} height={h} /> })}</g>}
            {lvl === 3 && <g fill='#fff8d0' opacity='.6'>{Array.from({ length: 60 }, (_, i) => { const bx = 30 + (i % 14) * 43 + ((i * 7) % 3) * 9; const by = 150 - Math.floor(i / 14) * 12; return <rect key={i} x={bx} y={by} width={4} height={5} /> })}</g>}
            {lvl === 3 && Array.from({ length: 5 }, (_, i) => <rect key={i} x={20 + i * 150} y={22} width={4} height={150} fill='#9aa6b4' />)}
            {lvl < 3 && <><path d={`M${lvl === 3 ? 20 : 30} 77 H${lvl === 3 ? 620 : 200}`} stroke='#fff' strokeWidth={5} /><path d='M115 22 V132' stroke='#fff' strokeWidth={5} /></>}
            {lvl < 3 && <g fill='#fff' opacity='.85'><ellipse cx={70} cy={50} rx={18} ry={6} /><ellipse cx={82} cy={46} rx={12} ry={6} /></g>}
          </g>
        )}
        {/* The shelf: every book you've published. */}
        {(() => {
          const sx = lvl === 0 ? 300 : lvl === 3 ? 350 : 240
          const sw = lvl === 0 ? 150 : lvl === 3 ? 0 : lvl === 2 ? 370 : 200
          if (!sw) return null
          const per = Math.floor((sw - 10) / 9)
          return (
            <g>
              {[0, 1].map((r) => <rect key={r} x={sx} y={62 + r * 56} width={sw} height={6} fill='#5a3a1e' />)}
              <rect x={sx - 6} y={18} width={6} height={160} fill='#4a2e16' /><rect x={sx + sw} y={18} width={6} height={160} fill='#4a2e16' />
              {books.slice(0, per * 2).map((b, i) => {
                const r = Math.floor(i / per)
                const k = i % per
                const hgt = 30 + SIZES.findIndex((z) => z.id === b.size) * 5
                return <rect key={b.id} x={sx + 5 + k * 9} y={62 + r * 56 - hgt} width={8} height={hgt} rx={1} fill={`hsl(${SUBJECT_HUE[b.subject]}, ${b.score >= 8 ? 60 : 40}%, ${b.score >= 8 ? 45 : 38}%)`}><title>{`${b.title} (${b.score.toFixed(1)})`}</title></rect>
              })}
              {!books.length && <text x={sx + sw / 2} y={50} className='lx-wall-note'>your books go here</text>}
            </g>
          )
        })()}
        {/* Your best review, framed. */}
        {best && (
          <g transform={`translate(${lvl === 0 ? 488 : lvl === 3 ? 470 : lvl === 2 ? 60 : 470}, ${lvl === 3 ? 182 : lvl === 2 ? 138 : 130})`}>
            <rect x={0} y={0} width={96} height={lvl === 3 ? 0 : 66} fill='#5a3a1e' />
            {lvl !== 3 && <><rect x={5} y={5} width={86} height={56} fill='#fbf6ea' /><text x={48} y={30} className='lx-frame-score'>{best.score.toFixed(1)}</text><text x={48} y={44} className='lx-frame-t'>{best.title.length > 22 ? `${best.title.slice(0, 21)}…` : best.title}</text><text x={48} y={54} className='lx-frame-by'>{best.reviews[0]?.by}</text></>}
          </g>
        )}
        {/* The calendar. */}
        <g transform={`translate(${lvl === 3 ? 590 : lvl === 0 ? 236 : 210}, ${lvl === 3 ? 186 : lvl === 0 ? 120 : 140})`}>
          <rect x={-18} y={0} width={36} height={34} rx={2} fill='#fff' stroke='#c8c0b0' />
          <rect x={-18} y={0} width={36} height={10} rx={2} fill='#c84a3a' />
          <text x={0} y={8} className='lx-cal-m'>{MONTHS_SHORT[Math.min(11, Math.floor(((g.week % 52) / 52) * 12))]}</text>
          <text x={0} y={27} className='lx-cal-y'>{yr}</text>
        </g>
        {/* The floor. */}
        <rect x={0} y={210} width={W} height={H - 210} fill={['#8a8680', '#b88a5a', '#7a4a2a', '#6a7480'][lvl]} />
        {lvl === 0 && <g stroke='rgba(0,0,0,.08)'>{[250, 300].map((yy) => <path key={yy} d={`M0 ${yy} H${W}`} />)}<path d='M210 210 L120 360 M430 210 L520 360' /></g>}
        {(lvl === 1 || lvl === 2) && <g stroke='rgba(0,0,0,.12)'>{Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${320 + (i - 6) * 40} 210 L${320 + (i - 6) * 110} 360`} />)}{[232, 262, 302].map((yy) => <path key={yy} d={`M0 ${yy} H${W}`} />)}</g>}
        {lvl === 2 && <ellipse cx={320} cy={300} rx={250} ry={48} fill='#8a2a2a' opacity='.55' />}
        {lvl === 3 && <g stroke='rgba(255,255,255,.12)'>{Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${320 + (i - 4) * 80} 210 L${320 + (i - 4) * 200} 360`} />)}{[236, 276].map((yy) => <path key={yy} d={`M0 ${yy} H${W}`} />)}</g>}
        <rect x={0} y={210} width={W} height={60} fill='url(#lx-floor)' />
        <rect x={0} y={206} width={W} height={6} fill='rgba(0,0,0,.18)' />
        {/* A plant or two, and the water cooler. */}
        {lvl >= 1 && <g transform='translate(36, 300)'><path d='M-12 0 L12 0 L9 22 L-9 22 Z' fill='#c8643a' /><path d='M0 0 Q-20 -30 -6 -46 M0 0 Q4 -40 14 -50 M0 0 Q18 -24 22 -30 M0 0 Q-14 -10 -24 -16' stroke='#3a8a4a' strokeWidth={5} fill='none' strokeLinecap='round' /></g>}
        {lvl >= 2 && <g transform='translate(606, 300)'><path d='M-12 0 L12 0 L9 22 L-9 22 Z' fill='#3a4a5a' /><circle cx={0} cy={-26} r={22} fill='#4a9a5a' /><circle cx={-10} cy={-34} r={12} fill='#5aaa6a' /></g>}
        {lvl === 1 && <g transform='translate(604, 236)'><rect x={-12} y={0} width={24} height={44} rx={3} fill='#e8ecf0' /><rect x={-10} y={-26} width={20} height={26} rx={6} fill='#9ac8ec' opacity='.85' /><rect x={-4} y={14} width={8} height={4} fill='#5a6a7a' /></g>}
        {/* The desks, back row first. */}
        {Array.from({ length: desks }, (_, i) => i).sort((a, b) => Math.floor(a / cols) - Math.floor(b / cols)).map((i) => {
          const { x, y, s } = slot(i)
          return <Desk key={i} x={x} y={y} s={s} person={g.staff[i]} yr={yr} busy={busy} lvl={lvl} papers={papers} />
        })}
        {pops.map((pp) => {
          const i = g.staff.findIndex((x) => x.id === pp.who)
          if (i < 0) return null
          const { x, y, s } = slot(i)
          return <text key={pp.id} className={`pop k-${pp.kind}`} x={x + ((pp.id * 13) % 30) - 15} y={y - 70 * s}>{pp.kind === 's' ? 'S' : pp.kind === 'c' ? 'C' : pp.kind === 'typo' ? 'typo!' : '✓'}</text>
        })}
      </svg>
    </div>
  )
}
const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

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
