import { useCallback, useEffect, useState } from 'react'
import { api, Coins, useInterval, useToast } from './ui.jsx'
import { formatCoins } from '../shared/economy.js'
import { Field } from './Field.jsx'
import { RaceBoard, RaceView } from './Races.jsx'

// The prediction market: who wins each game in the Wird leagues. Games are
// on a schedule and play out live, the same on every computer. A contract
// pays 100 coins if its team wins; its price is the chance, in coins.

// How much to bet, with all in.
export function AmountInput ({ amt, setAmt, coins }) {
  return (
    <span className='sp-amt' onClick={(e) => e.stopPropagation()}>
      <input className='field' inputMode='numeric' value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ''))} aria-label='Coins to bet' />
      <button className='btn small ghost allin' disabled={!(coins >= 1)} onClick={() => setAmt(String(Math.floor(coins)))} title='Bet everything you have'>All in</button>
    </span>
  )
}
const signed = (n) => `${n >= 0 ? '+' : '−'}${formatCoins(Math.abs(n))}`
const LEAGUE_TABS = [['hoops', '🏀 Basketball'], ['gridiron', '🏈 Football'], ['pitch', '⚽ Soccer'], ['ring', '🥊 Boxing'], ['cage', '🥋 MMA'], ['f1', '🏎️ Formula 1'], ['derby', '🏇 Horse racing'], ['vote', '🗳️ Politics'], ['pop', '🎬 Pop culture']]

// The game clock, live: it runs between plays at the game's speed (the
// plays decide everything else). Basketball and football count down each
// period; soccer counts up, with added time shown as 45+.
function useNow (ms = 500) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}
const mmss = (secs) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`
function liveSecs (c, now) {
  const k = c.clockInfo
  if (!k) return c.clock
  const run = k.running ? Math.max(0, (now - k.at) / 1000) * k.speed : 0
  return k.countUp ? k.clock + run : Math.max(0, k.clock - run)
}
function clockText (c, now = Date.now()) {
  if (c.status === 'pre') return null
  if (c.fighters) {
    if (c.status === 'final') return c.method && /KO|Submission/.test(c.method) ? `Final · R${c.q}` : 'Final'
    if (c.last?.kind === 'period-end') return `End of round ${c.q}`
    return `R${c.q} ${mmss(liveSecs(c, now))}`
  }
  if (c.status === 'final') return c.q > c.periods ? 'Final (OT)' : 'Final'
  const k = c.last?.kind
  if (c.sport === 'soccer') {
    if (k === 'half-time') return 'Half time'
    const secs = liveSecs(c, now)
    const regEnd = c.q * 45 * 60
    const added = c.added ? Math.min(secs - regEnd, c.added) : secs - regEnd
    return secs < regEnd ? mmss(secs) : `${c.q === 1 ? 45 : 90}+${mmss(Math.max(0, added))}`
  }
  if (k === 'period-end') return c.q === 2 ? 'Halftime' : c.q >= c.periods ? 'End of regulation' : `End of Q${c.q}`
  const period = c.q > c.periods ? (c.sport === 'football' ? 'OT' : `OT${c.q - c.periods > 1 ? c.q - c.periods : ''}`) : `Q${c.q}`
  return `${period} ${mmss(liveSecs(c, now))}`
}
// Redraw the moment the shown second changes. A fixed timer drifts
// against the game clock (a 250 ms timer on soccer's 3× clock moves it
// 0.75 s a beat, so whole seconds came in an uneven 1-1-0 rhythm); this
// waits exactly until the next whole game second instead.
function useClockNow (c) {
  const [now, setNow] = useState(Date.now())
  const k = c.clockInfo
  const running = c.status === 'live' && k?.running
  useEffect(() => {
    let t
    const tick = () => {
      const at = Date.now()
      setNow(at)
      if (!running) { t = setTimeout(tick, 5000); return }
      const secs = liveSecs(c, at)
      const frac = k.countUp ? Math.ceil(secs + 1e-6) - secs : secs - Math.floor(secs)
      t = setTimeout(tick, Math.max(16, (frac / k.speed) * 1000 + 4))
    }
    tick()
    return () => clearTimeout(t)
  }, [running, k?.at, k?.clock, k?.speed, c.status]) // eslint-disable-line react-hooks/exhaustive-deps
  return now
}
function Clock ({ c }) {
  const now = useClockNow(c)
  return <>{c.status === 'live' && <i className='sp-live-dot' />}{clockText(c, now) || startText(c.start)}</>
}
const SIDE_ORDER = { home: 2, draw: 1, away: 0 }
// The two teams' colors, as CSS variables for everything under it.
const teamVars = (c) => ({ '--hc': c.home?.color || 'var(--accent)', '--ac': c.away?.color || '#4a9ee8' })
const sideList = (c) => (c.event ? ['home', 'away'] : [...(c.sides || ['home', 'away'])].sort((a, b) => SIDE_ORDER[a] - SIDE_ORDER[b]))
const sideName = (c, side) => (side === 'draw' ? 'Draw' : c.event ? c.sideNames[side] : c[side].code)
// Under a name: the city, or for a fighter, the nickname and hometown.
const subName = (t) => (t.nickname ? `“${t.nickname}” · ${t.city}` : t.city)
const fullName = (c, side) => (c.fighters ? c[side].name : `${c[side].city} ${c[side].name}`)

const ordinal = (n) => ['1st', '2nd', '3rd', '4th'][n - 1] || `${n}th`
function ballText (c) {
  if (!c.ball) return null
  if (c.sport === 'soccer') { const T = c.ball.side === 'home' ? c.home : c.away; return `⚽ ${T.code} on the ball` }
  const T = c.ball.side === 'home' ? c.home : c.away
  const where = c.ball.yl === 50 ? 'midfield' : c.ball.yl < 50 ? `own ${c.ball.yl}` : `opp ${100 - c.ball.yl}`
  return `🏈 ${T.code} · ${ordinal(c.ball.down)} & ${c.ball.togo >= 100 - c.ball.yl ? 'goal' : c.ball.togo} at ${where}`
}
function startText (t) {
  const d = new Date(t)
  const mins = Math.round((t - Date.now()) / 60000)
  return `${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${mins > 0 && mins < 120 ? ` · in ${mins} min` : ''}`
}

export default function Sportsbook ({ coins }) {
  const toast = useToast()
  const [league, setLeague] = useState(() => { try { return localStorage.getItem('sports-league') || 'hoops' } catch { return 'hoops' } })
  const [board, setBoard] = useState(null)
  const [open, setOpen] = useState(null)
  const load = useCallback(() => { api('sportsBoard', league).then(setBoard).catch(() => {}) }, [league])
  useEffect(() => { setBoard(null); load(); try { localStorage.setItem('sports-league', league) } catch {} }, [load]) // eslint-disable-line react-hooks/exhaustive-deps
  useInterval(load, 3000)
  const trade = async (kind, id, side, amount) => {
    try {
      const out = await api('sportsTrade', kind, id, side, amount)
      if (kind === 'buy') toast({ emoji: '🎟️', title: `${formatCoins(out.shares)} contracts at ${out.price}`, text: `Each pays 100 if it comes true: ${formatCoins(out.shares * 100)} in all.` })
      else toast({ emoji: '💰', title: 'Sold back', text: `${formatCoins(out.pay)} coins, ${signed(out.gain)}.` })
      load()
      return true
    } catch (err) { toast({ error: true, title: 'Couldn’t do that', text: err.message }); return false }
  }
  return (
    <div className='sports'>
      <div className='sp-top'>
        <div className='seg'>{LEAGUE_TABS.map(([id, label]) => <button key={id} className={league === id ? 'on' : ''} onClick={() => { setLeague(id); setOpen(null) }}>{label}</button>)}</div>
        {board && <div className='sp-stats'><span><small>Bets</small><b>{board.stats.count}</b></span><span><small>Won–lost</small><b>{board.stats.won}–{board.stats.lost}</b></span><span><small>All told</small><b className={board.stats.net >= 0 ? 'up' : 'down'}>{signed(board.stats.net)}</b></span></div>}
      </div>
      {!board
        ? <div className='sp-wait'>Loading {league === 'hoops' ? 'the courts' : league === 'ring' ? 'the ring' : league === 'cage' ? 'the cage' : league === 'vote' || league === 'pop' ? 'the questions' : league === 'f1' ? 'the grid' : league === 'derby' ? 'the stables' : 'the fields'}…</div>
        : open
          ? (open.startsWith('vote-') || open.startsWith('pop-') ? <EventView id={open} coins={coins} trade={trade} onBack={() => setOpen(null)} /> : open.startsWith('f1-') || open.startsWith('derby-') ? <RaceView id={open} coins={coins} trade={trade} onBack={() => setOpen(null)} /> : <GameView id={open} coins={coins} trade={trade} onBack={() => setOpen(null)} />)
          : board.league.race
            ? <RaceBoard board={board} coins={coins} trade={trade} onOpen={setOpen} />
            : board.league.event
              ? <EventBoard board={board} coins={coins} trade={trade} onOpen={setOpen} />
              : (
                <>
                  <p className='lede sp-lede'>{board.league.name}: {board.league.sport === 'boxing' ? 'a ten-round fight' : board.league.sport === 'mma' ? 'a three-round fight' : board.league.sport === 'soccer' ? 'a match' : 'a game'} every {Math.round(board.league.every / 60000)} minutes, with every clock at twice real time, played live and the same on every computer. Buy a {board.league.sport === 'soccer' ? 'result (either team, or the draw)' : board.league.sport === 'boxing' || board.league.sport === 'mma' ? 'result (either fighter, or a draw)' : 'team'} at its chance; each contract pays <Coins n={board.payout} /> if it comes true. Sell back any time before the end.</p>
                  {board.mine.length > 0 && (
                    <section className='sp-sec'>
                      <h3>Your bets</h3>
                      <div className='sp-cards'>{board.mine.map((c) => <GameCard key={c.id} c={c} trade={trade} coins={coins} onOpen={() => setOpen(c.id)} />)}</div>
                    </section>
                  )}
                  <section className='sp-sec'>
                    <h3>Live {board.live.length > 0 && <i className='sp-live-dot' />}</h3>
                    {board.live.filter((c) => !c.bet).length
                      ? <div className='sp-cards'>{board.live.filter((c) => !c.bet).map((c) => <GameCard key={c.id} c={c} trade={trade} coins={coins} onOpen={() => setOpen(c.id)} />)}</div>
                      : <p className='lede'>{board.live.length ? 'The game on now is up in your bets.' : 'Nothing on right now. The next game is below.'}</p>}
                  </section>
                  <section className='sp-sec'>
                    <h3>Coming up</h3>
                    <div className='sp-rows'>{board.upcoming.map((c) => <UpcomingRow key={c.id} c={c} onOpen={() => setOpen(c.id)} />)}</div>
                  </section>
                  <section className='sp-sec'>
                    <h3>Recent finals</h3>
                    <div className='sp-rows'>{board.recent.map((c) => <FinalRow key={c.id} c={c} onOpen={() => setOpen(c.id)} />)}</div>
                  </section>
                  {board.history.length > 0 && (
                    <section className='sp-sec'>
                      <h3>Settled</h3>
                      <div className='sp-hist'>{board.history.map((h, i) => <div key={i}><span>{h.how === 'refunded' ? 'A game from the old schedule' : `${h.away} @ ${h.home}`}</span><small>{h.how === 'sold' ? 'sold early' : h.how === 'refunded' ? 'refunded (schedule changed)' : h.method || `${h.score.away}–${h.score.home}`}</small><b className={h.gain >= 0 ? 'up' : 'down'}>{signed(h.gain)}</b></div>)}</div>
                    </section>
                  )}
                </>
                )}
    </div>
  )
}

// --- politics and pop culture ------------------------------------------------------------
function untilText (end, now = Date.now()) {
  const m = Math.max(0, Math.round((end - now) / 60000))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`
}

function EventBoard ({ board, coins, trade, onOpen }) {
  useNow(30000)
  const mine = board.mine
  const live = board.live.filter((c) => !c.bet)
  return (
    <>
      <p className='lede sp-lede'>{board.league.name}: new questions open through the day and several run at once. Each one closes at a set time and settles on what happened. Buy an answer at its chance; each contract pays <Coins n={board.payout} /> if it comes true. Sell back any time before it closes.</p>
      {mine.length > 0 && (
        <section className='sp-sec'>
          <h3>Your bets</h3>
          <div className='sp-cards ev-cards'>{mine.map((c) => <EventCard key={c.id} c={c} trade={trade} coins={coins} onOpen={() => onOpen(c.id)} />)}</div>
        </section>
      )}
      <section className='sp-sec'>
        <h3>Open now {live.length > 0 && <i className='sp-live-dot' />}</h3>
        {live.length ? <div className='sp-cards ev-cards'>{live.map((c) => <EventCard key={c.id} c={c} trade={trade} coins={coins} onOpen={() => onOpen(c.id)} />)}</div> : <p className='lede'>Nothing open right now. The next questions are below.</p>}
      </section>
      <section className='sp-sec'>
        <h3>Opening soon</h3>
        <div className='sp-rows'>{board.upcoming.map((c) => <button key={c.id} className='sp-row ev-row' onClick={() => onOpen(c.id)}><span className='sp-when'>{startText(c.start)}</span><span className='sp-match'><b>{c.question}</b></span><span className='sp-odds'>{c.tag}</span></button>)}</div>
      </section>
      <section className='sp-sec'>
        <h3>Recently decided</h3>
        <div className='sp-rows'>{board.recent.map((c) => <button key={c.id} className='sp-row final ev-row' onClick={() => onOpen(c.id)}><span className='sp-when'>{new Date(c.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><span className='sp-match'><b>{c.question}</b></span><span className='sp-odds ev-result'>{c.sideNames[c.winner]}</span></button>)}</div>
      </section>
      {board.history.length > 0 && (
        <section className='sp-sec'>
          <h3>Settled</h3>
          <div className='sp-hist'>{board.history.map((h, i) => <div key={i}><span>{h.title || `${h.away} / ${h.home}`}</span><small>{h.how === 'sold' ? 'sold early' : h.how === 'refunded' ? 'refunded' : h.result}</small><b className={h.gain >= 0 ? 'up' : 'down'}>{signed(h.gain)}</b></div>)}</div>
        </section>
      )}
    </>
  )
}

function EventCard ({ c, trade, coins, onOpen }) {
  const [amt, setAmt] = useState('100')
  const n = Number(amt) || 0
  return (
    <div className={`sp-card ev-card ${c.status}`} onClick={onOpen} role='button' tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}>
      <div className='sp-card-top'>
        <span className='ev-tag'>{c.tag}</span>
        <span className='ev-close'>{c.status === 'final' ? 'Closed' : `Closes in ${untilText(c.end)}`}</span>
      </div>
      <b className='ev-q' title={c.question}>{c.question}</b>
      <div className='ev-sides'>
        {['home', 'away'].map((s) => <div key={s} className={`ev-side ${s} ${c.winner === s ? 'won' : ''}`}><span title={c.sideNames[s]}>{c.sideNames[s]}</span><b>{Math.round(c.chances[s] * 100)}%</b></div>)}
      </div>
      <div className='ev-bar'><i style={{ width: `${c.chances.home * 100}%` }} /></div>
      {c.bet && <span className='sp-yours'>Yours: <Coins n={c.bet.worth} /> <i className={c.bet.worth - c.bet.cost >= 0 ? 'up' : 'down'}>{signed(c.bet.worth - c.bet.cost)}</i></span>}
      {c.open && (
        <div className='sp-ticket' onClick={(e) => e.stopPropagation()}>
          <AmountInput amt={amt} setAmt={setAmt} coins={coins} />
          <BuyButtons c={c} trade={trade} coins={coins} amount={n} />
        </div>
      )}
    </div>
  )
}

function EventView ({ id, coins, trade, onBack }) {
  const [g, setG] = useState(null)
  const [amt, setAmt] = useState('100')
  const load = useCallback(() => { api('sportsGame', id).then(setG).catch(() => {}) }, [id])
  useEffect(() => { load() }, [load])
  useInterval(load, 20000)
  useNow(30000)
  if (!g) return <div className='sp-wait'>Loading…</div>
  const n = Number(amt) || 0
  const b = g.bet
  return (
    <div className='sp-game'>
      <button className='btn small ghost sp-back' onClick={onBack}>← All questions</button>
      <div className='panel ev-head'>
        <span className='ev-tag'>{g.tag}</span>
        <h2>{g.question}</h2>
        <div className='ev-sides big'>
          {['home', 'away'].map((s) => <div key={s} className={`ev-side ${s} ${g.winner === s ? 'won' : ''}`}><span>{g.sideNames[s]}{g.winner === s ? ' ✓' : ''}</span><b>{Math.round(g.chances[s] * 100)}%</b></div>)}
        </div>
        <small className='sp-note'>{g.status === 'pre' ? `Opens at ${startText(g.start)}` : g.status === 'final' ? `Closed ${new Date(g.end).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}: ${g.sideNames[g.winner]}` : `Closes in ${untilText(g.end)} (${new Date(g.end).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })})`}</small>
      </div>
      <div className='sp-game-grid'>
        <div className='panel sp-chart-panel'>
          <h3>Chance <small>{g.sideNames.home} {Math.round(g.chances.home * 100)}% · {g.sideNames.away} {Math.round(g.chances.away * 100)}%</small></h3>
          <EventChart g={g} />
          <small className='sp-note'>Moves as support shifts, and settles toward 0% or 100% as the close gets nearer.</small>
        </div>
        <div className='panel sp-trade'>
          <h3>Bet</h3>
          {g.open
            ? (
              <>
                <AmountInput amt={amt} setAmt={setAmt} coins={coins} />
                <div className='mk-presets'>{[100, 1000, 10000].map((x) => <button key={x} className='btn small ghost' onClick={() => setAmt(String(x))}>{formatCoins(x)}</button>)}<button className='btn small ghost' onClick={() => setAmt(String(Math.floor(coins * 0.1)))}>10%</button></div>
                <BuyButtons c={g} trade={trade} coins={coins} amount={n} />
                {n > 0 && <small className='sp-note'>{['home', 'away'].map((s) => `${g.sideNames[s]} pays ${formatCoins((n / g.quotes[s].ask) * 100)}`).join(' · ')}</small>}
              </>
              )
            : <p className='lede'>{g.status === 'final' ? 'This question has closed.' : 'This question isn’t open yet.'}</p>}
          {b && (
            <div className='sp-pos'>
              <h4>Your contracts</h4>
              {['home', 'away'].filter((s) => b[s] > 0).map((s) => (
                <div key={s} className='sp-pos-row'>
                  <span><b>{formatCoins(b[s])}</b> on {g.sideNames[s]} <small>paid <Coins n={b[`${s}Cost`]} /></small></span>
                  {g.open && <button className='btn small' onClick={() => trade('sell', g.id, s, 'all')}>Sell for {formatCoins(b[s] * g.quotes[s].bid)}</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EventChart ({ g }) {
  const pts = g.chart
  if (pts.length < 2) return <div className='sp-chart empty'><span>{Math.round(g.chances.home * 100)}%</span></div>
  const t0 = g.start
  const t1 = g.end
  const x = (t) => ((t - t0) / (t1 - t0)) * 100
  const line = pts.map(([t, h]) => `${x(t)},${100 - h * 100}`).join(' ')
  return (
    <div className='sp-chart'>
      <svg viewBox='0 0 100 100' preserveAspectRatio='none' aria-label='The chance over time'>
        <line x1='0' x2='100' y1='50' y2='50' className='mid' vectorEffect='non-scaling-stroke' />
        <polyline points={line} fill='none' className='home-line ev-line' strokeWidth='2' vectorEffect='non-scaling-stroke' />
      </svg>
      <span className='sp-axis top'>100%</span>
      <span className='sp-axis bottom'>0%</span>
      <span className='sp-key'><i className='home ev-key' />{g.sideNames.home}</span>
    </div>
  )
}

function Chance ({ c }) {
  const ch = c.chances || { home: c.chance, away: 1 - c.chance }
  return (
    <div className='sp-chance' title={sideList(c).map((s) => `${sideName(c, s)} ${Math.round(ch[s] * 100)}%`).join(' · ')}>
      {sideList(c).map((s) => <i key={s} className={s} style={{ width: `${ch[s] * 100}%` }} />)}
    </div>
  )
}

function BuyButtons ({ c, trade, coins, amount }) {
  const can = c.open && amount >= 1 && amount <= coins
  const ch = c.chances || { home: c.chance, away: 1 - c.chance }
  const sides = sideList(c)
  return (
    <div className={`sp-buy n${sides.length} ${c.event ? 'ev' : ''}`}>
      {sides.map((side) => (
        <button key={side} className={`btn sp-side ${side}`} disabled={!can} onClick={(e) => { e.stopPropagation(); trade('buy', c.id, side, amount) }}>
          <b title={sideName(c, side)}>{sideName(c, side)}</b><span>{Math.round(ch[side] * 100)}%</span><small>buy at {c.quotes[side].ask}</small>
        </button>
      ))}
    </div>
  )
}

function GameCard ({ c, trade, coins, onOpen }) {
  const [amt, setAmt] = useState('100')
  const n = Number(amt) || 0
  const lead = c.fighters ? c.winner : c.home.score > c.away.score ? 'home' : c.away.score > c.home.score ? 'away' : null
  return (
    <div className={`sp-card ${c.status}`} style={teamVars(c)} onClick={onOpen} role='button' tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}>
      <div className='sp-card-top'>
        <span className={`sp-clock ${c.status}`}><Clock c={c} /></span>
        {c.bet && <span className='sp-yours'>Yours: <Coins n={c.bet.worth} /> <i className={c.bet.worth - c.bet.cost >= 0 ? 'up' : 'down'}>{signed(c.bet.worth - c.bet.cost)}</i></span>}
      </div>
      <div className='sp-teams'>
        {['away', 'home'].map((side) => (
          <div key={side} className={`sp-team ${lead === side ? 'lead' : ''}`}>
            <span className='sp-tname'><small>{subName(c[side])}</small><b><i className={`sp-swatch ${side}`} />{c[side].name}</b></span>
            <span className='sp-score'>{c.fighters ? fightMark(c, side) : c.status === 'pre' ? '–' : c[side].score}</span>
          </div>
        ))}
      </div>
      <Chance c={c} />
      <Field c={c} />
      {c.ball && <small className='sp-ball'>{ballText(c)}</small>}
      {c.last && <p className='sp-last'>{c.last.text}</p>}
      {c.open && (
        <div className='sp-ticket' onClick={(e) => e.stopPropagation()}>
          <AmountInput amt={amt} setAmt={setAmt} coins={coins} />
          <BuyButtons c={c} trade={trade} coins={coins} amount={n} />
        </div>
      )}
    </div>
  )
}

function UpcomingRow ({ c, onOpen }) {
  return (
    <button className='sp-row' style={teamVars(c)} onClick={onOpen}>
      <span className='sp-when'>{startText(c.start)}</span>
      <span className='sp-match'><b>{fullName(c, 'away')}</b> <small>{c.fighters ? 'vs' : 'at'}</small> <b>{fullName(c, 'home')}</b></span>
      <span className='sp-odds'>{sideList(c).map((s) => `${sideName(c, s)} ${Math.round((c.chances || { home: c.chance, away: 1 - c.chance })[s] * 100)}%`).join(' · ')}</span>
      <Chance c={c} />
    </button>
  )
}

function FinalRow ({ c, onOpen }) {
  const homeWon = c.home.score > c.away.score
  if (c.fighters) {
    return (
      <button className='sp-row final' onClick={onOpen}>
        <span className='sp-when'>{clockText(c)}</span>
        <span className='sp-match'><b className={c.winner === 'away' ? 'won' : ''}>{c.away.name}</b> <small>vs</small> <b className={c.winner === 'home' ? 'won' : ''}>{c.home.name}</b></span>
        <span className='sp-odds'>{c.last?.text}</span>
      </button>
    )
  }
  return (
    <button className='sp-row final' onClick={onOpen}>
      <span className='sp-when'>{clockText(c)}</span>
      <span className='sp-match'><b className={!homeWon ? 'won' : ''}>{c.away.name} {c.away.score}</b> <small>at</small> <b className={homeWon ? 'won' : ''}>{c.home.name} {c.home.score}</b></span>
      <span className='sp-odds'>{c.last?.text}</span>
    </button>
  )
}

function GameView ({ id, coins, trade, onBack }) {
  const [g, setG] = useState(null)
  const [amt, setAmt] = useState('100')
  const load = useCallback(() => { api('sportsGame', id).then(setG).catch(() => {}) }, [id])
  useEffect(() => { load() }, [load])
  useInterval(load, g?.status === 'live' ? 2000 : 15000)
  if (!g) return <div className='sp-wait'>Loading…</div>
  const n = Number(amt) || 0
  const b = g.bet
  return (
    <div className='sp-game' style={teamVars(g)}>
      <button className='btn small ghost sp-back' onClick={onBack}>← All games</button>
      <div className='sp-board'>
        <div className='sp-bteam away'><small>{subName(g.away)}</small><b>{g.away.name}</b><span className='sp-bscore'>{g.fighters ? fightMark(g, 'away') : g.status === 'pre' ? '–' : g.away.score}</span></div>
        <div className='sp-bmid'>
          <span className={`sp-clock ${g.status}`}><Clock c={g} /></span>
          {g.ball && <small>{ballText(g)}</small>}
          {g.ball && <div className='sp-bfield'><Field c={g} big /></div>}
          {g.fighters && <small>{g.method || 'Chance to win'}</small>}
          <small>{g.status === 'pre' ? `Opening chances: ${sideList(g).map((s) => `${sideName(g, s)} ${Math.round(g.chances[s] * 100)}%`).join(' · ')}` : `Started at ${new Date(g.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}</small>
        </div>
        <div className='sp-bteam home'><small>{subName(g.home)}</small><b>{g.home.name}</b><span className='sp-bscore'>{g.fighters ? fightMark(g, 'home') : g.status === 'pre' ? '–' : g.home.score}</span></div>
      </div>
      <div className='sp-game-grid'>
        <div className='panel sp-chart-panel'>
          <h3>Chance to win <small>{sideList(g).map((s) => `${sideName(g, s)} ${Math.round(g.chances[s] * 100)}%`).join(' · ')}</small></h3>
          <WinChart g={g} />
          <small className='sp-note'>{g.fighters ? 'From the fight so far: the damage each fighter has taken, how tired they are, and the judges’ cards so far (which stay secret). The gap between the lines is the chance of a draw.' : g.sport === 'soccer' ? 'From the score and the minutes left: the goals each side should still score, at their rates, and every way that could end. The gap between the lines is the chance of a draw.' : `From the score and the time left${g.sport === 'football' ? ', plus who has the ball and where' : ''}: the lead, and what the stronger team should still add, against how much can still swing.`} {g.fighters ? '' : ' It’s checked against thousands of the league’s games.'}</small>
        </div>
        <div className='panel sp-trade'>
          <h3>Bet</h3>
          {g.open
            ? (
              <>
                <AmountInput amt={amt} setAmt={setAmt} coins={coins} />
                <div className='mk-presets'>{[100, 1000, 10000].map((x) => <button key={x} className='btn small ghost' onClick={() => setAmt(String(x))}>{formatCoins(x)}</button>)}<button className='btn small ghost' onClick={() => setAmt(String(Math.floor(coins * 0.1)))}>10%</button></div>
                <BuyButtons c={g} trade={trade} coins={coins} amount={n} />
                {n > 0 && <small className='sp-note'>{sideList(g).map((s) => `${sideName(g, s)} pays ${formatCoins((n / g.quotes[s].ask) * 100)}`).join(' · ')}</small>}
              </>
              )
            : <p className='lede'>{g.status === 'final' ? (g.fighters ? 'This fight is over.' : 'This game is over.') : 'Betting opens a few games ahead.'}</p>}
          {b && (
            <div className='sp-pos'>
              <h4>Your contracts</h4>
              {sideList(g).filter((s) => b[s] > 0).map((s) => (
                <div key={s} className='sp-pos-row'>
                  <span><b>{formatCoins(b[s])}</b> on {s === 'draw' ? 'the draw' : g[s].code} <small>paid <Coins n={b[`${s}Cost`]} /></small></span>
                  {g.open && <button className='btn small' onClick={() => trade('sell', g.id, s, 'all')}>Sell for {formatCoins(b[s] * g.quotes[s].bid)}</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className='sp-game-grid'>
        <div className='panel sp-feed'>
          <h3>Play by play</h3>
          {g.plays.length
            ? <ol>{g.plays.map((p, i) => (g.fighters ? fightLine(g, p, i) : playLine(g, p, i)))}</ol>
            : <p className='lede'>It hasn’t started yet. Plays show up here as they happen.</p>}
        </div>
        {g.fighters ? <FightBox g={g} /> : <ScoreBox g={g} />}
      </div>
      {g.stats && <StatsBox g={g} />}
    </div>
  )
}

// The box score: every player's numbers so far.
const STAT_TABLES = {
  hoops: [['Players', null, [['PTS', (x) => x.pts], ['FG', (x) => `${x.fgm}–${x.fga}`], ['3PT', (x) => `${x.tpm}–${x.tpa}`], ['FT', (x) => `${x.ftm}–${x.fta}`], ['REB', (x) => x.reb], ['OREB', (x) => x.oreb], ['TO', (x) => x.to]]]],
  football: [
    ['Passing', 'passing', [['C/ATT', (x) => `${x.cmp}/${x.att}`], ['YDS', (x) => x.pyds], ['TD', (x) => x.ptd], ['INT', (x) => x.int], ['SACKS', (x) => x.sck]]],
    ['Rushing', 'rushing', [['CAR', (x) => x.car], ['YDS', (x) => x.ryds], ['AVG', (x) => (x.car ? (x.ryds / x.car).toFixed(1) : '0.0')], ['TD', (x) => x.rtd], ['LONG', (x) => x.rlng]]],
    ['Receiving', 'receiving', [['REC', (x) => x.rec], ['YDS', (x) => x.cyds], ['AVG', (x) => (x.rec ? (x.cyds / x.rec).toFixed(1) : '0.0')], ['TD', (x) => x.ctd], ['LONG', (x) => x.clng]]],
    ['Kicking', 'kicking', [['FG', (x) => `${x.fgm}/${x.fga}`], ['XP', (x) => `${x.xpm}/${x.xpa}`]]]
  ]
}
function StatsBox ({ g }) {
  const [side, setSide] = useState('away')
  const tables = STAT_TABLES[g.stats.kind]
  return (
    <div className='panel sp-stats-box' style={teamVars(g)}>
      <div className='sp-stats-head'>
        <h3>Box score</h3>
        <div className='seg'>{['away', 'home'].map((s) => <button key={s} className={side === s ? 'on' : ''} onClick={() => setSide(s)}><i className={`sp-swatch ${s}`} />{g[s].city} {g[s].name}</button>)}</div>
      </div>
      <div className='sp-stat-tables'>
        {tables.map(([title, key, cols]) => {
          const rows = key ? g.stats[side][key] : g.stats[side]
          return (
            <table key={title} className='sp-stat-table'>
              <thead><tr><th>{title}</th>{cols.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.length ? rows.map((x) => <tr key={x.who}><td>{x.who}</td>{cols.map(([h, f]) => <td key={h}>{f(x)}</td>)}</tr>) : <tr><td colSpan={cols.length + 1} className='sp-note'>Nothing yet.</td></tr>}
              </tbody>
            </table>
          )
        })}
      </div>
    </div>
  )
}

// What a player has scored, as little labels.
function scoreTags (r) {
  const n = (x, one, many) => (x > 1 ? `${x} ${many}` : one)
  const out = []
  if (r.pts) out.push(['pts', `${r.pts} pts`])
  if (r.pass) out.push(['pass', n(r.pass, 'Passing TD', 'passing TDs')])
  if (r.rec) out.push(['rec', n(r.rec, 'Receiving TD', 'receiving TDs')])
  if (r.rush) out.push(['rush', n(r.rush, 'Rushing TD', 'rushing TDs')])
  if (r.fg) out.push(['fg', n(r.fg, 'Field goal', 'field goals')])
  if (r.xp) out.push(['xp', n(r.xp, 'Extra point', 'extra points')])
  if (r.safety) out.push(['safety', n(r.safety, 'Safety', 'safeties')])
  if (r.goal) out.push(['goal', `${'⚽'.repeat(Math.min(r.goal, 4))}${r.goal > 4 ? ` ×${r.goal}` : ''}`])
  if (r.assist) out.push(['assist', n(r.assist, 'Assist', 'assists')])
  return out
}

// Who's scored, team by team.
function ScoreBox ({ g }) {
  return (
    <div className='panel sp-box'>
      <h3>{g.sport === 'soccer' ? 'Goals' : 'Who’s scored'}</h3>
      {['away', 'home'].map((s) => (
        <div key={s} className='sp-box-team'>
          <b>{g[s].city} {g[s].name}</b>
          {g.box[s].length ? g.box[s].map((row) => <div key={row.who} className='sp-box-row'><span>{row.who}</span><span className='sp-tags'>{scoreTags(row).map(([k, label]) => <i key={k} className={`sp-tag ${k}`}>{label}</i>)}</span></div>) : <small className='sp-note'>{g.sport === 'soccer' ? 'No goals yet.' : 'No points yet.'}</small>}
          <details><summary>Roster</summary><small>{g.rosters[s].join(' · ')}</small></details>
        </div>
      ))}
    </div>
  )
}

// One line of the play by play.
function playLine (g, p, i) {
  return <li key={`${p.at}${i}`} className={`k-${p.kind} ${p.team || ''} ${p.pts ? 'scored' : ''}`}><span className='sp-pq'>{['period', 'period-end', 'half-time', 'final', 'added'].includes(p.kind) ? '' : g.sport === 'soccer' ? `${Math.min(p.q * 45, Math.floor(p.clock / 60) + 1)}${p.clock >= p.q * 2700 ? `+${Math.floor((p.clock - p.q * 2700) / 60) + 1}` : ''}′` : `Q${p.q > g.periods ? 'OT' : p.q} ${Math.floor(p.clock / 60)}:${String(p.clock % 60).padStart(2, '0')}`}</span><span className='sp-ptext'>{p.team && <b className='sp-pteam'>{g[p.team].code}</b>}{p.text}</span><span className='sp-pscore'>{p.pts ? `${p.away}–${p.home}` : ''}</span></li>
}
function fightLine (g, p, i) {
  return <li key={`${p.at}${i}`} className={`k-${p.kind} ${p.team || ''} ${['kd', 'finish'].includes(p.kind) ? 'scored' : ''}`}><span className='sp-pq'>{['period', 'period-end', 'final'].includes(p.kind) ? '' : `R${p.q} ${Math.floor(p.clock / 60)}:${String(p.clock % 60).padStart(2, '0')}`}</span><span className='sp-ptext'>{p.team && <b className='sp-pteam'>{g[p.team].code}</b>}{p.text}</span><span className='sp-pscore' /></li>
}

// In a fight's score spot: each fighter's chance, and at the end who won.
// The rounds stay on the judges' cards until then.
function fightMark (c, side) {
  if (c.status === 'final') return c.winner === side ? 'W' : c.winner === 'draw' ? 'D' : 'L'
  const ch = c.chances || { home: c.chance, away: 1 - c.chance }
  return <>{Math.round(ch[side] * 100)}<small className='sp-pct'>%</small></>
}

// A fight's numbers: shots, knockdowns, takedowns, and the judges' cards.
function FightBox ({ g }) {
  const f = g.fight
  const mma = g.sport === 'mma'
  const rows = [
    [mma ? 'Strikes landed' : 'Punches landed', (s) => `${s.landed} of ${s.thrown}`],
    [mma ? 'Big shots' : 'Power punches', (s) => s.power],
    ['Knockdowns', (s) => s.kd],
    ...(mma ? [['Takedowns', (s) => s.td], ['Submission tries', (s) => s.sub]] : [])
  ]
  return (
    <div className='panel sp-box sp-fightbox'>
      <h3>The fight</h3>
      {f
        ? (
          <>
            <table className='sp-ftable'>
              <thead><tr><th /><th>{g.away.code}</th><th>{g.home.code}</th></tr></thead>
              <tbody>{rows.map(([label, v]) => <tr key={label}><td>{label}</td><td>{v(f.stats.away)}</td><td>{v(f.stats.home)}</td></tr>)}</tbody>
            </table>
            <h4>Judges’ cards {f.rounds && <small>{g.home.code}–{g.away.code}</small>}</h4>
            {!f.rounds
              ? <small className='sp-note'>Kept secret until the fight is over.</small>
              : f.rounds.length
                ? <div>{f.rounds.map((r) => <div key={r.round} className='sp-box-row'><span>Round {r.round}</span><span className='sp-tags'><small>{r.cards}</small><i className='sp-tag'>{r.team ? g[r.team].code : 'Even'}</i></span></div>)}</div>
                : <small className='sp-note'>It ended before the judges were needed.</small>}
          </>
          )
        : <small className='sp-note'>The opening bell hasn’t gone yet.</small>}
    </div>
  )
}

function WinChart ({ g }) {
  const pts = g.chart
  if (pts.length < 2) return <div className='sp-chart empty'><span>{Math.round(g.chances.home * 100)}%</span></div>
  const t0 = g.start
  const t1 = Math.max(pts[pts.length - 1][0], t0 + 1)
  const x = (t) => ((t - t0) / (t1 - t0)) * 100
  const y = (p) => 100 - p * 100
  const home = pts.map(([t, h]) => `${x(t)},${y(h)}`).join(' ')
  const away = pts.map(([t, , a]) => `${x(t)},${y(a)}`).join(' ')
  return (
    <div className='sp-chart'>
      <svg viewBox='0 0 100 100' preserveAspectRatio='none' aria-label='Each side’s chance to win over the game'>
        <line x1='0' x2='100' y1='50' y2='50' className='mid' vectorEffect='non-scaling-stroke' />
        {(g.sport === 'soccer' || g.fighters) && <polyline points={away} fill='none' className='away-line' strokeWidth='2' vectorEffect='non-scaling-stroke' />}
        <polyline points={home} fill='none' className='home-line' strokeWidth='2' vectorEffect='non-scaling-stroke' />
      </svg>
      <span className='sp-axis top'>100%</span>
      <span className='sp-axis bottom'>0%</span>
      <span className='sp-key'><i className='home' />{g.home.code}{g.sport === 'soccer' || g.fighters ? <> <i className='away' />{g.away.code} · the gap is the draw</> : ' to win'}</span>
    </div>
  )
}
