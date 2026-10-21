import { useCallback, useEffect, useState } from 'react'
import { api, Coins, useInterval, useToast } from './ui.jsx'
import { formatCoins } from '../shared/economy.js'
import { Field } from './Field.jsx'

// The prediction market: who wins each game in the Wird leagues. Games are
// on a schedule and play out live, the same on every computer. A contract
// pays 100 coins if its team wins; its price is the chance, in coins.

const signed = (n) => `${n >= 0 ? '+' : '−'}${formatCoins(Math.abs(n))}`
const LEAGUE_TABS = [['hoops', '🏀 Basketball'], ['gridiron', '🏈 Football'], ['pitch', '⚽ Soccer']]

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
function Clock ({ c }) {
  const now = useNow(c.status === 'live' ? 250 : 5000)
  return <>{c.status === 'live' && <i className='sp-live-dot' />}{clockText(c, now) || startText(c.start)}</>
}
const SIDE_ORDER = { home: 2, draw: 1, away: 0 }
// The two teams' colors, as CSS variables for everything under it.
const teamVars = (c) => ({ '--hc': c.home?.color || 'var(--accent)', '--ac': c.away?.color || '#4a9ee8' })
const sideList = (c) => [...(c.sides || ['home', 'away'])].sort((a, b) => SIDE_ORDER[a] - SIDE_ORDER[b])
const sideName = (c, side) => (side === 'draw' ? 'Draw' : c[side].code)

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
              <p className='lede sp-lede'>{board.league.name}: {board.league.sport === 'basketball' ? 'a game every half hour' : board.league.sport === 'soccer' ? 'a match every 40 minutes' : 'a game every hour, at quarter past'}, played live and the same on every computer. Buy a {board.league.sport === 'soccer' ? 'result (either team, or the draw)' : 'team'} at its chance; each contract pays <Coins n={board.payout} /> if it comes true. Sell back any time before the end.</p>
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
    <div className={`sp-buy n${sides.length}`}>
      {sides.map((side) => (
        <button key={side} className={`btn sp-side ${side}`} disabled={!can} onClick={(e) => { e.stopPropagation(); trade('buy', c.id, side, amount) }}>
          <b>{sideName(c, side)}</b><span>{Math.round(ch[side] * 100)}%</span><small>buy at {c.quotes[side].ask}</small>
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
    <div className={`sp-card ${c.status}`} style={teamVars(c)} onClick={onOpen} role='button' tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}>
      <div className='sp-card-top'>
        <span className={`sp-clock ${c.status}`}><Clock c={c} /></span>
        {c.bet && <span className='sp-yours'>Yours: <Coins n={c.bet.worth} /> <i className={c.bet.worth - c.bet.cost >= 0 ? 'up' : 'down'}>{signed(c.bet.worth - c.bet.cost)}</i></span>}
      </div>
      <div className='sp-teams'>
        {['away', 'home'].map((side) => (
          <div key={side} className={`sp-team ${lead === side ? 'lead' : ''}`}>
            <span className='sp-tname'><small>{c[side].city}</small><b><i className={`sp-swatch ${side}`} />{c[side].name}</b></span>
            <span className='sp-score'>{c.status === 'pre' ? '–' : c[side].score}</span>
          </div>
        ))}
      </div>
      <Chance c={c} />
      <Field c={c} />
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
    <button className='sp-row' style={teamVars(c)} onClick={onOpen}>
      <span className='sp-when'>{startText(c.start)}</span>
      <span className='sp-match'><b>{c.away.city} {c.away.name}</b> <small>at</small> <b>{c.home.city} {c.home.name}</b></span>
      <span className='sp-odds'>{sideList(c).map((s) => `${sideName(c, s)} ${Math.round((c.chances || { home: c.chance, away: 1 - c.chance })[s] * 100)}%`).join(' · ')}</span>
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
    <div className='sp-game' style={teamVars(g)}>
      <button className='btn small ghost sp-back' onClick={onBack}>← All games</button>
      <div className='sp-board'>
        <div className='sp-bteam away'><small>{g.away.city}</small><b>{g.away.name}</b><span className='sp-bscore'>{g.status === 'pre' ? '–' : g.away.score}</span></div>
        <div className='sp-bmid'>
          <span className={`sp-clock ${g.status}`}><Clock c={g} /></span>
          {g.ball && <small>{ballText(g)}</small>}
          {g.ball && <div className='sp-bfield'><Field c={g} big /></div>}
          <small>{g.status === 'pre' ? `Opening chances: ${sideList(g).map((s) => `${sideName(g, s)} ${Math.round(g.chances[s] * 100)}%`).join(' · ')}` : `Started at ${new Date(g.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}</small>
        </div>
        <div className='sp-bteam home'><small>{g.home.city}</small><b>{g.home.name}</b><span className='sp-bscore'>{g.status === 'pre' ? '–' : g.home.score}</span></div>
      </div>
      <div className='sp-game-grid'>
        <div className='panel sp-chart-panel'>
          <h3>Chance to win <small>{sideList(g).map((s) => `${sideName(g, s)} ${Math.round(g.chances[s] * 100)}%`).join(' · ')}</small></h3>
          <WinChart g={g} />
          <small className='sp-note'>{g.sport === 'soccer' ? 'From the score and the minutes left: the goals each side should still score, at their rates, and every way that could end. The gap between the lines is the chance of a draw.' : `From the score and the time left${g.sport === 'football' ? ', plus who has the ball and where' : ''}: the lead, and what the stronger team should still add, against how much can still swing.`} It’s calibrated against thousands of simulated games.</small>
        </div>
        <div className='panel sp-trade'>
          <h3>Bet</h3>
          {g.open
            ? (
              <>
                <input className='field' inputMode='numeric' value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ''))} aria-label='Coins to bet' />
                <div className='mk-presets'>{[100, 1000, 10000].map((x) => <button key={x} className='btn small ghost' onClick={() => setAmt(String(x))}>{formatCoins(x)}</button>)}<button className='btn small ghost' onClick={() => setAmt(String(Math.floor(coins * 0.1)))}>10%</button></div>
                <BuyButtons c={g} trade={trade} coins={coins} amount={n} />
                {n > 0 && <small className='sp-note'>{sideList(g).map((s) => `${sideName(g, s)} pays ${formatCoins((n / g.quotes[s].ask) * 100)}`).join(' · ')}</small>}
              </>
              )
            : <p className='lede'>{g.status === 'final' ? 'This game is over.' : 'Betting opens a few games ahead.'}</p>}
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
            ? <ol>{g.plays.map((p, i) => <li key={`${p.at}${i}`} className={`${p.kind} ${p.team || ''} ${p.pts ? 'scored' : ''}`}><span className='sp-pq'>{['period', 'period-end', 'half-time', 'final', 'added'].includes(p.kind) ? '' : g.sport === 'soccer' ? `${Math.min(p.q * 45, Math.floor(p.clock / 60) + 1)}${p.clock >= p.q * 2700 ? `+${Math.floor((p.clock - p.q * 2700) / 60) + 1}` : ''}′` : `Q${p.q > g.periods ? 'OT' : p.q} ${Math.floor(p.clock / 60)}:${String(p.clock % 60).padStart(2, '0')}`}</span><span className='sp-ptext'>{p.team && <b className='sp-pteam'>{g[p.team].code}</b>}{p.text}</span><span className='sp-pscore'>{p.pts ? `${p.away}–${p.home}` : ''}</span></li>)}</ol>
            : <p className='lede'>It hasn’t started yet. Plays show up here as they happen.</p>}
        </div>
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
      <svg viewBox='0 0 100 100' preserveAspectRatio='none' aria-label={`Each side’s chance to win over the game`}>
        <line x1='0' x2='100' y1='50' y2='50' className='mid' vectorEffect='non-scaling-stroke' />
        {g.sport === 'soccer' && <polyline points={away} fill='none' className='away-line' strokeWidth='2' vectorEffect='non-scaling-stroke' />}
        <polyline points={home} fill='none' className='home-line' strokeWidth='2' vectorEffect='non-scaling-stroke' />
      </svg>
      <span className='sp-axis top'>100%</span>
      <span className='sp-axis bottom'>0%</span>
      <span className='sp-key'><i className='home' />{g.home.code}{g.sport === 'soccer' ? <> <i className='away' />{g.away.code} · the gap is the draw</> : ' to win'}</span>
    </div>
  )
}
