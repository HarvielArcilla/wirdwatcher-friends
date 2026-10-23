import { useCallback, useEffect, useRef, useState } from 'react'
import { api, Coins, useToast, useInterval, holdCoins, releaseCoins, useShownCoins } from './ui.jsx'
import { formatCoins } from '../shared/economy.js'
import { PAYS, LETTERS } from '../shared/slots.js'
import { burst, centerOf } from './effects.js'
import { playRating } from './sound.js'
import { Coinflip, useLiveCoins } from './Wirdhouse.jsx'
import Packs from './Packs.jsx'
import Sportsbook from './Sportsbook.jsx'
import { Credit } from './Credit.jsx'
import { Roulette, Wordjack, Wheel } from './Tables.jsx'
import Penguin from './Penguin.jsx'

// The Casino: Wird Slots, the coinflip, the word tables (Letter Roulette,
// Wordjack, the Wheel of Words), the prediction market and card packs. Luck, for coins that only buy
// looks. Nothing here counts toward ink.
export default function Casino ({ econ, settings }) {
  const toast = useToast()
  const [v, setV] = useState(null)
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('casino-tab') || 'slots' } catch { return 'slots' } })
  const [tablesNet, setTablesNet] = useState(0)
  const spinUntil = useRef(0) // while a wheel spins, the totals wait
  const load = useCallback(() => { api('economy').then(setV).catch(() => {}); if (Date.now() >= spinUntil.current) api('tables').then((t) => setTablesNet(t.roulette.net + t.wheel.net + t.blackjack.net + (t.penguin?.net || 0))).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  useInterval(load, 8000)
  useEffect(() => { try { localStorage.setItem('casino-tab', tab) } catch {} }, [tab])
  const [frozen, setFrozen] = useState(null) // what the page showed before a game, until its animation ends
  const act = async (action, ...args) => {
    try { const out = await api('economyAction', action, ...args); load(); return out } catch (err) { toast({ error: true, title: 'Can’t do that', text: err.message }); return null }
  }
  const live = useLiveCoins(econ)
  // A game whose result is animated: the coins and stats stay as they were
  // until it lands, ms later.
  const play = async (ms, action, ...args) => {
    const before = v
    holdCoins(live, ms + 2000)
    setFrozen(before)
    const out = await act(action, ...args)
    if (!out) { setFrozen(null); holdCoins(live, 0); return null }
    holdCoins(live, ms)
    setTimeout(() => setFrozen(null), ms)
    return out
  }
  const coins = useShownCoins(live)
  // The word tables hold the coin count while a wheel spins, then reload.
  const hold = (ms) => { spinUntil.current = ms ? Date.now() + ms : 0; return ms ? holdCoins(live, ms) : releaseCoins() }
  const tableToast = (t) => { spinUntil.current = 0; toast(t); load() }
  if (!v) return null
  const real = v
  const shown = frozen || real
  const sl = shown.slots
  const f = shown.flips
  const net = sl.net + f.net + tablesNet
  return (
    <div className='page casino'>
      <div className='mk-head'>
        <div>
          <h1>Casino</h1>
          <p className='lede'>Luck, for coins that only ever buy looks. The house wins slowly, like a real one. Nothing here counts toward ink.</p>
        </div>
        <div className='mk-summary'>
          <div><small>Coins</small><b><Coins n={coins} /></b></div>
          <div><small>All told</small><b className={net >= 0 ? 'up' : 'down'}>{net >= 0 ? '+' : '−'}{formatCoins(Math.abs(net))}</b><small>slots, flips and tables</small></div>
        </div>
      </div>
      <div className='tabs' role='tablist'>
        {[['slots', 'Wird Slots'], ['flip', 'Coinflip'], ['roulette', 'Letter Roulette'], ['blackjack', 'Wordjack'], ['wheel', 'Wheel of Words'], ['penguin', 'Penguin Cross'], ['sports', 'Prediction market'], ['packs', `Card packs${v.packs.free > 0 ? ` (${v.packs.free})` : ''}`]].map(([id, label]) => <button key={id} role='tab' aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {econ?.bankrupt
        ? <div className='casino-closed'><h2>The casino’s closed to you for now</h2><p className='lede'>It doesn’t take bankrupt players. Build some steady income and the doors open again{v.packs.free > 0 ? `, and your ${v.packs.free} free pack${v.packs.free === 1 ? ' is' : 's are'} waiting` : ''}.</p><Credit econ={econ} compact /></div>
        : (
          <>
            {tab === 'slots' && <Slots v={shown} live={real} coins={coins} play={play} settings={settings} />}
            {tab === 'flip' && <Coinflip v={shown} coins={coins} act={(...a) => play(1500, ...a)} look={econ?.look} />}
            {tab === 'roulette' && <Roulette coins={coins} hold={hold} toast={tableToast} />}
            {tab === 'blackjack' && <Wordjack coins={coins} hold={hold} toast={tableToast} />}
            {tab === 'wheel' && <Wheel coins={coins} hold={hold} toast={tableToast} />}
            {tab === 'penguin' && <Penguin coins={coins} hold={hold} toast={tableToast} settings={settings} />}
            {tab === 'sports' && <Sportsbook coins={coins} />}
            {tab === 'packs' && <Packs v={shown} coins={coins} settings={settings} act={(action, ...a) => (action === 'openPack' ? play(7900, action, ...a) : act(action, ...a))} />}
          </>
          )}
    </div>
  )
}

const REEL_SPIN_MS = 900
const REEL_GAP_MS = 260

const MACHINES = [1, 2, 3, 5, 10]
const randomReels = () => Array.from({ length: 5 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)])

function Slots ({ v, live, coins, play, settings }) {
  const [stake, setStake] = useState('100')
  const [count, setCount] = useState(() => { try { const n = Number(localStorage.getItem('slot-machines')); return MACHINES.includes(n) ? n : 1 } catch { return 1 } })
  const [res, setRes] = useState(null) // { spins: [...], won, total, free }
  const [stopped, setStopped] = useState(5) // reels that have stopped (on every machine)
  const [blur, setBlur] = useState(() => [['w', 'i', 'r', 'd', 's']])
  const spinning = stopped < 5
  const timer = useRef(null)
  const whole = Math.floor(coins)
  const amount = Math.floor(Number(String(stake).replace(/[^0-9]/g, '')) || 0)
  const total = amount * count
  useEffect(() => { try { localStorage.setItem('slot-machines', String(count)) } catch {} if (!spinning) { setRes(null); setBlur((b) => Array.from({ length: count }, (_, i) => b[i] || randomReels())) } }, [count]) // eslint-disable-line react-hooks/exhaustive-deps
  // While spinning, the reels flicker through letters.
  useEffect(() => {
    if (!spinning) return
    timer.current = setInterval(() => setBlur((all) => all.map((b) => b.map((x, i) => (i < stopped ? x : LETTERS[Math.floor(Math.random() * LETTERS.length)])))), 55)
    return () => clearInterval(timer.current)
  }, [spinning, stopped])
  const go = async (free = false) => {
    if (spinning || (!free && (amount < 1 || total > whole))) return
    const many = !free && count > 1
    const out = await play(REEL_SPIN_MS + 5 * REEL_GAP_MS + 60, many ? 'spinMany' : 'spin', free ? 0 : amount, many ? count : { free })
    if (!out) return
    const spins = many ? out.spins : [out]
    const r = { spins, won: many ? out.won : out.won, total: many ? out.total : (free ? 0 : out.stake), free }
    setRes(null)
    setBlur(spins.map(() => randomReels()))
    setStopped(0)
    for (let i = 0; i < 5; i++) {
      setTimeout(() => { setBlur((all) => all.map((b, m) => b.map((x, j) => (j === i ? spins[m].reels[i] : x)))); setStopped(i + 1); playTick(settings, i) }, REEL_SPIN_MS + i * REEL_GAP_MS)
    }
    setTimeout(() => {
      setRes(r)
      const best = spins.reduce((m, x) => Math.max(m, x.len || 0), 0)
      if (r.won > 0) {
        const at = centerOf(document.querySelector('.reels-area'))
        burst(at.x, at.y, best === 5 ? 'confetti' : 'confetti-small')
        playRating(best === 5 ? 5 : best === 4 ? 4.6 : 3.8, settings)
      }
    }, REEL_SPIN_MS + 5 * REEL_GAP_MS + 60)
  }
  useEffect(() => {
    const onKey = (e) => { if (e.key === ' ' && !['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName)) { e.preventDefault(); go() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const sl = v.slots
  return (
    <div className='slots'>
      <div className='slots-main'>
      <div className={`reels-area ${blur.length > 1 ? 'multi' : ''} n${blur.length}`}>
        {blur.map((reels, m) => {
          const one = res?.spins[m]
          const lit = one?.word && !spinning ? new Set(Array.from({ length: one.len }, (_, i) => one.at + i)) : new Set()
          return (
            <div key={m} className={`machine ${one?.len === 5 && !spinning ? 'jackpot' : ''} ${one && !spinning ? (one.word ? 'paid' : 'dud') : ''}`}>
              <div className='marquee'>{blur.length > 1 ? `#${m + 1}` : 'WIRD SLOTS'}</div>
              <div className='reels' aria-live='polite' aria-label={spinning ? 'Spinning' : one ? `${one.reels.join(' ')}${one.word ? `: ${one.word}` : ''}` : 'Ready'}>
                {reels.map((ch, i) => <div key={i} className={`reel ${i >= stopped ? 'spinning' : ''} ${lit.has(i) ? 'lit' : ''}`}><span>{ch.toUpperCase()}</span></div>)}
              </div>
              <div className='slot-result'>
                {one && !spinning && (one.word
                  ? <span className='win'>{one.len === 5 ? '🎰 JACKPOT! ' : ''}<b>{one.word.toUpperCase()}</b> ×{one.mult}{blur.length > 1 ? '' : <>: +<Coins n={one.won} /></>}</span>
                  : <span className='loss'>No word{blur.length > 1 || one.free ? '' : <> this time. −<Coins n={one.stake} /></>}</span>)}
                {spinning && <span>…</span>}
                {!one && !spinning && <span className='dim'>{blur.length > 1 ? 'Ready' : 'Spell a word across the reels. Space spins.'}</span>}
              </div>
            </div>
          )
        })}
      </div>
      {res && !spinning && res.spins.length > 1 && (
        <div className={`slot-total ${res.won >= res.total ? 'up' : 'down'}`}>
          {res.spins.filter((x) => x.word).length} of {res.spins.length} machines paid: <Coins n={res.won} /> back on <Coins n={res.total} />{' '}
          <b>({res.won - res.total >= 0 ? '+' : '−'}<Coins n={Math.abs(res.won - res.total)} />)</b>
        </div>
      )}
      </div>
      <div className='flip-controls panel'>
        <label>Machines
          <div className='seg'>{MACHINES.map((n) => <button key={n} className={count === n ? 'on' : ''} disabled={spinning} onClick={() => setCount(n)}>{n}</button>)}</div>
        </label>
        <label>{count > 1 ? 'Bet on each' : 'Bet'}
          <input className='field' inputMode='numeric' value={stake} onChange={(e) => setStake(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go() }} />
        </label>
        <div className='seg'>
          {[['1%', 0.01], ['10%', 0.1], ['Half', 0.5], ['All in', 1]].map(([label, frac]) => <button key={label} onClick={() => setStake(String(Math.max(1, Math.floor((whole * frac) / count))))}>{label}</button>)}
          <button onClick={() => setStake(String(Math.min(Math.floor(whole / count), Math.max(1, amount * 2))))}>×2</button>
        </div>
        <button className='btn primary big' disabled={spinning || amount < 1 || total > whole} onClick={() => go()}>{total > whole ? 'You don’t have that many' : count > 1 ? `Spin ${count} for ${formatCoins(total)}` : `Spin for ${formatCoins(amount)}`}</button>
        <button className='btn big free-spin' disabled={spinning || !live.freeSpin.ready} onClick={() => go(true)}>{live.freeSpin.ready ? <>🎁 Today’s free spin (<Coins n={live.freeSpin.amount} />)</> : 'Free spin used today'}</button>
        <div className='paytable'>
          <div><b>5-letter word</b><span>×{PAYS[5]}</span></div>
          <div><b>4-letter word</b><span>×{PAYS[4]}</span></div>
          <div><b>3-letter word</b><span>×{PAYS[3]}</span></div>
          <small>The longest real word anywhere in the five, read left to right. Pays back about 95% over time.</small>
        </div>
      </div>
      <div className='hero-stats flip-stats'>
        <div><strong>{sl.spins.toLocaleString()}</strong><span>spins</span></div>
        <div><strong>{sl.spins ? `${Math.round((sl.wins / sl.spins) * 100)}%` : '–'}</strong><span>paid</span></div>
        <div><strong>{sl.jackpots}</strong><span>jackpots</span></div>
        <div><strong>{sl.bestWord ? sl.bestWord.toUpperCase() : '–'}</strong><span>best word</span></div>
        <div><strong><Coins n={sl.biggest} /></strong><span>biggest win</span></div>
        <div><strong className={sl.net < 0 ? 'neg' : ''}>{sl.net < 0 ? '−' : '+'}<Coins n={Math.abs(sl.net)} /></strong><span>all told</span></div>
      </div>
      {sl.last?.length > 0 && (
        <div className='slot-log'>
          <h3>Recent spins</h3>
          <div>{sl.last.map((x, i) => <span key={i} className={x.word ? 'hit' : ''} title={x.word ? `${x.word}: +${formatCoins(x.won)}` : 'No word'}>{x.reels.toUpperCase()}</span>)}</div>
        </div>
      )}
    </div>
  )
}

// A soft click as each reel stops.
let ctx = null
function playTick (settings, i) {
  try {
    if (!settings || settings.ratingSound === 'off' || !settings.soundVolume) return
    ctx = ctx || new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'triangle'
    o.frequency.value = 520 + i * 70
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.12 * (settings.soundVolume / 100), ctx.currentTime + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.1)
  } catch {}
}
