import { useEffect, useState } from 'react'
import { api, Coins } from './ui.jsx'
import { formatCoins } from '../shared/economy.js'
import { PC_LEVELS, PC_MIN_STAKE, pcMult } from '../shared/penguin.js'
import { StakePicker } from './Tables.jsx'

// Penguin Cross: a penguin crosses a road that's a hidden word, one lane per
// letter. Each lane crossed shows its letter and raises the multiplier.
// Cash out any time; a car ends it. Rules in src/shared/penguin.js.

const HOP_MS = 280
const CAR_MS = 650
const signed = (n) => `${n >= 0 ? '+' : '−'}${formatCoins(Math.abs(n))}`

export default function Penguin ({ coins, hold, toast }) {
  const [g, setG] = useState(null)
  const [stats, setStats] = useState(null)
  const [stake, setStake] = useState('100')
  const [level, setLevel] = useState(() => { try { return localStorage.getItem('pc-level') || 'medium' } catch { return 'medium' } })
  const [busy, setBusy] = useState(false)
  const [splat, setSplat] = useState(null) // the lane a car is driving through
  const [stepIn, setStepIn] = useState(null) // the lane the penguin is stepping into, before the result shows
  useEffect(() => { api('tables').then((t) => { setG(t.pc); setStats(t.penguin) }).catch(() => {}) }, [])
  useEffect(() => { try { localStorage.setItem('pc-level', level) } catch {} }, [level])

  const act = async (action, ...args) => {
    try {
      const res = await api('tablesAction', action, ...args)
      setStats(res.tables.penguin)
      return res.out
    } catch (err) { toast({ error: true, title: 'Can’t do that', text: err.message }); return null }
  }
  const n = Math.floor(Number(stake) || 0)
  const live = g && !g.done
  const lanes = g?.lanes || 7
  const lv = live || g ? g.level : level

  const start = async () => {
    hold(400)
    const o = await act('pcStart', n, level)
    if (o) { setSplat(null); setStepIn(null); setG(o) }
  }
  const hop = async () => {
    if (busy) return
    setBusy(true)
    hold(HOP_MS + CAR_MS + 300)
    const o = await act('pcHop')
    if (!o) { setBusy(false); hold(0); return }
    if (o.hit !== null) {
      // Into the lane, then the car.
      setStepIn(o.hit)
      setTimeout(() => setSplat(o.hit), HOP_MS)
      setTimeout(() => {
        setG(o); setBusy(false); setStepIn(null)
        toast({ emoji: '🚗', title: `Hit in lane ${o.hit + 1}: it was ${o.word.toUpperCase()}`, text: `${signed(-o.stake)}.` })
      }, HOP_MS + CAR_MS)
      return
    }
    setG(o)
    setTimeout(() => {
      setBusy(false)
      if (o.crossed) toast({ emoji: '🐧', title: `Made it across ${o.word.toUpperCase()}!`, text: `×${pcMult(o.level, o.lanes)}: ${formatCoins(o.paid)} back, ${signed(o.paid - o.stake)}.` })
      else hold(0)
    }, HOP_MS)
  }
  const cash = async () => {
    if (busy) return
    const o = await act('pcCash')
    if (!o) return
    setG(o)
    toast({ emoji: '💰', title: `Cashed out at ×${pcMult(o.level, o.at)}: ${formatCoins(o.paid)}`, text: `${signed(o.paid - o.stake)}. The road was ${o.word.toUpperCase()}.` })
  }

  // Keyboard: → or Space hops, Enter cashes out.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !live) return
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); hop() } else if (e.key === 'Enter' && g.at >= 1) { e.preventDefault(); cash() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const at = g ? g.at : 0
  // 0: the near kerb; lane i is column i + 1; lanes + 1: the far kerb.
  const col = stepIn !== null ? stepIn + 1 : g?.crossed ? lanes + 1 : g?.done && g.hit !== null ? g.hit + 1 : at
  const mults = g?.mults || Array.from({ length: lanes }, (_, i) => pcMult(lv, i + 1))
  const nextMult = live && at < lanes ? mults[Math.floor(at)] : null
  const flat = g?.done && g.hit !== null && splat === g.hit
  return (
    <div className='pc-game'>
      <div className='pc-sign' aria-label={g?.done ? `The road: ${g.word}` : 'The road’s name, one letter per lane crossed'}>
        <span className='pc-sign-plate'>
          {Array.from({ length: lanes }, (_, i) => <b key={i} className={g?.letters?.[i] ? 'open' : ''}>{g?.letters?.[i] || ''}</b>)}
          <small>{g ? 'Rd' : ''}</small>
        </span>
        {g?.clue && <span className='pc-clue'>{g.clue}</span>}
      </div>
      <div className={`pc-road ${lv}`} style={{ '--cols': lanes + 2 }}>
        <div className='pc-kerb' />
        {mults.map((m, i) => (
          <div key={i} className={`pc-lane ${i < at ? 'safe' : ''} ${g?.done && g.hit === i ? 'hit' : ''}`}>
            <span className='pc-mult'>×{m}</span>
            {splat === i && <span className='pc-car' style={{ animationDuration: `${CAR_MS}ms` }} aria-hidden='true'>🚙</span>}
          </div>
        ))}
        <div className='pc-kerb far'><span>🏁</span></div>
        <span className={`pc-bird ${flat ? 'flat' : ''} ${g?.crossed ? 'home' : ''}`} style={{ left: `calc(${(col + 0.5)} * 100% / var(--cols))`, transitionDuration: `${HOP_MS}ms` }} aria-hidden='true'>🐧</span>
      </div>
      <div className='pc-controls'>
        {live
          ? (
            <div className='tb-actions'>
              <span className='tb-total'>Stake <Coins n={g.stake} /> · {PC_LEVELS[g.level].name}</span>
              <button className='btn' onClick={cash} disabled={busy || at < 1}>{g.cashNow ? <>Cash out <Coins n={g.cashNow} /></> : 'Cash out'}</button>
              <button className='btn primary' onClick={hop} disabled={busy}>Hop{nextMult ? ` to ×${nextMult}` : ''}</button>
            </div>
            )
          : (
            <>
              <div className='seg pc-levels' role='radiogroup' aria-label='Road'>
                {Object.entries(PC_LEVELS).map(([id, l]) => <button key={id} className={level === id ? 'on' : ''} aria-pressed={level === id} onClick={() => { setLevel(id); if (g?.done) setG(null) }}>{l.name} <small>{Math.round((1 - l.safe) * 100)}% a lane</small></button>)}
              </div>
              <div className='tb-actions'>
                <StakePicker stake={stake} setStake={setStake} coins={coins} min={PC_MIN_STAKE} />
                <button className='btn primary' onClick={start} disabled={!(n >= PC_MIN_STAKE) || n > coins}>{g ? 'Cross again' : 'Cross'}</button>
              </div>
            </>
            )}
        <p className='lede pc-help'>{live ? 'Each lane you cross shows a letter of the road’s name and raises the multiplier. Cash out whenever you like; a car takes the lot. Cross every lane to spell the road and take the top multiplier. (→ hop, Enter cash out)' : 'Help a penguin across a road named after a hidden word. Every lane crossed pays more, from your stake. No house edge: whenever you stop, it pays back what you put in, on average.'}</p>
        {stats && <p className='tb-stats'>{stats.runs || 0} crossing{stats.runs === 1 ? '' : 's'} · {stats.crossed || 0} all the way · <span className={stats.net >= 0 ? 'up' : 'down'}>{signed(stats.net)}</span></p>}
      </div>
    </div>
  )
}
