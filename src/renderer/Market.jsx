import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, Coins, useToast, useInterval, useMinuteTick, useSecondsToMinute } from './ui.jsx'
import { formatCoins, shortCoins } from '../shared/economy.js'
import { sectorOf } from '../shared/market.js'
import { Credit } from './Credit.jsx'
import Portfolio from './Portfolio.jsx'
import { LeverageTicket, FuturesTicket, OptionsTicket, Positions, Funds } from './Derivs.jsx'

// The Word Exchange. Every word has a price that's the same on every
// computer, minute by minute; you can trade the words you've rated.
const pct = (x, digits = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(digits)}%`
const money = (n) => (Math.abs(n) >= 1000 ? shortCoins(n) : n.toFixed(2))
const SORTS = [['movers', 'Movers'], ['gainers', 'Gainers'], ['losers', 'Losers'], ['price', 'Price'], ['volatile', 'Volatile'], ['name', 'A–Z']]
const RANGES = [['day', '1D'], ['week', '1W'], ['month', '1M'], ['year', '1Y']]
const TABS = [['shares', 'Shares'], ['leverage', 'Leverage'], ['futures', 'Futures'], ['options', 'Options']]

export default function Market ({ econ, openWord }) {
  const toast = useToast()
  const [board, setBoard] = useState(null)
  const [port, setPort] = useState(null)
  const [sector, setSector] = useState(null)
  const [sort, setSort] = useState('movers')
  const [query, setQuery] = useState('')
  const [pick, setPick] = useState(null)
  const [book, setBook] = useState(null)
  const [view, setView] = useState(() => { try { return localStorage.getItem('market-view') || 'exchange' } catch { return 'exchange' } })
  useEffect(() => { try { localStorage.setItem('market-view', view) } catch {} }, [view])
  const load = useCallback(() => {
    api('market', { sector, sort, query, limit: 80 }).then(setBoard).catch(() => {})
    api('portfolio').then(setPort).catch(() => {})
    api('derivBook').then((b) => {
      setBook(b)
      // Liquidations and expiries that happened while you weren't looking.
      for (const x of b.fresh || []) toast({ emoji: x.how === 'liquidated' ? '💥' : '⌛', error: x.how === 'liquidated' && x.pay === 0, title: x.how === 'liquidated' ? `${x.label} was liquidated` : `${x.label} expired`, text: `${x.pay > 0 ? `${formatCoins(x.pay)} came back` : 'Nothing came back'}, ${x.gain >= 0 ? '+' : '−'}${formatCoins(Math.abs(x.gain))}.` })
    }).catch(() => {})
  }, [sector, sort, query]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])
  useMinuteTick(load) // prices change by the minute
  useEffect(() => { if (!pick && board?.rows?.[0]) setPick(port?.rows?.[0]?.word || board.rows[0].word) }, [board, port]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!board || !port) return null
  const tape = [...port.rows.map((r) => r.quote), ...board.rows.filter((r) => !port.rows.some((p) => p.word === r.word)).slice(0, 14)].filter(Boolean)
  return (
    <div className='page market'>
      {tape.length > 0 && <Tape quotes={tape} onPick={setPick} />}
      <div className='mk-head'>
        <div>
          <h1>Word Exchange</h1>
          <p className='lede'>Every word has a price, the same on every copy of wirdwatcher, minute by minute. Words you’ve rated are yours to trade. What you gave a word never moves it.</p>
        </div>
        <div className='mk-summary'>
          <div><small>Portfolio</small><b><Coins n={port.value} /></b></div>
          <div><small>All-time return</small><b className={port.gain >= 0 ? 'up' : 'down'}>{port.spent ? pct(port.returnPct) : '—'}</b><small className={port.gain >= 0 ? 'up' : 'down'}>{port.spent ? `${port.gain >= 0 ? '+' : '−'}${formatCoins(Math.abs(port.gain))}` : 'No trades yet'}</small></div>
          <div><small>To spend</small><b><Coins n={econ?.coins ?? 0} /></b></div>
        </div>
      </div>

      <Credit econ={econ} />
      <div className='tabs mk-views' role='tablist'>
        {[['exchange', 'Exchange'], ['portfolio', 'Portfolio']].map(([id, label]) => <button key={id} role='tab' aria-selected={view === id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{label}</button>)}
      </div>
      {view === 'portfolio' && <Portfolio onPick={(w) => { setPick(w); setView('exchange') }} />}
      {view === 'exchange' && <>
      <div className='mk-sectors' role='tablist' aria-label='Sectors'>
        <button className={!sector ? 'on' : ''} onClick={() => setSector(null)} role='tab' aria-selected={!sector}>All</button>
        {board.sectors.map((s) => (
          <button key={s.id} className={sector === s.id ? 'on' : ''} onClick={() => setSector(sector === s.id ? null : s.id)} role='tab' aria-selected={sector === s.id} title={`${s.name} index ${s.index.toFixed(2)}`}>
            <span>{s.emoji} {s.name}</span><small className={s.day >= 0 ? 'up' : 'down'}>{pct(s.day)}</small>
          </button>
        ))}
      </div>

      <div className='mk-grid'>
        <section className='mk-board'>
          <div className='mk-tools'>
            <input className='field' placeholder={`Search your ${board.count.toLocaleString()} listed words`} value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className='seg'>{SORTS.map(([id, label]) => <button key={id} className={sort === id ? 'on' : ''} onClick={() => setSort(id)}>{label}</button>)}</div>
          </div>
          {board.rows.length === 0
            ? <div className='empty'>{board.count === 0 && !query ? 'Rate some words to list them here. Every word you rate becomes something you can trade.' : 'Nothing matches.'}</div>
            : (
              <div className='mk-rows'>
                {board.rows.map((r) => (
                  <button key={r.word} className={`mk-row ${pick === r.word ? 'on' : ''}`} onClick={() => setPick(r.word)}>
                    <span className='mk-word'>{r.word}{r.held > 0 && <i className='held' title='You own some'>●</i>}</span>
                    <small className='mk-sec'>{sectorOf(r.sector).emoji}</small>
                    <Spark points={r.spark} />
                    <span className='mk-price'>{money(r.price)}</span>
                    <span className={`mk-chg ${r.day >= 0 ? 'up' : 'down'}`}>{pct(r.day)}</span>
                  </button>
                ))}
              </div>
              )}
          {board.news.length > 0 && (
            <div className='mk-news'>
              <h3>In the news</h3>
              {board.news.map((r) => (r.split || r.announced
                ? <button key={r.word} onClick={() => setPick(r.word)}><b>✂️</b> {splitText(r)}</button>
                : <button key={r.word} onClick={() => setPick(r.word)}><b className={r.news.up ? 'up' : 'down'}>{r.news.up ? '▲' : '▼'}</b> {headlineText(r)}</button>))}
            </div>
          )}
        </section>
        {pick && <Detail word={pick} econ={econ} port={port} toast={toast} onTraded={load} openWord={openWord} />}
      </div>

      {port.rows.length > 0 && (
        <section className='mk-port'>
          <h2>Your holdings</h2>
          <table className='rated-table'>
            <thead><tr><th>Word</th><th>Shares</th><th>Paid</th><th>Worth</th><th>Gain</th></tr></thead>
            <tbody>
              {port.rows.map((r) => (
                <tr key={r.word} onClick={() => setPick(r.word)} style={{ cursor: 'pointer' }}>
                  <td><b>{r.word}</b></td><td>{r.shares >= 1e4 ? shortCoins(r.shares) : r.shares.toFixed(r.shares < 10 ? 3 : 1)}</td><td><Coins short n={r.cost} /></td><td><Coins short n={r.value} /></td>
                  <td className={r.gain >= 0 ? 'up' : 'down'}>{pct(r.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      </>}
      {view === 'exchange' && <Positions book={book} coins={econ?.coins ?? 0} toast={toast} onChange={load} onPick={setPick} />}
      {view === 'exchange' && <Funds coins={econ?.coins ?? 0} toast={toast} onChange={load} onPick={(w) => { setPick(w); window.scrollTo?.({ top: 0, behavior: 'smooth' }); document.querySelector('.main')?.scrollTo?.({ top: 0, behavior: 'smooth' }) }} />}
    </div>
  )
}

const ratioText = (ratio) => (ratio >= 1 ? `${ratio}-for-1 split` : `1-for-${Math.round(1 / ratio)} reverse split`)
const dayText = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })
const splitText = (r) => {
  const W = r.word.toUpperCase()
  if (r.split) return `${W} completes a ${ratioText(r.split.ratio)}`
  return `${W} announces a ${ratioText(r.announced.ratio)}, effective ${dayText(r.announced.at)}`
}

const headlineText = (r) => {
  const W = r.word.toUpperCase()
  const verbs = r.news.up ? ['soars', 'surges', 'rallies', 'jumps', 'rockets'] : ['slumps', 'tumbles', 'slides', 'sinks', 'crashes']
  const v = verbs[(r.word.length + Math.floor(r.news.at / 864e5)) % verbs.length]
  return `${W} ${v} ${r.news.pct}%`
}

function Tape ({ quotes, onPick }) {
  const items = [...quotes, ...quotes] // twice, so the loop is seamless
  return (
    <div className='mk-tape' aria-hidden='true'>
      <div className='mk-tape-run' style={{ animationDuration: `${Math.max(20, quotes.length * 4)}s` }}>
        {items.map((q, i) => <button key={i} tabIndex={-1} onClick={() => onPick(q.word)}><b>{q.word.toUpperCase()}</b> {money(q.price)} <span className={q.day >= 0 ? 'up' : 'down'}>{q.day >= 0 ? '▲' : '▼'} {Math.abs(q.day * 100).toFixed(1)}%</span></button>)}
      </div>
    </div>
  )
}

function Spark ({ points }) {
  if (!points?.length) return <span className='spark' />
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 60},${hi === lo ? 10 : 18 - ((p - lo) / (hi - lo)) * 16}`).join(' ')
  const up = points[points.length - 1] >= points[0]
  return <svg className={`spark ${up ? 'up' : 'down'}`} viewBox='0 0 60 20' preserveAspectRatio='none' aria-hidden='true'><polyline points={d} fill='none' stroke='currentColor' strokeWidth='1.5' vectorEffect='non-scaling-stroke' /></svg>
}

function Detail ({ word, econ, port, toast, onTraded, openWord }) {
  const [range, setRange] = useState('day')
  const [chart, setChart] = useState(null)
  const [q, setQ] = useState(null)
  const [amount, setAmount] = useState('')
  const [hover, setHover] = useState(null)
  const load = useCallback(() => {
    api('marketChart', word, range).then(setChart).catch(() => {})
    api('marketQuote', word).then(setQ).catch(() => {})
  }, [word, range])
  useEffect(() => { load(); setHover(null) }, [load])
  useMinuteTick(load, 15000) // the moment a new price is out, and often in between
  // A flash when the price moves.
  const [flash, setFlash] = useState(null)
  const lastPrice = useRef(null)
  useEffect(() => {
    if (!q) return
    if (lastPrice.current && lastPrice.current.word === word && lastPrice.current.price !== q.price) {
      setFlash(q.price > lastPrice.current.price ? 'up' : 'down')
      const t = setTimeout(() => setFlash(null), 1200)
      lastPrice.current = { word, price: q.price }
      return () => clearTimeout(t)
    }
    lastPrice.current = { word, price: q.price }
  }, [q?.price, word]) // eslint-disable-line react-hooks/exhaustive-deps
  const secs = useSecondsToMinute()
  const [tab, setTab] = useState('shares')
  const pos = port.rows.find((r) => r.word === word)
  const coins = econ?.coins ?? 0
  const open = async (kind, spec) => {
    try {
      const v = await api('derivOpen', kind, spec)
      toast({ emoji: v.side > 0 ? '📈' : '📉', title: `Opened ${v.label}`, text: `${formatCoins(v.paid)} coins in.` })
      onTraded()
      return true
    } catch (err) { toast({ error: true, title: 'Couldn’t open that', text: err.message }); return false }
  }
  const trade = async (kind, n) => {
    try {
      await api('marketTrade', kind, word, n)
      toast({ emoji: kind === 'buy' ? '📈' : '💰', title: kind === 'buy' ? `Bought ${word}` : `Sold ${word}`, text: kind === 'buy' ? `${formatCoins(n)} coins at ${money(q.buy)} a share.` : `At ${money(q.sell)} a share.` })
      setAmount('')
      onTraded()
    } catch (err) { toast({ error: true, title: 'Couldn’t trade', text: err.message }) }
  }
  const pts = chart?.points || []
  const geom = useMemo(() => {
    if (!pts.length) return null
    const lo = Math.min(...pts.map((p) => p[1]))
    const hi = Math.max(...pts.map((p) => p[1]))
    const y = (v) => (hi === lo ? 50 : 92 - ((v - lo) / (hi - lo)) * 84)
    const x = (i) => (i / (pts.length - 1)) * 100
    return { lo, hi, line: pts.map((p, i) => `${x(i)},${y(p[1])}`).join(' '), x, y }
  }, [pts])
  if (!q) return <section className='mk-detail' />
  const first = pts[0]?.[1]
  const last = pts[pts.length - 1]?.[1] ?? q.price
  const change = first ? last / first - 1 : 0
  const shown = hover !== null && pts[hover] ? pts[hover] : null
  const sec = sectorOf(q.sector)
  return (
    <section className={`mk-detail ${tab !== 'shares' ? 'tall' : ''}`}>
      <div className='mk-title'>
        <button className='mk-word-big' onClick={() => openWord?.(word)} title='Open the word'>{word}</button>
        <span className='mk-tags'><span>{sec.emoji} {sec.name}</span><span>{q.vol > 0.6 ? '🎢 Wild' : q.vol > 0.35 ? '〰️ Lively' : '🧱 Blue chip'}</span></span>
      </div>
      <div className='mk-quote'>
        <b className={flash && !shown ? `flash-${flash}` : ''}>{money(shown ? shown[1] : q.price)}</b>
        <span className={change >= 0 ? 'up' : 'down'}>{pct(change)} {RANGES.find((r) => r[0] === range)[1]}</span>
        {!shown && <small className='mk-next' title='Prices change every minute'>next price in {secs}s</small>}
        {shown && <small>{new Date(shown[0]).toLocaleString([], range === 'day' ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', ...(range === 'year' ? { year: 'numeric' } : { hour: 'numeric' }) })}</small>}
      </div>
      <div className='mk-chart' onMouseLeave={() => setHover(null)} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1))) }}>
        {geom && (
          <svg viewBox='0 0 100 100' preserveAspectRatio='none' className={change >= 0 ? 'up' : 'down'} aria-label={`Price of ${word} over ${range}`}>
            <polygon points={`0,100 ${geom.line} 100,100`} className='area' />
            <polyline points={geom.line} fill='none' stroke='currentColor' strokeWidth='2' vectorEffect='non-scaling-stroke' />
            {shown && <line x1={geom.x(hover)} x2={geom.x(hover)} y1='0' y2='100' className='cross' vectorEffect='non-scaling-stroke' />}
          </svg>
        )}
      </div>
      <div className='seg mk-ranges'>{RANGES.map(([id, label]) => <button key={id} className={range === id ? 'on' : ''} onClick={() => setRange(id)}>{label}</button>)}</div>
      {q.announced && <div className='mk-headline'>✂️ {word}’s board announced a {ratioText(q.announced.ratio)} on {dayText(q.announced.announced)}. It takes effect at midnight UTC on {dayText(q.announced.at)}: shares, contracts and strikes all adjust, so nothing changes value.</div>}
      {q.split && <div className='mk-headline'>✂️ Completed a {ratioText(q.split.ratio)} on {dayText(q.split.at)}. Shares and positions were adjusted, so nothing changed value.</div>}
      {q.news && <div className={`mk-headline ${q.news.up ? 'up' : 'down'}`}>{q.news.up ? '▲' : '▼'} {headlineText(q)}</div>}

      {q.tradable && (
        <div className='seg mk-tabs' role='tablist'>
          {TABS.map(([id, label]) => <button key={id} role='tab' aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
        </div>
      )}
      {q.tradable && tab === 'leverage' && <div className='mk-trade'><LeverageTicket word={word} coins={coins} trade={open} /></div>}
      {q.tradable && tab === 'futures' && <div className='mk-trade'><FuturesTicket word={word} coins={coins} trade={open} /></div>}
      {q.tradable && tab === 'options' && <div className='mk-trade'><OptionsTicket word={word} coins={coins} trade={open} /></div>}
      {!q.tradable
        ? <div className='empty small'>Rate “{word}” to trade it.</div>
        : tab === 'shares' && (
          <div className='mk-trade'>
            <div className='mk-buy'>
              <small>Buy at {money(q.buy)}</small>
              <div className='mk-amt'>
                <input className='field' inputMode='decimal' placeholder='Coins to spend' value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter' && Number(amount) >= 1) trade('buy', Number(amount)) }} />
                <button className='btn primary' disabled={!(Number(amount) >= 1) || Number(amount) > coins} onClick={() => trade('buy', Number(amount))}>Buy</button>
              </div>
              <div className='mk-presets'>{[0.1, 0.25, 0.5, 1].map((f) => <button key={f} className='btn small ghost' disabled={coins * f < 1} onClick={() => setAmount(String(Math.floor(coins * f)))}>{f === 1 ? 'All' : `${f * 100}%`}</button>)}</div>
            </div>
            {pos && (
              <div className='mk-pos'>
                <small>You own {pos.shares.toFixed(pos.shares < 10 ? 3 : 1)} shares</small>
                <div className='mk-pos-nums'><span>Paid <Coins n={pos.cost} /></span><span>Worth <Coins n={pos.value} /></span><b className={pos.gain >= 0 ? 'up' : 'down'}>{pct(pos.pct)}</b></div>
                <div className='mk-presets'>{[0.25, 0.5].map((f) => <button key={f} className='btn small ghost' onClick={() => trade('sell', pos.shares * f)}>Sell {f * 100}%</button>)}<button className='btn small' onClick={() => trade('sell', 'all')}>Sell all at {money(q.sell)}</button></div>
              </div>
            )}
          </div>
          )}
      {tab === 'shares' && <small className='mk-note'>Buying costs 0.5% over the price and selling gets 0.5% under it. Prices change every minute. Each word’s board decides when to split: when the price climbs well past what it likes (or sinks far below), it announces one, a few days ahead.</small>}
    </section>
  )
}
