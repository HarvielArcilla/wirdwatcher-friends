import { useCallback, useEffect, useState } from 'react'
import { api, Coins, useInterval, useToast } from './ui.jsx'
import { formatCoins } from '../shared/economy.js'

// The prediction market: who wins each game in the Wird leagues. Games are
// on a schedule and play out live, the same on every computer. A contract
// pays 100 coins if its team wins; its price is the chance, in coins.

const signed = (n) => `${n >= 0 ? '+' : '−'}${formatCoins(Math.abs(n))}`
const LEAGUE_TABS = [['hoops', '🏀 Basketball'], ['gridiron', '🏈 Football']]

function clockText (c) {
  if (c.status === 'pre') return null
  if (c.status === 'final') return c.q > c.periods ? 'Final (OT)' : 'Final'
  const m = Math.floor(c.clock / 60)
  const s = String(c.clock % 60).padStart(2, '0')
  const period = c.q > c.periods ? (c.sport === 'football' ? 'OT' : `OT${c.q - c.periods > 1 ? c.q - c.periods : ''}`) : `Q${c.q}`
  return `${period} ${m}:${s}`
}
const ordinal = (n) => ['1st', '2nd', '3rd', '4th'][n - 1] || `${n}th`
function ballText (c) {
  if (!c.ball) return null
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
      if (kind === 'buy') toast({ emoji: '🎟️', title: `${formatCoins(out.shares)} contracts at ${out.price}`, text: `Each pays 100 if they win: ${formatCoins(out.shares * 100)} in all.` })
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
        ? <div className='sp-wait'>Loading the {league === 'hoops' ? 'courts' : 'fields'}…</div>
        : open
          ? <GameView id={open} coins={coins} trade={trade} onBack={() => setOpen(null)} />
          : (
            <>
              <p className='lede sp-lede'>{board.league.name}: a {board.league.sport === 'basketball' ? 'basketball game every half hour' : 'football game every hour, at quarter past'}, played live and the same on every computer. Buy a team at its chance of winning; each contract pays <Coins n={board.payout} /> if they win. Sell back any time before the end.</p>
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
                  <div className='sp-hist'>{board.history.map((h, i) => <div key={i}><span>{h.away} @ {h.home}</span><small>{h.how === 'sold' ? 'sold early' : `${h.score.away}–${h.score.home}`}</small><b className={h.gain >= 0 ? 'up' : 'down'}>{signed(h.gain)}</b></div>)}</div>
                </section>
              )}
            </>
            )}
    </div>
  )
}

function Chance ({ c }) {
  const home = Math.round(c.chance * 100)
  return (
    <div className='sp-chance' title={`${c.home.code} ${home}% · ${c.away.code} ${100 - home}%`}>
      <i className='away' style={{ width: `${100 - home}%` }} />
      <i className='home' style={{ width: `${home}%` }} />
    </div>
  )
}

function BuyButtons ({ c, trade, coins, amount }) {
  const can = c.open && amount >= 1 && amount <= coins
  return (
    <div className='sp-buy'>
      {['away', 'home'].map((side) => (
        <button key={side} className={`btn sp-side ${side}`} disabled={!can} onClick={(e) => { e.stopPropagation(); trade('buy', c.id, side, amount) }}>
          <b>{c[side].code}</b><span>{Math.round((side === 'home' ? c.chance : 1 - c.chance) * 100)}%</span><small>buy at {c.quotes[side].ask}</small>
        </button>
      ))}
    </div>
  )
}

function GameCard ({ c, trade, coins, onOpen }) {
  const [amt, setAmt] = useState('100')
  const n = Number(amt) || 0
  const lead = c.home.score > c.away.score ? 'home' : c.away.score > c.home.score ? 'away' : null
  return (
    <div className={`sp-card ${c.status}`} onClick={onOpen} role='button' tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}>
      <div className='sp-card-top'>
        <span className={`sp-clock ${c.status}`}>{c.status === 'live' && <i className='sp-live-dot' />}{clockText(c) || startText(c.start)}</span>
        {c.bet && <span className='sp-yours'>Yours: <Coins n={c.bet.worth} /> <i className={c.bet.worth - c.bet.cost >= 0 ? 'up' : 'down'}>{signed(c.bet.worth - c.bet.cost)}</i></span>}
      </div>
      <div className='sp-teams'>
        {['away', 'home'].map((side) => (
          <div key={side} className={`sp-team ${lead === side ? 'lead' : ''}`}>
            <span className='sp-tname'><small>{c[side].city}</small><b>{c[side].name}</b></span>
            <span className='sp-score'>{c.status === 'pre' ? '–' : c[side].score}</span>
          </div>
        ))}
      </div>
      <Chance c={c} />
      {c.ball && <small className='sp-ball'>{ballText(c)}</small>}
      {c.last && <p className='sp-last'>{c.last.text}</p>}
      {c.open && (
        <div className='sp-ticket' onClick={(e) => e.stopPropagation()}>
          <input className='field' inputMode='numeric' value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ''))} aria-label='Coins to bet' />
          <BuyButtons c={c} trade={trade} coins={coins} amount={n} />
        </div>
      )}
    </div>
  )
}

function UpcomingRow ({ c, onOpen }) {
  return (
    <button className='sp-row' onClick={onOpen}>
      <span className='sp-when'>{startText(c.start)}</span>
      <span className='sp-match'><b>{c.away.city} {c.away.name}</b> <small>at</small> <b>{c.home.city} {c.home.name}</b></span>
      <span className='sp-odds'>{c.away.code} {Math.round((1 - c.chance) * 100)}% · {c.home.code} {Math.round(c.chance * 100)}%</span>
      <Chance c={c} />
    </button>
  )
}

function FinalRow ({ c, onOpen }) {
  const homeWon = c.home.score > c.away.score
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
    <div className='sp-game'>
      <button className='btn small ghost sp-back' onClick={onBack}>← All games</button>
      <div className='sp-board'>
        <div className='sp-bteam'><small>{g.away.city}</small><b>{g.away.name}</b><span className='sp-bscore'>{g.status === 'pre' ? '–' : g.away.score}</span></div>
        <div className='sp-bmid'>
          <span className={`sp-clock ${g.status}`}>{g.status === 'live' && <i className='sp-live-dot' />}{clockText(g) || startText(g.start)}</span>
          {g.ball && <small>{ballText(g)}</small>}
          <small>{g.status === 'pre' ? `Opening chances: ${g.away.code} ${Math.round((1 - g.chance) * 100)}% · ${g.home.code} ${Math.round(g.chance * 100)}%` : `Started at ${new Date(g.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}</small>
        </div>
        <div className='sp-bteam home'><small>{g.home.city}</small><b>{g.home.name}</b><span className='sp-bscore'>{g.status === 'pre' ? '–' : g.home.score}</span></div>
      </div>
      <div className='sp-game-grid'>
        <div className='panel sp-chart-panel'>
          <h3>Chance to win <small>{g.home.code} {Math.round(g.chance * 100)}% · {g.away.code} {Math.round((1 - g.chance) * 100)}%</small></h3>
          <WinChart g={g} />
          <small className='sp-note'>From the score and the time left{g.sport === 'football' ? ', plus who has the ball and where' : ''}: the lead, and what the stronger team should still add, against how much can still swing. It’s calibrated against thousands of simulated games.</small>
        </div>
        <div className='panel sp-trade'>
          <h3>Bet</h3>
          {g.open
            ? (
              <>
                <input className='field' inputMode='numeric' value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ''))} aria-label='Coins to bet' />
                <div className='mk-presets'>{[100, 1000, 10000].map((x) => <button key={x} className='btn small ghost' onClick={() => setAmt(String(x))}>{formatCoins(x)}</button>)}<button className='btn small ghost' onClick={() => setAmt(String(Math.floor(coins * 0.1)))}>10%</button></div>
                <BuyButtons c={g} trade={trade} coins={coins} amount={n} />
                {n > 0 && <small className='sp-note'>{['away', 'home'].map((s) => `${g[s].code} pays ${formatCoins((n / g.quotes[s].ask) * 100)} if they win`).join(' · ')}</small>}
              </>
              )
            : <p className='lede'>{g.status === 'final' ? 'This game is over.' : 'Betting opens a few games ahead.'}</p>}
          {b && (
            <div className='sp-pos'>
              <h4>Your contracts</h4>
              {['away', 'home'].filter((s) => b[s] > 0).map((s) => (
                <div key={s} className='sp-pos-row'>
                  <span><b>{formatCoins(b[s])}</b> on {g[s].code} <small>paid <Coins n={b[`${s}Cost`]} /></small></span>
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
            ? <ol>{g.plays.map((p, i) => <li key={`${p.at}${i}`} className={`${p.kind} ${p.team || ''} ${p.pts ? 'scored' : ''}`}><span className='sp-pq'>{p.kind === 'period' || p.kind === 'period-end' || p.kind === 'final' ? '' : `Q${p.q > g.periods ? 'OT' : p.q} ${Math.floor(p.clock / 60)}:${String(p.clock % 60).padStart(2, '0')}`}</span><span className='sp-ptext'>{p.team && <b className='sp-pteam'>{g[p.team].code}</b>}{p.text}</span><span className='sp-pscore'>{p.pts ? `${p.away}–${p.home}` : ''}</span></li>)}</ol>
            : <p className='lede'>It hasn’t started yet. Plays show up here as they happen.</p>}
        </div>
        <div className='panel sp-box'>
          <h3>Who’s scored</h3>
          {['away', 'home'].map((s) => (
            <div key={s} className='sp-box-team'>
              <b>{g[s].city} {g[s].name}</b>
              {g.box[s].length ? g.box[s].map(([who, pts]) => <div key={who} className='sp-box-row'><span>{who}</span><b>{pts}</b></div>) : <small className='sp-note'>No points yet.</small>}
              <details><summary>Roster</summary><small>{g.rosters[s].join(' · ')}</small></details>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function WinChart ({ g }) {
  const pts = g.chart
  if (pts.length < 2) return <div className='sp-chart empty'><span>{Math.round(g.chance * 100)}%</span></div>
  const t0 = g.start
  const t1 = Math.max(pts[pts.length - 1][0], t0 + 1)
  const x = (t) => ((t - t0) / (t1 - t0)) * 100
  const y = (p) => 100 - p * 100
  const line = pts.map(([t, p]) => `${x(t)},${y(p)}`).join(' ')
  return (
    <div className='sp-chart'>
      <svg viewBox='0 0 100 100' preserveAspectRatio='none' aria-label={`${g.home.code} chance to win over the game`}>
        <line x1='0' x2='100' y1='50' y2='50' className='mid' vectorEffect='non-scaling-stroke' />
        <polygon points={`0,50 ${line} ${x(pts[pts.length - 1][0])},50`} className='area' />
        <polyline points={line} fill='none' stroke='currentColor' strokeWidth='2' vectorEffect='non-scaling-stroke' />
      </svg>
      <span className='sp-axis top'>{g.home.code} 100%</span>
      <span className='sp-axis bottom'>{g.away.code} 100%</span>
    </div>
  )
}
