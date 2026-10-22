import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatCoins, UPGRADE_KINDS } from '../shared/economy.js'
import { api, Coins, CoinArt, SKINS, useToast, useInterval } from './ui.jsx'
import { burst, centerOf } from './effects.js'

// The wirdhouse: where coins are invested. Buildings make coins every
// second; upgrades change how everything earns (new words, the streak, the
// muse, time away, lobbies, friends). Publishing an edition starts it all
// over for ink, which makes everything earn more forever. (The coinflip
// lives in the Casino now; its component is still here.)


export default function Wirdhouse ({ econ }) {
  const toast = useToast()
  const [v, setV] = useState(null)
  const [tab, setTab] = useState(() => { try { const t = localStorage.getItem('wh-tab'); return ['build', 'upgrades', 'publish', 'stats'].includes(t) ? t : 'build' } catch { return 'build' } })
  const load = useCallback(() => api('economy').then(setV).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  useInterval(load, 4000)
  const act = async (action, ...args) => {
    try { const out = await api('economyAction', action, ...args); if (out?.buildings) setV(out); else load(); return out } catch (err) { toast({ error: true, title: 'Can’t do that', text: err.message }); return null }
  }
  useEffect(() => { try { localStorage.setItem('wh-tab', tab) } catch {} }, [tab])
  const coins = useLiveCoins(econ)
  if (!v) return null
  return (
    <div className='page wirdhouse'>
      <div className='wh-head'>
        <div>
          <h1>Wirdhouse{v.edition > 0 && <small className='edition'>Edition {v.edition + 1}</small>}</h1>
          <div className='wh-coins'><Coins n={coins} /></div>
          <div className='wh-rates'>
            <span><b>{formatCoins(econ?.cps ?? v.cps)}</b> a second</span>
            <span><b>{formatCoins(v.perWord)}</b> a new word</span>
            {econ?.streak?.n > 1 && econ.streak.endsAt && <span className='hot'>🔥 streak ×{econ.streak.mult.toFixed(2)}</span>}
          </div>
          <Muse m={econ?.muse || v.muse} />
        </div>
        <p className='lede'>Every new word you rate pays the same, whatever you give it. Rate new words within a minute of each other for a streak, but the same score five times running ends it. The wirdhouse turns coins into more coins; spend them here, or on looks in the shop.</p>
      </div>
      <div className='tabs' role='tablist'>
        {[['build', 'Build'], ['upgrades', 'Upgrades'], ['publish', `Publish${v.prestige.gain ? ' ✨' : ''}`], ['stats', 'Stats']].map(([id, label]) => (
          <button key={id} role='tab' aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'build' && <Build v={v} coins={coins} act={act} />}
      {tab === 'upgrades' && <Upgrades v={v} coins={coins} act={act} />}
      {tab === 'publish' && <Publish v={v} act={act} toast={toast} />}
      {tab === 'stats' && <Stats v={v} />}
      {v.dev && <DevBar act={act} />}
    </div>
  )
}

// The coin count, ticking up smoothly between updates.
export function useLiveCoins (econ) {
  const [, frame] = useState(0)
  const base = useRef({ coins: 0, cps: 0, at: 0 })
  if (econ && (econ.coins !== base.current.coins || econ.cps !== base.current.cps)) base.current = { coins: econ.coins, cps: econ.cps, at: performance.now() }
  useEffect(() => {
    let id
    const loop = () => { frame((x) => x + 1); id = requestAnimationFrame(loop) }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])
  const b = base.current
  return b.coins + b.cps * Math.min(1.2, (performance.now() - b.at) / 1000)
}

function Build ({ v, coins, act }) {
  const [amount, setAmount] = useState(1)
  // Show what you own, the next one up, and a silhouette of the one after.
  const lastOwned = v.buildings.reduce((i, b, idx) => (b.owned ? idx : i), -1)
  const shown = v.buildings.slice(0, Math.max(2, lastOwned + 3))
  const total = v.baseCps || 1
  return (
    <>
      <div className='wh-toolbar'>
        <span>Buy</span>
        <div className='seg'>{[1, 10, 'max'].map((n) => <button key={n} className={amount === n ? 'on' : ''} onClick={() => setAmount(n)}>{n === 'max' ? 'Max' : `×${n}`}</button>)}</div>
      </div>
      <div className='buildings'>
        {shown.map((b, i) => {
          const hidden = i > lastOwned + 1 && !b.owned
          const cost = amount === 10 ? b.next10 : amount === 'max' ? null : b.next
          const can = amount === 'max' ? b.max > 0 : coins >= cost
          return (
            <button key={b.id} className={`building ${can ? 'can' : ''} ${hidden ? 'mystery' : ''}`} disabled={hidden || !can} onClick={(e) => { act('buyBuilding', b.id, amount); const at = centerOf(e.currentTarget); burst(at.x, at.y, 'sparkle') }}>
              <span className='em'>{hidden ? '❔' : b.emoji}</span>
              <span className='info'>
                <strong>{hidden ? '???' : b.name}</strong>
                <small>{hidden ? 'Keep building' : b.owned ? `${formatCoins(b.each)} each · ${formatCoins(b.each * b.owned)}/s (${Math.round((b.each * b.owned / total) * 100)}%)` : b.blurb}</small>
              </span>
              <span className='cost'>{amount === 'max' ? (b.max ? `+${b.max}` : '–') : <Coins n={cost} />}</span>
              <span className='owned'>{b.owned || ''}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

const KIND_LABEL = Object.fromEntries(UPGRADE_KINDS.map(([id, name, blurb]) => [id, { name, blurb }]))

function Upgrades ({ v, coins, act }) {
  const [kind, setKind] = useState('all')
  const [showOwned, setShowOwned] = useState(false)
  const list = v.upgrades.filter((u) => kind === 'all' || u.kind === kind)
  const open = list.filter((u) => u.open && !u.owned).sort((a, b) => a.cost - b.cost)
  const owned = list.filter((u) => u.owned)
  // A peek at what's coming: the cheapest few that aren't open yet.
  const soon = list.filter((u) => !u.open).sort((a, b) => a.cost - b.cost).slice(0, kind === 'all' ? 6 : 4)
  return (
    <>
      <div className='chips kind-chips'>
        <button className={`chip ${kind === 'all' ? 'on' : ''}`} onClick={() => setKind('all')}>All</button>
        {UPGRADE_KINDS.map(([id, name]) => {
          const n = v.upgrades.filter((u) => u.kind === id && u.open && !u.owned).length
          return <button key={id} className={`chip k-${id} ${kind === id ? 'on' : ''}`} onClick={() => setKind(id)}>{name}{n > 0 && <b>{n}</b>}</button>
        })}
      </div>
      {kind !== 'all' && <p className='lede' style={{ margin: '4px 0 12px' }}>{KIND_LABEL[kind].blurb}.</p>}
      {open.length
        ? <div className='upgrades'>{open.map((u) => <Upgrade key={u.id} u={u} can={coins >= u.cost} onBuy={(e) => { act('buyUpgrade', u.id); const at = centerOf(e.currentTarget); burst(at.x, at.y, 'confetti-small') }} />)}</div>
        : <p className='lede'>Nothing to buy here yet.</p>}
      {soon.length > 0 && (
        <>
          <h2>Coming up</h2>
          <div className='upgrades soon'>{soon.map((u) => <div key={u.id} className={`upgrade locked k-${u.kind}`}><span className='em'>🔒</span><span className='info'><strong>{u.name}</strong><small>{u.hint}</small></span><span className='cost'><Coins n={u.cost} /></span></div>)}</div>
        </>
      )}
      {owned.length > 0 && (
        <>
          <h2><button className='btn small ghost' onClick={() => setShowOwned((x) => !x)}>{showOwned ? 'Hide' : 'Show'} the {owned.length} you have</button></h2>
          {showOwned && <div className='upgrades owned'>{owned.map((u) => <Upgrade key={u.id} u={u} owned />)}</div>}
        </>
      )}
    </>
  )
}

function Upgrade ({ u, can, owned, onBuy }) {
  return (
    <button className={`upgrade k-${u.kind} ${can ? 'can' : ''} ${owned ? 'have' : ''}`} disabled={owned || !can} onClick={onBuy} title={u.desc}>
      <span className='em'>{u.emoji}</span>
      <span className='info'><strong>{u.name}</strong><small>{u.desc}</small><i>{KIND_LABEL[u.kind].name}</i></span>
      {!owned && <span className='cost'><Coins n={u.cost} /></span>}
    </button>
  )
}

function Publish ({ v, act, toast }) {
  const p = v.prestige
  const [sure, setSure] = useState(false)
  const publish = async () => {
    const out = await act('prestige')
    setSure(false)
    if (out?.edition) {
      burst(window.innerWidth / 2, window.innerHeight / 2, 'confetti')
      toast({ emoji: '📖', title: `Edition ${out.edition + 1} begins`, text: `+${out.gain} ink. Everything now earns ${Math.round((p.inkTotal + out.gain) * p.bonus * 100)}% more, forever.${out.unlocked.length ? ` Unlocked: ${out.unlocked.map((u) => u.name).join(', ')}.` : ''}`, ms: 8000 })
    }
  }
  return (
    <div className='publish'>
      <div className='panel'>
        <h3>Publish your dictionary</h3>
        <p>Start the wirdhouse over, coins, buildings and upgrades, for <b>ink</b>. Every ink you’ve ever earned makes everything earn {Math.round(p.bonus * 100)}% more, in every edition from now on. Your ratings, levels, badges, friends and everything from the shop stay.</p>
        <div className='hero-stats'>
          <div><strong>{p.edition + 1}</strong><span>current edition</span></div>
          <div><strong>{p.inkTotal}</strong><span>ink earned (+{Math.round(p.inkTotal * p.bonus * 100)}%)</span></div>
          <div><strong>{p.ink}</strong><span>ink to spend</span></div>
          <div><strong className={p.gain ? 'gain' : ''}>+{p.gain}</strong><span>ink if you publish now</span></div>
        </div>
        <p className='opt-hint'>The next ink comes at <Coins n={p.nextAt} /> earned in total (you’ve earned <Coins n={v.allCoins} />).</p>
        {!sure
          ? <button className='btn primary' disabled={!p.gain} onClick={() => setSure(true)}>{p.gain ? `Publish for ${p.gain} ink` : 'Not enough to publish yet'}</button>
          : <span className='sure'>Start over for {p.gain} ink? <button className='btn primary' onClick={publish}>Publish</button> <button className='btn ghost' onClick={() => setSure(false)}>Not yet</button></span>}
        {p.edition === 0 && <p className='opt-hint'>Your first edition also brings a frame and a title you can’t buy.</p>}
      </div>
      <h2>Perks</h2>
      <p className='lede'>Spend ink on perks that stay through every edition.</p>
      <div className='upgrades perks'>
        {p.perks.map((x) => (
          <button key={x.id} className={`upgrade perk ${x.cost !== null && p.ink >= x.cost ? 'can' : ''}`} disabled={x.cost === null || p.ink < x.cost} onClick={() => act('buyPerk', x.id)}>
            <span className='em'>{x.emoji}</span>
            <span className='info'><strong>{x.name} <small className='lvl'>{x.level}/{x.max}</small></strong><small>{x.level ? x.desc : 'Not yet.'}{x.nextDesc && <> Next: {x.nextDesc}</>}</small></span>
            <span className='cost'>{x.cost === null ? 'Max' : `${x.cost} ink`}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Heads or tails. Win and the stake doubles; lose and it's gone. That's it.
export function Coinflip ({ v, coins, act, look }) {
  const [stake, setStake] = useState('')
  const [call, setCall] = useState('heads')
  const [flip, setFlip] = useState(null) // { side, win, stake, key }
  const [spinning, setSpinning] = useState(false)
  const amount = Math.floor(Number(String(stake).replace(/[^0-9.]/g, '')) || 0)
  const whole = Math.floor(coins)
  const go = async () => {
    if (spinning || amount < 1) return
    setSpinning(true)
    const out = await act('flip', Math.min(amount, whole), call)
    if (!out) { setSpinning(false); return }
    setFlip({ ...out, key: Math.random() })
    setTimeout(() => {
      setSpinning(false)
      if (out.win) { const el = document.querySelector('.flipcoin'); const at = centerOf(el); burst(at.x, at.y, out.stake >= whole / 2 ? 'confetti' : 'confetti-small') }
    }, 1500)
  }
  const f = v.flips
  return (
    <div className='coinflip'>
      <div className='flip-stage'>
        <SpinningCoin key={flip?.key || 'idle'} skin={look?.coin || 'gold'} land={flip?.side || 'heads'} spin={Boolean(spinning && flip)} />
        <div className='flip-shadow' aria-hidden='true' />
        <div className='flip-result'>
          {flip && !spinning && (flip.win ? <span className='win'>It’s {flip.side}! +<Coins n={flip.stake} /></span> : <span className='loss'>It’s {flip.side}. −<Coins n={flip.stake} /></span>)}
          {spinning && <span>…</span>}
        </div>
      </div>
      <div className='flip-controls panel'>
        <label>Bet
          <input className='field' inputMode='numeric' value={stake} onChange={(e) => setStake(e.target.value)} placeholder='How many coins' onKeyDown={(e) => { if (e.key === 'Enter') go() }} />
        </label>
        <div className='seg'>
          {[['10%', 0.1], ['Half', 0.5], ['All in', 1]].map(([label, frac]) => <button key={label} onClick={() => setStake(String(Math.max(1, Math.floor(whole * frac))))}>{label}</button>)}
          <button onClick={() => setStake(String(Math.min(whole, Math.max(1, amount * 2))))}>×2</button>
        </div>
        <div className='seg call'>
          {['heads', 'tails'].map((s) => <button key={s} className={call === s ? 'on' : ''} onClick={() => setCall(s)}>{s === 'heads' ? 'Heads (ww)' : 'Tails (★)'}</button>)}
        </div>
        <button className='btn primary big' disabled={spinning || amount < 1 || amount > whole} onClick={go}>{amount > whole ? 'You don’t have that many' : `Flip for ${formatCoins(Math.min(amount, whole) || 0)}`}</button>
        <p className='opt-hint'>Heads or tails. Win and it doubles, lose and it’s gone. It doesn’t count toward ink, and it doesn’t mean anything. That’s the point.</p>
      </div>
      <div className='hero-stats flip-stats'>
        <div><strong>{f.count}</strong><span>flips</span></div>
        <div><strong>{f.count ? `${Math.round((f.wins / f.count) * 100)}%` : '–'}</strong><span>won</span></div>
        <div><strong>{f.streak > 0 ? `${f.streak} W` : f.streak < 0 ? `${-f.streak} L` : '–'}</strong><span>now</span></div>
        <div><strong>{f.bestStreak}</strong><span>best run</span></div>
        <div><strong><Coins n={f.biggestWin} /></strong><span>biggest win</span></div>
        <div><strong><Coins n={f.biggestLoss} /></strong><span>biggest loss</span></div>
        <div><strong className={f.net < 0 ? 'neg' : ''}>{f.net < 0 ? '−' : '+'}<Coins n={Math.abs(f.net)} /></strong><span>all told</span></div>
      </div>
    </div>
  )
}

function Stats ({ v }) {
  const fx = v.fx
  const rows = useMemo(() => [
    ['Coins this edition', <Coins key='a' n={v.runCoins} />],
    ['Coins ever', <Coins key='b' n={v.allCoins} />],
    ['Earned while away', <Coins key='c' n={v.stats.offline} />],
    ['New words that paid', v.stats.words.toLocaleString()],
    ['Lobby rounds that paid', v.stats.lobbyRounds.toLocaleString()],
    ['Best streak', `${v.stats.bestStreak} words`],
    ['Streak', `+${Math.round(fx.streakStep * 100)}% a word, up to ×${fx.streakCap}, ${fx.streakWindow}s between words${fx.streakKeep ? `, keeps ${Math.round(fx.streakKeep * 100)}% when it ends` : ''}${fx.streakToIdle ? ', boosts the wirdhouse' : ''}`],
    ['Muse', `full: ×${fx.museMult} speed; empty: ×${v.muse.floor}; each new word fills ${Math.round(v.muse.fill * 100)}%, fades over ${Math.round(v.muse.drainSecs / 60 * 10) / 10} min`],
    ['While away', `${Math.round(fx.offlineRate * 100)}% speed, up to ${fx.offlineHours} hours`],
    ['Lobby rounds', `×${fx.lobbyMult}${fx.hostMult > 1 ? `, ×${fx.hostMult} more hosting` : ''}`],
    ['Friends online', fx.friendPct ? `+${Math.round(fx.friendPct * 100)}% each` : 'No bonus yet'],
    ['Ink and perks', `×${fx.prestige.toFixed(2)} on everything`]
  ], [v, fx])
  return <table className='rated-table wh-stats'><tbody>{rows.map(([k, val]) => <tr key={k}><td>{k}</td><td>{val}</td></tr>)}</tbody></table>
}

function DevBar ({ act }) {
  return (
    <div className='devbar'>
      <b>Dev account</b>
      <button className='btn small' onClick={() => act('devAddCoins', 1e6)}>+1M</button>
      <button className='btn small' onClick={() => act('devAddCoins', 1e9)}>+1B</button>
      <button className='btn small' onClick={() => act('devAddCoins', 1e12)}>+1T</button>
      <button className='btn small' onClick={() => act('devWarp', 3600)}>Skip 1 hour</button>
      <button className='btn small' onClick={() => act('devUnlockAll')}>Unlock all cosmetics</button>
      <button className='btn small ghost danger' onClick={() => act('devReset')}>Reset economy</button>
    </div>
  )
}

// The coin in the air. No 3D transforms (they clip the coin in Chromium):
// it squashes to its edge and back, showing the other face each half turn,
// rises and falls, and lands on `land`. Driven frame by frame.
const FLIP_MS = 1500
const HALF_TURNS = 10 // an even number lands on the face it started showing
function SpinningCoin ({ skin, land, spin }) {
  const [t, setT] = useState(spin ? 0 : 1)
  useEffect(() => {
    if (!spin) { setT(1); return }
    const start = performance.now()
    let id
    const step = (now) => {
      const k = Math.min(1, (now - start) / FLIP_MS)
      setT(k)
      if (k < 1) id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [spin])
  const calm = document.documentElement.classList.contains('calm')
  const eased = 1 - (1 - t) ** 3 // fast up, slowing down
  const angle = (calm ? 1 : eased) * HALF_TURNS * Math.PI
  const halves = Math.floor(angle / Math.PI + 0.5) // which face is showing
  const other = land === 'heads' ? 'tails' : 'heads'
  const face = halves % 2 === 0 ? land : other
  const squash = Math.max(0.02, Math.abs(Math.cos(angle)))
  const lift = calm ? 0 : Math.sin(Math.PI * t) * 60
  // A real disc: as it turns, its back rim slides out to one side and the
  // milled edge between the two shows, widest when the coin is edge-on.
  const THICK = 14
  const offset = THICK * Math.sin(angle) * (Math.cos(angle) < 0 ? -1 : 1)
  const [hi, mid, lo, ink] = SKINS[skin] || SKINS.gold
  const rim = { position: 'absolute', top: 0, height: 150, borderRadius: '50%', width: 150 * squash, left: 75 - (150 * squash) / 2 }
  return (
    <div className='flipcoin flat' style={{ transform: `translateY(${-lift}px)` }} aria-live='polite'>
      <i aria-hidden='true' style={{ ...rim, transform: `translateX(${offset}px)`, background: `radial-gradient(circle at 50% 50%, ${mid}, ${lo})` }} />
      <i aria-hidden='true' style={{ position: 'absolute', top: 0, height: 150, left: 75 + Math.min(0, offset), width: Math.abs(offset), background: `repeating-linear-gradient(0deg, ${lo} 0 2px, ${mid} 2px 4px), ${lo}`, boxShadow: `inset 0 0 0 1px ${ink}33` }} />
      <div style={{ position: 'absolute', inset: 0, transform: `scaleX(${squash})` }}><CoinArt skin={skin} side={face} size={150} thick={false} /></div>
      <i aria-hidden='true' style={{ ...rim, background: `linear-gradient(90deg, transparent 40%, ${hi}22 50%, transparent 60%)`, pointerEvents: 'none' }} />
    </div>
  )
}

// The muse: how inspired the wirdhouse is, and what that's doing to it.
function Muse ({ m }) {
  if (!m) return null
  const pct = Math.round(m.level * 100)
  const mins = Math.round((m.drainSecs / 60) * 10) / 10
  return (
    <div className={`muse-meter ${pct < 25 ? 'low' : ''}`} title={`Your muse is the wirdhouse's inspiration. Each new word you rate fills it ${Math.round(m.fill * 100)}%; it fades to nothing over ${mins} minutes. Full, the wirdhouse runs at ×${m.mult}; empty, at ×${m.floor}.`}>
      <span className='mm-label'>💡 Muse</span>
      <span className='mm-bar'><i style={{ width: `${pct}%` }} /></span>
      <span className='mm-now'>{pct}% · running at <b>×{m.factor.toFixed(2)}</b></span>
      <small className='mm-help'>{pct < 25 ? 'Your muse is fading. Rate a new word to inspire the wirdhouse again.' : `Rate new words to keep it full. It fades over ${mins} min; empty, the wirdhouse slows to ${Math.round(m.floor * 100)}%.`}</small>
    </div>
  )
}
