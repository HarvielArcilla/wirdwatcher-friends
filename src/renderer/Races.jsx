import { useCallback, useEffect, useState } from 'react'
import { api, Coins, useInterval } from './ui.jsx'
import { formatCoins } from '../shared/economy.js'
import { race, derbyAt, raceSecs, RACE_SPEED } from '../shared/races.js'

// Formula 1 and horse racing in the prediction market. Back any runner to
// win: each contract pays 100 coins if it does. Formula 1 is a timing
// tower, lap by lap; horse racing is the field running down the track.
// Races are on a schedule, the same on every computer (src/shared/races.js).

const signed = (n) => `${n >= 0 ? '+' : '−'}${formatCoins(Math.abs(n))}`
const pct = (p) => (p >= 0.995 ? '99%' : p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`)
const lapText = (s) => (s == null ? '' : `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`)
const gapText = (g) => (g == null ? '' : typeof g === 'string' ? g : `+${g.toFixed(3)}`)
const clock = (s) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const startText = (t) => { const mins = Math.round((t - Date.now()) / 60000); const d = new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); return mins > 0 && mins < 120 ? `${d} · in ${mins} min` : mins <= 0 ? `${d} · any moment` : d }
const raceN = (id) => Number(id.split('-').pop())

function useTick (ms) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!ms) return; const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

export function RaceBoard ({ board, coins, trade, onOpen }) {
  useTick(30000)
  const f1 = board.league.sport === 'f1'
  const mine = board.mine
  const live = board.live.filter((c) => !c.bet)
  const Card = f1 ? F1Card : DerbyCard
  return (
    <>
      <p className='lede sp-lede'>{f1
        ? <>{board.league.name}: a Grand Prix every {Math.round(board.league.every / 60000)} minutes, 52 laps with every clock at twice real time. Lap times come from the car, the driver, the tyres (and how worn they are) and the fuel; everyone has to stop at least once and run two compounds, and passing takes a real pace advantage.</>
        : <>{board.league.name}: a race every {Math.round(board.league.every / 60000)} minutes, about a minute long, at twice real time. Front-runners go early, closers come late.</>}
        {' '}Back a {f1 ? 'driver' : 'horse'} to win at its chance; each contract pays <Coins n={board.payout} /> if it does. Sell back any time before the finish.
      </p>
      {mine.length > 0 && (
        <section className='sp-sec'>
          <h3>Your bets</h3>
          <div className='rc-cards'>{mine.map((c) => <Card key={c.id} c={c} trade={trade} coins={coins} onOpen={() => onOpen(c.id)} />)}</div>
        </section>
      )}
      <section className='sp-sec'>
        <h3>{f1 ? 'Racing now' : 'Off and running'} {board.live.length > 0 && <i className='sp-live-dot' />}</h3>
        {live.length ? <div className='rc-cards'>{live.map((c) => <Card key={c.id} c={c} trade={trade} coins={coins} onOpen={() => onOpen(c.id)} />)}</div> : <p className='lede'>{board.live.length ? 'The race on now is up in your bets.' : 'Nothing running right now. The next race is open for bets below.'}</p>}
      </section>
      <section className='sp-sec'>
        <h3>Next up</h3>
        <div className='rc-cards'>{board.upcoming.slice(0, 1).map((c) => <Card key={c.id} c={c} trade={trade} coins={coins} onOpen={() => onOpen(c.id)} />)}</div>
        <div className='sp-rows' style={{ marginTop: 8 }}>{board.upcoming.slice(1).map((c) => {
          const fav = [...c.runners].sort((a, b) => b.chance - a.chance)[0]
          return <button key={c.id} className='sp-row rc-row' onClick={() => onOpen(c.id)}><span className='sp-when'>{startText(c.start)}</span><span className='sp-match'><b>{c.title}</b>{c.dist ? <small> · {c.dist.toLocaleString()} m</small> : null}</span><span className='sp-odds'>Favourite: {fav.name} {pct(fav.chance)}</span></button>
        })}
        </div>
      </section>
      <section className='sp-sec'>
        <h3>Results</h3>
        <div className='sp-rows'>{board.recent.map((c) => {
          const w = c.runners[Number(c.winner?.slice(1))]
          return <button key={c.id} className='sp-row final rc-row' onClick={() => onOpen(c.id)}><span className='sp-when'>{new Date(c.end || c.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><span className='sp-match'><b>{c.title}</b></span><span className='sp-odds rc-won'><i className='rc-swatch' style={{ background: w?.color }} />{w?.name}{w?.team ? ` · ${w.team}` : ''}</span></button>
        })}
        </div>
      </section>
      {board.history.length > 0 && (
        <section className='sp-sec'>
          <h3>Settled</h3>
          <div className='sp-hist'>{board.history.map((h, i) => <div key={i}><span>{h.title}</span><small>{h.how === 'sold' ? `sold ${h.result || ''} early` : h.result ? `won by ${h.result}` : h.how}</small><b className={h.gain >= 0 ? 'up' : 'down'}>{signed(h.gain)}</b></div>)}</div>
        </section>
      )}
    </>
  )
}

function Ticket ({ amt, setAmt }) {
  return (
    <label className='rc-amt' onClick={(e) => e.stopPropagation()}>
      <span>Bet</span>
      <input className='field' inputMode='numeric' value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ''))} aria-label='Coins to bet' />
    </label>
  )
}

function BuyCell ({ c, r, trade, coins, n }) {
  return (
    <span className='rc-buy' onClick={(e) => e.stopPropagation()}>
      {r.held > 0 && <button className='btn small ghost' disabled={c.status === 'final'} onClick={() => trade('sell', c.id, r.side, 'all')} title={`Sell ${formatCoins(r.held)} back at ${r.bid}`}>Sell</button>}
      <button className='btn small' disabled={!c.open || !(n >= 1) || n > coins} onClick={() => trade('buy', c.id, r.side, n)} title={`Buy at ${r.ask} a contract`}>{r.ask}</button>
    </span>
  )
}

function RaceHead ({ c }) {
  const now = useTick(c.status === 'live' ? 1000 : 30000)
  const s = c.status === 'live' ? Math.max(0, ((now - c.start) / 1000) * RACE_SPEED) : c.secs
  return (
    <div className='sp-card-top'>
      <span className={`sp-clock ${c.status}`}>{c.status === 'live' && <i className='sp-live-dot' />}{c.status === 'pre' ? startText(c.start) : c.status === 'final' ? 'Finished' : c.kind === 'f1' ? `Lap ${c.lap}/${c.laps} · ${clock(s)}` : clock(s)}</span>
      {c.bet && <span className='sp-yours'>Yours: <Coins n={c.bet.worth} /> <i className={c.bet.worth - c.bet.cost >= 0 ? 'up' : 'down'}>{signed(c.bet.worth - c.bet.cost)}</i></span>}
    </div>
  )
}

// --- Formula 1 ------------------------------------------------------------------------------
const TYRE_CLASS = { S: 'soft', M: 'medium', H: 'hard' }
const Tyre = ({ t, age }) => <span className={`rc-tyre ${TYRE_CLASS[t]}`} title={`${{ S: 'Soft', M: 'Medium', H: 'Hard' }[t]}, ${age} lap${age === 1 ? '' : 's'} old`}>{t}{age != null && <small>{age}</small>}</span>

function F1Card ({ c, trade, coins, onOpen }) {
  const [amt, setAmt] = useState('100')
  const n = Number(amt) || 0
  const byI = Object.fromEntries(c.runners.map((r) => [r.i, r]))
  const rows = c.status === 'pre' ? [...c.runners].sort((a, b) => b.chance - a.chance).slice(0, 8).map((r) => ({ ...c.tower.find((x) => x.i === r.i), r })) : c.tower.slice(0, 8).map((x) => ({ ...x, r: byI[x.i] }))
  const held = c.runners.filter((r) => r.held > 0 && !rows.some((x) => x.i === r.i))
  return (
    <div className={`sp-card rc-card f1 ${c.status}`} onClick={onOpen} role='button' tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}>
      <RaceHead c={c} />
      <div className='rc-title'><b>🏁 {c.title}</b>{c.status === 'pre' && <small>Grid order below is by chance; tap for the full grid</small>}</div>
      <div className='rc-tower compact'>
        {[...rows, ...held.map((r) => ({ ...c.tower.find((x) => x.i === r.i), r }))].map((x) => (
          <div key={x.i} className={`rc-trow ${x.out ? 'out' : ''} ${c.winner === x.r.side ? 'won' : ''}`}>
            <span className='rc-pos'>{x.out ? 'OUT' : c.status === 'pre' ? `P${x.grid}` : x.pos}</span>
            <span className='rc-driver'><i className='rc-swatch' style={{ background: x.r.color }} /><b>{x.r.name}</b><small>{x.r.team}</small></span>
            <span className='rc-gap'>{c.status === 'pre' ? '' : x.pitting ? 'IN PIT' : x.pos === 1 ? (c.status === 'final' ? 'Winner' : 'Leader') : gapText(x.gap)}{c.status === 'live' && !x.out && x.due > 0 && <small className='rc-due'> stop due</small>}</span>
            <Tyre t={x.tyre} age={c.status === 'pre' ? null : x.age} />
            <span className='rc-chance'>{pct(x.r.chance)}</span>
            {c.open && <BuyCell c={c} r={x.r} trade={trade} coins={coins} n={n} />}
          </div>
        ))}
      </div>
      {c.feed?.length > 0 && <p className='sp-last'>{c.feed[0].text}</p>}
      {c.open && <div className='rc-foot' onClick={(e) => e.stopPropagation()}><Ticket amt={amt} setAmt={setAmt} /><small>Prices are coins a contract; each pays 100.</small></div>}
    </div>
  )
}

function F1View ({ g, trade, coins }) {
  const [amt, setAmt] = useState('100')
  const n = Number(amt) || 0
  const byI = Object.fromEntries(g.runners.map((r) => [r.i, r]))
  const pre = g.status === 'pre'
  const rows = g.tower
  return (
    <>
      <div className='rc-meta'>
        <span><small>Laps</small><b>{pre ? g.laps : `${g.lap} / ${g.laps}`}</b></span>
        <span><small>Remaining</small><b>{pre ? g.laps : g.status === 'final' ? 0 : g.laps - g.lap + 1}</b></span>
        <span><small>Fastest lap</small><b>{g.fastest ? `${lapText(g.fastest.t)}` : '–'}</b>{g.fastest && <small>{byI[g.fastest.d].name}, lap {g.fastest.lap}</small>}</span>
        {g.open && <Ticket amt={amt} setAmt={setAmt} />}
      </div>
      <div className='rc-tower full'>
        <div className='rc-trow head'><span>Pos</span><span>Driver</span><span>Gap</span><span>Int</span><span>Last lap</span><span>Best</span><span>Tyre</span><span title='Stops made (and still to make)'>Stops</span><span>Win</span>{g.open && <span />}</div>
        {rows.map((x) => {
          const r = byI[x.i]
          const moved = pre ? 0 : x.grid - x.pos
          return (
            <div key={x.i} className={`rc-trow ${x.out ? 'out' : ''} ${x.pitting ? 'pit' : ''} ${g.winner === r.side ? 'won' : ''} ${r.held > 0 ? 'mine' : ''}`}>
              <span className='rc-pos'>{x.out ? 'OUT' : `P${x.pos}`}{!pre && !x.out && moved !== 0 && <small className={moved > 0 ? 'up' : 'down'}>{moved > 0 ? '▲' : '▼'}{Math.abs(moved)}</small>}</span>
              <span className='rc-driver'><i className='rc-swatch' style={{ background: r.color }} /><em>{r.number}</em><b>{r.name}</b><small>{r.team}</small></span>
              <span className='rc-gap'>{x.out ? 'Retired' : x.pitting ? 'IN PIT' : x.pos === 1 && !pre ? 'Leader' : gapText(x.gap)}</span>
              <span className='rc-int'>{x.interval != null ? `+${x.interval.toFixed(3)}` : ''}</span>
              <span className='rc-lap'>{lapText(x.last)}</span>
              <span className={`rc-lap ${g.fastest?.d === x.i ? 'purple' : ''}`}>{lapText(x.best)}</span>
              <Tyre t={x.tyre} age={pre ? null : x.age} />
              <span className='rc-stops' title={x.due ? `${x.due} more stop${x.due === 1 ? '' : 's'} to make` : undefined}>{x.pits}{!pre && !x.out && x.due > 0 && <small className='rc-due'>+{x.due}</small>}</span>
              <span className='rc-chance'>{pct(r.chance)}</span>
              {g.open && <BuyCell c={g} r={r} trade={trade} coins={coins} n={n} />}
            </div>
          )
        })}
      </div>
      {g.feed?.length > 0 && (
        <section className='sp-sec'>
          <h3>Race control</h3>
          <div className='rc-feed'>{g.feed.map((e, i) => <div key={i} className={`rc-ev ${e.kind}`}><span>Lap {e.lap}</span>{e.text}</div>)}</div>
        </section>
      )}
    </>
  )
}

// --- horse racing ----------------------------------------------------------------------------

// Where each horse is right now, worked out here so they run smoothly.
function useDerby (c, live) {
  const now = useTick(live ? 100 : 0)
  if (!live) return null
  const g = race('derby', raceN(c.id))
  const s = Math.min(raceSecs(g, now), g.track.length - 1)
  return derbyAt(g, s)
}

function Track ({ c, at }) {
  const progress = at ? at.dist.map((x) => Math.min(1, x / c.dist)) : c.progress
  const rank = at ? at.ranks : c.ranks
  const place = rank ? Object.fromEntries(rank.map((i, k) => [i, k + 1])) : {}
  return (
    <div className='rc-track'>
      {c.runners.map((r, i) => (
        <div key={i} className='rc-lane'>
          <span className='rc-gate'>{r.number}</span>
          <div className='rc-turf'>
            <i className='rc-post' />
            <span className='rc-horse' style={{ left: `calc(${progress[i] * 100}% - ${progress[i] * 30}px)`, '--silk': r.color }} title={r.name}>🏇<b>{place[i] || ''}</b></span>
          </div>
        </div>
      ))}
    </div>
  )
}

function DerbyCard ({ c, trade, coins, onOpen }) {
  const [amt, setAmt] = useState('100')
  const n = Number(amt) || 0
  const at = useDerby(c, c.status === 'live')
  const rank = at?.ranks || (c.result ? c.result.map((x) => x.i) : null)
  const rows = rank ? rank.map((i) => c.runners[i]) : [...c.runners].sort((a, b) => b.chance - a.chance)
  return (
    <div className={`sp-card rc-card derby ${c.status}`} onClick={onOpen} role='button' tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}>
      <RaceHead c={c} />
      <div className='rc-title'><b>🏇 {c.title}</b><small>{c.dist.toLocaleString()} m · {c.runners.length} runners</small></div>
      {c.status !== 'pre' && <Track c={c} at={at} />}
      <div className='rc-field'>
        {rows.map((r, k) => (
          <div key={r.side} className={`rc-trow ${c.winner === r.side ? 'won' : ''} ${r.held > 0 ? 'mine' : ''}`}>
            <span className='rc-pos'>{rank ? k + 1 : r.number}</span>
            <span className='rc-driver'><i className='rc-swatch silk' style={{ background: r.color }}>{r.number}</i><b>{r.name}</b><small>{r.style}</small></span>
            <span className='rc-chance'>{pct(r.chance)}</span>
            {c.open && <BuyCell c={c} r={r} trade={trade} coins={coins} n={n} />}
          </div>
        ))}
      </div>
      {c.open && <div className='rc-foot' onClick={(e) => e.stopPropagation()}><Ticket amt={amt} setAmt={setAmt} /><small>Prices are coins a contract; each pays 100.</small></div>}
    </div>
  )
}

// --- one race, in full ---------------------------------------------------------------------

export function RaceView ({ id, coins, trade, onBack }) {
  const [g, setG] = useState(null)
  const load = useCallback(() => { api('sportsGame', id).then(setG).catch(() => {}) }, [id])
  useEffect(() => { load() }, [load])
  useInterval(load, g?.status === 'live' ? 2000 : 15000)
  const t = async (...a) => { const ok = await trade(...a); load(); return ok }
  if (!g) return <div className='sp-wait'>Loading…</div>
  return (
    <div className='rc-view'>
      <button className='btn small ghost' onClick={onBack}>← All races</button>
      {g.kind === 'f1'
        ? <><RaceHead c={g} /><h2 className='rc-h'>🏁 {g.title}</h2><F1View g={g} trade={t} coins={coins} /></>
        : <DerbyCard c={g} trade={t} coins={coins} onOpen={() => {}} />}
      {g.chart?.length > 1 && <RaceChart g={g} />}
    </div>
  )
}

function RaceChart ({ g }) {
  const W = 600; const H = 140
  const x = (at) => ((at - g.chart[0][0]) / Math.max(1, g.chart[g.chart.length - 1][0] - g.chart[0][0])) * W
  return (
    <section className='sp-sec'>
      <h3>Chances over the race</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className='rc-chart' preserveAspectRatio='none'>
        {g.chartSides.map((side, k) => {
          const r = g.runners.find((x) => x.side === side)
          return <polyline key={side} fill='none' stroke={r.color} strokeWidth='2' vectorEffect='non-scaling-stroke' points={g.chart.map((p) => `${x(p[0])},${H - p[k + 1] * H}`).join(' ')} />
        })}
      </svg>
      <div className='rc-legend'>{g.chartSides.map((side) => { const r = g.runners.find((x) => x.side === side); return <span key={side}><i className='rc-swatch' style={{ background: r.color }} />{r.name}</span> })}</div>
    </section>
  )
}
