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

// The Casino: Wird Slots, the coinflip, the word tables (Letter Roulette,
// Wordjack, the Wheel of Words), the prediction market and card packs. Luck, for coins that only buy
// looks. Nothing here counts toward ink.
export default function Casino ({ econ, settings }) {
  const toast = useToast()
  const [v, setV] = useState(null)
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('casino-tab') || 'slots' } catch { return 'slots' } })
  const [tablesNet, setTablesNet] = useState(0)
  const spinUntil = useRef(0) // while a wheel spins, the totals wait
  const load = useCallback(() => { api('economy').then(setV).catch(() => {}); if (Date.now() >= spinUntil.current) api('tables').then((t) => setTablesNet(t.roulette.net + t.wheel.net + t.blackjack.net)).catch(() => {}) }, [])
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
        {[['slots', 'Wird Slots'], ['flip', 'Coinflip'], ['roulette', 'Letter Roulette'], ['blackjack', 'Wordjack'], ['wheel', 'Wheel of Words'], ['sports', 'Prediction market'], ['packs', `Card packs${v.packs.free > 0 ? ` (${v.packs.free})` : ''}`]].map(([id, label]) => <button key={id} role='tab' aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
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
            {tab === 'sports' && <Sportsbook coins={coins} />}
            {tab === 'packs' && <Packs v={shown} coins={coins} act={(action, ...a) => (action === 'openPack' ? play(1900, action, ...a) : act(action, ...a))} />}
          </>
          )}
    </div>
  )
}

const REEL_SPIN_MS = 900
const REEL_GAP_MS = 260

function Slots ({ v, live, coins, play, settings }) {
  const [stake, setStake] = useState('100')
  const [res, setRes] = useState(null)
  const [stopped, setStopped] = useState(5) // reels that have stopped
  const [blur, setBlur] = useState(['w', 'i', 'r', 'd', 's'])
  const spinning = stopped < 5
  const timer = useRef(null)
  const whole = Math.floor(coins)
  const amount = Math.floor(Number(String(stake).replace(/[^0-9]/g, '')) || 0)
  // While spinning, the reels flicker through letters.
  useEffect(() => {
    if (!spinning) return
    timer.current = setInterval(() => setBlur((b) => b.map((x, i) => (i < stopped ? x : LETTERS[Math.floor(Math.random() * LETTERS.length)]))), 55)
    return () => clearInterval(timer.current)
  }, [spinning, stopped])
  const go = async (free = false) => {
    if (spinning || (!free && (amount < 1 || amount > whole))) return
    const out = await play(REEL_SPIN_MS + 5 * REEL_GAP_MS + 60, 'spin', free ? 0 : amount, { free })
    if (!out) return
    setRes(null)
    setStopped(0)
    out.reels.forEach((ch, i) => setTimeout(() => { setBlur((b) => b.map((x, j) => (j === i ? ch : x))); setStopped(i + 1); playTick(settings, i) }, REEL_SPIN_MS + i * REEL_GAP_MS))
    setTimeout(() => {
      setRes(out)
      if (out.won) {
        const at = centerOf(document.querySelector('.reels'))
        burst(at.x, at.y, out.len === 5 ? 'confetti' : 'confetti-small')
        playRating(out.len === 5 ? 5 : out.len === 4 ? 4.6 : 3.8, settings)
      }
    }, REEL_SPIN_MS + 5 * REEL_GAP_MS + 60)
  }
  useEffect(() => {
    const onKey = (e) => { if (e.key === ' ' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) { e.preventDefault(); go() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const sl = v.slots
  const lit = res?.word ? new Set(Array.from({ length: res.len }, (_, i) => res.at + i)) : new Set()
  return (
    <div className='slots'>
      <div className={`machine ${res?.len === 5 ? 'jackpot' : ''}`}>
        <div className='marquee'>WIRD SLOTS</div>
        <div className='reels' aria-live='polite' aria-label={spinning ? 'Spinning' : res ? `${res.reels.join(' ')}${res.word ? `: ${res.word}` : ''}` : 'Ready'}>
          {blur.map((ch, i) => <div key={i} className={`reel ${i >= stopped ? 'spinning' : ''} ${!spinning && lit.has(i) ? 'lit' : ''}`}><span>{ch.toUpperCase()}</span></div>)}
        </div>
        <div className='slot-result'>
          {res && !spinning && (res.word
            ? <span className='win'>{res.len === 5 ? '🎰 JACKPOT! ' : ''}<b>{res.word.toUpperCase()}</b> pays ×{res.mult}: +<Coins n={res.won} /></span>
            : <span className='loss'>No word this time{res.free ? '' : <>. −<Coins n={res.stake} /></>}</span>)}
          {spinning && <span>…</span>}
          {!res && !spinning && <span className='dim'>Spell a word across the reels. Space spins.</span>}
        </div>
      </div>
      <div className='flip-controls panel'>
        <label>Bet
          <input className='field' inputMode='numeric' value={stake} onChange={(e) => setStake(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go() }} />
        </label>
        <div className='seg'>
          {[['1%', 0.01], ['10%', 0.1], ['Half', 0.5], ['All in', 1]].map(([label, frac]) => <button key={label} onClick={() => setStake(String(Math.max(1, Math.floor(whole * frac))))}>{label}</button>)}
          <button onClick={() => setStake(String(Math.min(whole, Math.max(1, amount * 2))))}>×2</button>
        </div>
        <button className='btn primary big' disabled={spinning || amount < 1 || amount > whole} onClick={() => go()}>{amount > whole ? 'You don’t have that many' : `Spin for ${formatCoins(amount)}`}</button>
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
