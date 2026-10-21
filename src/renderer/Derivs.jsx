import { useCallback, useEffect, useState } from 'react'
import { api, Coins, useInterval, useMinuteTick } from './ui.jsx'
import { formatCoins } from '../shared/economy.js'
import { normCdf, RATE, YEAR_MS, maintenanceRatio } from '../shared/derivatives.js'

// Derivatives on the Word Exchange: leverage, futures and options tickets for
// the word you're looking at, your open positions, and the funds (ETFs).
// Prices come from src/shared/derivatives.js through the main process.

export const money = (n) => (n == null || !isFinite(n) ? '—' : Math.abs(n) >= 1000 ? formatCoins(n) : n.toFixed(2))
const pct = (x, d = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)}%`
const signed = (n) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`
const num = (s) => Number(String(s).replace(/[^\d.]/g, ''))
const H = 3600e3
export const strikeText = (k) => (Number.isInteger(k) ? k.toLocaleString() : k.toFixed(2))

export function untilText (at, now = Date.now()) {
  const ms = at - now
  if (ms <= 0) return 'expired'
  if (ms < H) return `${Math.max(1, Math.round(ms / 60000))}m`
  if (ms < 48 * H) return `${Math.round(ms / H)}h`
  return `${Math.round(ms / 864e5)}d`
}
export function expiryText (at) {
  const d = new Date(at)
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function useChain (word) {
  const [chain, setChain] = useState(null)
  const load = useCallback(() => { api('derivChain', word).then(setChain).catch(() => setChain(null)) }, [word])
  useEffect(() => { setChain(null); load() }, [load])
  useMinuteTick(load)
  return chain
}

function Amount ({ value, set, coins, placeholder = 'Coins to put up' }) {
  return (
    <>
      <input className='field' inputMode='decimal' placeholder={placeholder} value={value} onChange={(e) => set(e.target.value.replace(/[^\d.]/g, ''))} />
      <div className='mk-presets'>{[0.05, 0.1, 0.25, 0.5].map((f) => <button key={f} className='btn small ghost' disabled={coins * f < 1} onClick={() => set(String(Math.floor(coins * f)))}>{f * 100}%</button>)}</div>
    </>
  )
}

function Side ({ side, set, longLabel = 'Long', shortLabel = 'Short' }) {
  return (
    <div className='seg dv-side'>
      <button className={side === 'long' ? 'on long' : ''} onClick={() => set('long')}>▲ {longLabel}</button>
      <button className={side === 'short' ? 'on short' : ''} onClick={() => set('short')}>▼ {shortLabel}</button>
    </div>
  )
}

function Lev ({ lev, set, min, max }) {
  const opts = [1, 2, 3, 5, 10, 15, 20, 25].filter((x) => x >= min && x <= max)
  if (!opts.includes(max)) opts.push(max)
  return <div className='seg dv-lev'>{opts.map((x) => <button key={x} className={lev === x ? 'on' : ''} onClick={() => set(x)}>{x}×</button>)}</div>
}

function Facts ({ rows }) {
  return <dl className='dv-facts'>{rows.filter(Boolean).map(([k, v, cls]) => <div key={k}><dt>{k}</dt><dd className={cls || ''}>{v}</dd></div>)}</dl>
}

// --- leverage -------------------------------------------------------------------------

export function LeverageTicket ({ word, coins, trade }) {
  const chain = useChain(word)
  const [side, setSide] = useState('long')
  const [lev, setLev] = useState(2)
  const [amt, setAmt] = useState('')
  if (!chain) return <div className='dv-wait'>Loading…</div>
  if (chain.bankrupt) return <div className='dv-wait'>No margin, futures or options while you’re bankrupt. Shares and funds are still open.</div>
  const max = chain.maxMarginLev
  const min = side === 'long' ? 2 : 1
  const L = Math.max(min, Math.min(max, lev))
  const m = num(amt)
  const S = chain.S
  const entry = side === 'long' ? S * 1.005 : S * 0.995
  const qty = m ? (L * m) / entry : 0
  const mmr = maintenanceRatio(L)
  const liq = !m ? null : side === 'long' ? (qty * entry - m) / (qty * (1 - mmr)) : (m + qty * entry) / (qty * (1 + mmr))
  const rate = side === 'long' ? chain.longRate : chain.shortRate
  const base = side === 'long' ? (L - 1) * m : qty * entry
  if (max < 2 && side === 'long') return <div className='dv-wait'>{word} is too wild to borrow against. Try futures or options.</div>
  return (
    <div className='dv-ticket'>
      <Side side={side} set={setSide} />
      <Lev lev={L} set={setLev} min={min} max={max} />
      <Amount value={amt} set={setAmt} coins={coins} />
      <Facts rows={[
        ['Position', m ? <><Coins n={L * m} /> · {qty.toFixed(qty < 10 ? 3 : 1)} sh</> : '—'],
        ['Entry', money(entry)],
        ['Liquidated at', liq > 0 ? `${money(liq)} (${pct(liq / S - 1)})` : 'never', 'down'],
        [side === 'long' ? 'Borrow cost' : 'Borrow fee', `${(rate * 100).toFixed(1)}% a year${m ? ` · ${money((base * rate) / 365.25)}/day` : ''}`]
      ]}
      />
      <button className={`btn primary ${side}`} disabled={!(m >= 1) || m > coins} onClick={() => trade('margin', { word, side, lev: L, coins: m }).then((ok) => ok && setAmt(''))}>
        {side === 'long' ? 'Go long' : 'Go short'} {L}×
      </button>
      <small className='mk-note'>
        {side === 'long' ? `You put up the coins, borrow ${L - 1}× more and buy.` : 'You borrow shares, sell them, and buy them back later.'} Margin is checked at the closing bell (20:00 UTC) each day: under {Math.round(mmr * 100)}% maintenance, it’s closed then, at that price, less a 0.5% fee. Losses can run past what you put up, and the rest becomes debt.
      </small>
    </div>
  )
}

// --- futures --------------------------------------------------------------------------

export function FuturesTicket ({ word, coins, trade }) {
  const chain = useChain(word)
  const [pick, setPick] = useState(null)
  const [side, setSide] = useState('long')
  const [lev, setLev] = useState(2)
  const [amt, setAmt] = useState('')
  if (!chain) return <div className='dv-wait'>Loading…</div>
  if (chain.bankrupt) return <div className='dv-wait'>No margin, futures or options while you’re bankrupt. Shares and funds are still open.</div>
  const f = chain.futures.find((x) => x.at === pick) || chain.futures[0]
  const max = chain.maxFutureLev
  const L = Math.max(1, Math.min(max, lev))
  const m = num(amt)
  const entry = side === 'long' ? f.ask : f.bid
  const qty = m ? (L * m) / entry : 0
  const s = side === 'long' ? 1 : -1
  const T = (f.at - Date.now()) / YEAR_MS
  const Fliq = m ? (m - s * qty * entry) / (qty * (0.75 * f.im - s)) : null
  const Sliq = Fliq > 0 ? Fliq / Math.exp(RATE * T) : null
  return (
    <div className='dv-ticket'>
      <div className='dv-exps'>
        {chain.futures.map((x) => (
          <button key={x.at} className={x.at === f.at ? 'on' : ''} onClick={() => setPick(x.at)}>
            <b>{expiryText(x.at)}</b><small>{money(x.F)} · {untilText(x.at)}</small>
          </button>
        ))}
      </div>
      <Facts rows={[
        ['Spot', money(chain.S)],
        ['Future', `${money(f.F)} (basis ${signed(f.basis)})`],
        ['Initial margin', `${(f.im * 100).toFixed(1)}% · up to ${max}×`]
      ]}
      />
      <Side side={side} set={setSide} />
      <Lev lev={L} set={setLev} min={1} max={max} />
      <Amount value={amt} set={setAmt} coins={coins} placeholder='Margin to post' />
      <Facts rows={[
        ['Contracts', m ? `${qty.toFixed(qty < 10 ? 3 : 1)} · ${money(qty * entry)} notional` : '—'],
        ['Liquidated if spot hits', Sliq ? `${money(Sliq)} (${pct(Sliq / chain.S - 1)})` : 'never', 'down'],
        ['Settles', `at spot, ${expiryText(f.at)} at the closing bell`]
      ]}
      />
      <button className={`btn primary ${side}`} disabled={!(m >= 1) || m > coins} onClick={() => trade('future', { word, expiry: f.at, side, lev: L, coins: m }).then((ok) => ok && setAmt(''))}>
        {side === 'long' ? 'Buy' : 'Sell'} the {expiryText(f.at).split(',').slice(-1)[0].trim()} future
      </button>
      <small className='mk-note'>Priced at cost of carry, spot × e^({(RATE * 100).toFixed(0)}% × time left), so it drifts to spot by expiry. No interest to pay: it’s in the price. If it’s below three-quarters of initial margin at a closing bell, it’s closed then, and a loss past your margin is debt.</small>
    </div>
  )
}

// --- options --------------------------------------------------------------------------

export function OptionsTicket ({ word, coins, trade }) {
  const chain = useChain(word)
  const [exp, setExp] = useState(null)
  const [sel, setSel] = useState(null) // { K, type, side }
  const [qty, setQty] = useState('10')
  if (!chain) return <div className='dv-wait'>Loading…</div>
  if (chain.bankrupt) return <div className='dv-wait'>No margin, futures or options while you’re bankrupt. Shares and funds are still open.</div>
  const ex = chain.expiries.find((e) => e.at === exp) || chain.expiries[0]
  const row = sel && ex.rows.find((r) => r.K === sel.K)
  const q = row && row[sel.type]
  const n = num(qty)
  const S = chain.S
  const choose = (K, type, side) => setSel({ K, type, side, at: ex.at })
  const atmK = ex.rows.reduce((a, r) => (Math.abs(r.K - S) < Math.abs(a - S) ? r.K : a), ex.rows[0].K)
  let facts = null
  let cost = 0
  if (q && sel.at === ex.at) {
    const long = sel.side === 'long'
    const price = long ? q.ask : q.bid
    const call = sel.type === 'call'
    const be = call ? sel.K + price : sel.K - price
    const T = q.T
    const d2 = T > 0 ? (Math.log(S / sel.K) + (RATE - q.iv * q.iv / 2) * T) / (q.iv * Math.sqrt(T)) : 0
    const itm = call ? normCdf(d2) : normCdf(-d2)
    const req = row[`${sel.type}Req`] * n
    cost = long ? price * n : req
    const sign = long ? 1 : -1
    facts = [
      [long ? 'Premium' : 'You receive', `${money(price)} × ${n || 0} = ${money(price * n)}`],
      !long && ['Margin to post', money(req)],
      ['Breakeven', `${money(be)} (${pct(be / S - 1)})`],
      ['Max loss', long ? money(price * n) : call ? 'unlimited' : money(Math.max(0, (sel.K - price) * n))],
      ['Max gain', long ? (call ? 'unlimited' : money((sel.K - price) * n)) : money(price * n)],
      ['Chance it ends in the money', `${(itm * 100).toFixed(0)}%`],
      ['Implied vol', `${(q.iv * 100).toFixed(0)}%`],
      ['Δ  Γ', `${(sign * q.delta * n).toFixed(2)}  ${(sign * q.gamma * n).toFixed(4)}`],
      T < 2 / 365 ? ['Θ/hour  ν/pt', `${signed(sign * q.theta * n / 24)}  ${signed(sign * q.vega * n)}`] : ['Θ/day  ν/pt', `${signed(sign * q.theta * n)}  ${signed(sign * q.vega * n)}`]
    ]
  }
  const cell = (r, type, side) => {
    const v = side === 'long' ? r[type].ask : r[type].bid
    const on = sel && sel.at === ex.at && sel.K === r.K && sel.type === type && sel.side === side
    return <td><button className={`dv-q ${side} ${on ? 'on' : ''}`} disabled={side === 'short' && v < 0.01} onClick={() => choose(r.K, type, side)}>{money(v)}</button></td>
  }
  return (
    <div className='dv-ticket'>
      <div className='dv-exps'>
        {chain.expiries.map((e) => (
          <button key={e.at} className={e.at === ex.at ? 'on' : ''} onClick={() => { setExp(e.at); setSel(null) }}>
            <b>{expiryText(e.at)}</b><small>{e.kind} · {untilText(e.at)}</small>
          </button>
        ))}
      </div>
      <div className='dv-chain-head'>
        <span>Implied vol <b>{(ex.atm * 100).toFixed(0)}%</b></span>
        <span>Expected move <b>±{money(ex.expectedMove)}</b></span>
        <span>Spot <b>{money(S)}</b></span>
      </div>
      <div className='dv-chain-wrap'>
        <table className='dv-chain'>
          <thead>
            <tr><th colSpan='2'>Calls</th><th /><th colSpan='2'>Puts</th></tr>
            <tr><th>Bid</th><th>Ask</th><th>Strike</th><th>Bid</th><th>Ask</th></tr>
          </thead>
          <tbody>
            {ex.rows.map((r) => (
              <tr key={r.K} className={`${r.K < S ? 'itm-call' : 'itm-put'} ${r.K === atmK ? 'atm' : ''}`}>
                {cell(r, 'call', 'short')}{cell(r, 'call', 'long')}
                <th>{strikeText(r.K)}</th>
                {cell(r, 'put', 'short')}{cell(r, 'put', 'long')}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small className='mk-note'>Tap an <b>ask</b> to buy, a <b>bid</b> to write. Shaded strikes are in the money.</small>
      {facts && (
        <div className='dv-opt'>
          <div className='dv-opt-title'>
            <b>{sel.side === 'long' ? 'Buy' : 'Write'} {word.toUpperCase()} {expiryText(ex.at)} {strikeText(sel.K)} {sel.type}s</b>
          </div>
          <div className='mk-amt'>
            <input className='field' inputMode='decimal' placeholder='Contracts' value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))} />
            {[1, 10, 100].map((k) => <button key={k} className='btn small ghost' onClick={() => setQty(String(k))}>{k}</button>)}
            <button className='btn small ghost' onClick={() => { const unit = cost / Math.max(n, 1e-9); if (unit > 0) setQty(String(Math.floor((coins * 0.25) / unit))) }}>25%</button>
          </div>
          <Facts rows={facts} />
          <button className={`btn primary ${sel.side}`} disabled={!(n > 0) || cost > coins} onClick={() => trade('option', { word, expiry: ex.at, K: sel.K, type: sel.type, side: sel.side, qty: n })}>
            {sel.side === 'long' ? `Buy for ${money(cost)}` : `Write, posting ${money(cost)}`}
          </button>
        </div>
      )}
      <small className='mk-note'>European, settled in coins at the closing bell on the spot price. Black–Scholes at {(RATE * 100).toFixed(0)}%, with volatility from how {word} has actually moved at that horizon. Written options use CBOE margin, checked at each closing bell, and can lose more than it.</small>
    </div>
  )
}

// --- positions --------------------------------------------------------------------------

export function Positions ({ book, coins, onChange, toast, onPick }) {
  const [adding, setAdding] = useState(null)
  const [amt, setAmt] = useState('')
  if (!book) return null
  const act = async (fn, ...args) => {
    try {
      const out = await api(fn, ...args)
      if (fn === 'derivClose') toast({ emoji: out.gain >= 0 ? '💰' : '📉', title: 'Closed', text: `${money(out.pay)} back, ${signed(out.gain)}.` })
      setAdding(null); setAmt('')
      onChange()
    } catch (err) { toast({ error: true, title: 'Couldn’t do that', text: err.message }) }
  }
  if (!book.open.length && !book.log.length) return null
  return (
    <section className='mk-port dv-positions'>
      <h2>Positions</h2>
      {book.open.length > 0
        ? (
          <div className='dv-pos-list'>
            {book.open.map((p) => (
              <div key={p.id} className={`dv-pos ${p.marginCall ? 'call' : ''}`}>
                <button className='dv-pos-name' onClick={() => onPick(p.word)}>
                  <b>{p.label}</b>
                  <small>
                    {p.kind === 'option' ? `${p.side > 0 ? 'Bought' : 'Wrote'} ${p.qty} at ${money(p.entry)}` : `${p.side > 0 ? 'Long' : 'Short'} ${p.qty.toFixed(p.qty < 10 ? 3 : 1)} at ${money(p.entry)}`}
                    {p.expiry ? ` · ${untilText(p.expiry)} left` : ''}
                    {p.interest >= 0.01 ? ` · ${money(p.interest)} interest so far` : ''}
                  </small>
                </button>
                <div className='dv-pos-nums'>
                  <span><small>Put up</small><Coins n={p.paid} /></span>
                  <span><small>Worth</small><Coins n={p.value} /></span>
                  <span className={p.gain >= 0 ? 'up' : 'down'}><small>P&L</small>{signed(p.gain)} <i>{pct(p.pct)}</i></span>
                </div>
                {p.liqPrice === undefined && <div className='dv-health none'><small>{p.kind === 'option' ? 'Can’t be liquidated: the premium is all you can lose' : ''}</small></div>}
                {p.liqPrice !== undefined && (
                  <div className='dv-health' title={p.liqPrice ? `Closed at the next closing bell if ${p.word} is past ${money(p.liqPrice)} then` : 'Can’t be closed by a margin call'}>
                    <span className='bar'><i style={{ width: `${Math.round((p.health || 0) * 100)}%` }} className={p.health > 0.5 ? 'ok' : p.health > 0.2 ? 'mid' : 'low'} /></span>
                    <small>{p.marginCall ? '⚠ Under margin: add some or it closes at the bell · ' : ''}{p.liqPrice ? `closes at the bell past ${money(p.liqPrice)} (${pct(p.liqPrice / p.S - 1)})` : 'safe'}</small>
                  </div>
                )}
                {p.greeks && <small className='dv-greeks'>Δ {p.greeks.delta.toFixed(2)} · Θ {signed(p.greeks.theta)}/day · implied vol {(p.iv * 100).toFixed(0)}%</small>}
                <div className='dv-pos-acts'>
                  {p.liqPrice !== undefined && (adding === p.id
                    ? <><input className='field' autoFocus inputMode='decimal' placeholder='Coins' value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') act('derivAddMargin', p.id, num(amt)); if (e.key === 'Escape') setAdding(null) }} /><button className='btn small' disabled={!(num(amt) > 0) || num(amt) > coins} onClick={() => act('derivAddMargin', p.id, num(amt))}>Add</button></>
                    : <button className='btn small ghost' onClick={() => setAdding(p.id)}>Add margin</button>)}
                  <button className='btn small' onClick={() => act('derivClose', p.id)}>{p.value >= 0 ? `Close for ${money(p.value)}` : `Close, paying ${money(-p.value)}`}</button>
                </div>
              </div>
            ))}
          </div>
          )
        : <p className='lede'>No open positions.</p>}
      {book.log.length > 0 && (
        <details className='dv-log'>
          <summary>Recently closed{book.liquidations ? ` · ${book.liquidations} liquidation${book.liquidations === 1 ? '' : 's'} ever` : ''}</summary>
          {book.log.map((x) => (
            <div key={`${x.id}${x.at}`} className='dv-log-row'>
              <span className={`tag ${x.how}`}>{x.how}</span>
              <b>{x.label}</b>
              <small>{new Date(x.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>
              <span className={x.gain >= 0 ? 'up' : 'down'}>{signed(x.gain)}</span>
            </div>
          ))}
        </details>
      )}
    </section>
  )
}

// --- funds ------------------------------------------------------------------------------

export function Funds ({ coins, toast, onChange, onPick }) {
  const [list, setList] = useState(null)
  const [open, setOpen] = useState(null)
  const load = useCallback(() => { api('etfs').then(setList).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  useMinuteTick(load)
  if (!list) return null
  const groups = [
    ['The whole market', 'Every sector, plain, geared or upside down.', list.filter((f) => f.track === 'all')],
    ['Baskets', 'Real words, held equally: the fund is exactly how they do.', list.filter((f) => f.track === 'basket')],
    ['Sectors', 'A topic at a time. Every word in a sector shares its moves.', list.filter((f) => f.track !== 'all' && f.track !== 'basket')]
  ]
  const tile = (f) => (
    <button key={f.id} className={`dv-fund ${open === f.id ? 'open' : ''} ${f.k !== 1 ? 'geared' : ''} ${f.shares > 0 ? 'held' : ''}`} onClick={() => setOpen(open === f.id ? null : f.id)} aria-expanded={open === f.id}>
      <span className='dv-fund-emoji' aria-hidden='true'>{f.emoji}</span>
      <span className='dv-fund-name'><b>{f.id}</b><small>{f.name}</small></span>
      <span className='dv-fund-px'><b>{money(f.nav)}</b><small className={f.day >= 0 ? 'up' : 'down'}>{pct(f.day)}</small></span>
      <span className='dv-fund-held'>{f.shares > 0 ? <>Yours <Coins n={f.value} /> <i className={f.gain >= 0 ? 'up' : 'down'}>{signed(f.gain)}</i></> : <i className='none'>Not held</i>}</span>
    </button>
  )
  return (
    <section className='mk-port dv-funds'>
      <h2>Funds</h2>
      <p className='lede'>Buy many words at once. Anyone can trade these: no rating needed.</p>
      {groups.map(([title, blurb, fs]) => (
        <div key={title} className='dv-fund-group'>
          <h3>{title} <small>{blurb}</small></h3>
          <div className='dv-fund-grid'>{fs.map(tile)}</div>
          {fs.some((f) => f.id === open) && <FundDetail id={open} coins={coins} toast={toast} onTraded={() => { load(); onChange() }} onPick={onPick} onClose={() => setOpen(null)} />}
        </div>
      ))}
    </section>
  )
}

const FUND_RANGES = [['week', '1W'], ['month', '1M'], ['year', '1Y']]

function FundDetail ({ id, coins, toast, onTraded, onPick, onClose }) {
  const [range, setRange] = useState('month')
  const [f, setF] = useState(null)
  const [amt, setAmt] = useState('')
  const load = useCallback(() => { api('fund', id, range).then(setF).catch(() => {}) }, [id, range])
  useEffect(() => { load() }, [load])
  useMinuteTick(load)
  if (!f || f.id !== id) return <div className='dv-fund-detail loading' />
  const trade = async (kind, n) => {
    try {
      const out = await api('etfTrade', kind, id, n)
      toast({ emoji: kind === 'buy' ? '📈' : '💰', title: kind === 'buy' ? `Bought ${id}` : `Sold ${id}`, text: kind === 'buy' ? `${formatCoins(n)} coins.` : `${money(out.pay)} back, ${signed(out.gain)}.` })
      setAmt(''); load(); onTraded()
    } catch (err) { toast({ error: true, title: 'Couldn’t trade', text: err.message }) }
  }
  const pts = f.points.map((p) => p[1])
  const lo = Math.min(...pts)
  const hi = Math.max(...pts)
  const line = pts.map((v, i) => `${(i / (pts.length - 1)) * 100},${hi === lo ? 50 : 92 - ((v - lo) / (hi - lo)) * 84}`).join(' ')
  const change = pts[pts.length - 1] / pts[0] - 1
  const t = f.together
  const geared = f.k !== 1
  return (
    <div className='dv-fund-detail'>
      <div className='dv-fd-head'>
        <span className='dv-fund-emoji big' aria-hidden='true'>{f.emoji}</span>
        <div className='dv-fd-title'><b>{f.id}</b><span>{f.name}</span></div>
        <div className='dv-fd-px'><b>{money(f.nav)}</b><small className={f.returns.day >= 0 ? 'up' : 'down'}>{pct(f.returns.day)} today</small></div>
        <button className='btn small ghost' onClick={onClose} aria-label='Close'>✕</button>
      </div>
      <div className='dv-fd-body'>
        <div className='dv-fd-chart'>
          <svg viewBox='0 0 100 100' preserveAspectRatio='none' className={change >= 0 ? 'up' : 'down'} aria-label={`${f.id} over the last ${range}`}>
            <polygon points={`0,100 ${line} 100,100`} className='area' />
            <polyline points={line} fill='none' stroke='currentColor' strokeWidth='2' vectorEffect='non-scaling-stroke' />
          </svg>
          <div className='dv-fd-chartbar'>
            <div className='seg'>{FUND_RANGES.map(([k, l]) => <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>)}</div>
            <span className='dv-fd-returns'>{[['1W', f.returns.week], ['1M', f.returns.month], ['1Y', f.returns.year]].map(([l, v]) => <span key={l}><small>{l}</small><b className={v >= 0 ? 'up' : 'down'}>{pct(v)}</b></span>)}</span>
          </div>
        </div>
        <div className='dv-fd-side'>
          <small className='dv-fd-blurb'>{f.blurb || (f.sectorName ? `Tracks the ${f.sectorName.toLowerCase()} index: the waves every word in the sector rides.` : '')} {(f.fee * 100).toFixed(2)}% a year in fees.{geared ? ` Resets daily, so over weeks it drifts from ${f.k}× the market.` : ''}</small>
          <div className='mk-amt'>
            <input className='field' inputMode='decimal' placeholder='Coins to spend' value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter' && num(amt) >= 1) trade('buy', num(amt)) }} />
            <button className='btn primary' disabled={!(num(amt) >= 1) || num(amt) > coins} onClick={() => trade('buy', num(amt))}>Buy</button>
          </div>
          {f.shares > 0
            ? <div className='dv-fd-pos'><span>You hold <Coins n={f.value} /> <i className={f.value - f.cost >= 0 ? 'up' : 'down'}>{signed(f.value - f.cost)}</i></span><button className='btn small' onClick={() => trade('sell', 'all')}>Sell all</button></div>
            : <small className='dv-fd-note'>Buying costs 0.05% over the fund’s value.</small>}
        </div>
      </div>
      {f.holdings.length > 0 && (
        <div className='dv-fd-holdings'>
          {t && (
            <div className='dv-fd-together'>
              <div className='dv-fd-heat' aria-hidden='true'>{f.holdings.map((h, i) => <i key={i} title={`${h.word || h.name} ${pct(h.day)}`} style={{ background: heat(h.day) }} />)}</div>
              <span><b>{t.same} of {t.of}</b> {f.track === 'all' ? 'sectors' : 'words'} moved with the fund today · they move together <b>{togetherText(t.corr)}</b> <small>(correlation {t.corr.toFixed(2)} over 30 days)</small></span>
            </div>
          )}
          <table className='dv-fd-table'>
            <thead><tr><th>{f.track === 'all' ? 'Sector' : f.track === 'basket' ? 'Holds' : 'Some of its words'}</th><th>Week</th><th>Price</th><th>Today</th><th>With the fund</th></tr></thead>
            <tbody>
              {f.holdings.map((h) => (
                <tr key={h.word || h.name}>
                  <td>{h.word ? <button className='dv-fd-word' onClick={() => onPick?.(h.word)} title={h.tradable ? 'Open it on the Exchange' : 'Rate it to trade it'}>{h.word}</button> : <span>{h.emoji} {h.name}</span>}</td>
                  <td><MiniSpark points={h.spark} /></td>
                  <td>{money(h.price)}</td>
                  <td className={h.day >= 0 ? 'up' : 'down'}>{pct(h.day)}</td>
                  <td><span className='dv-corr'><i style={{ width: `${Math.max(0, Math.min(1, h.corr)) * 100}%` }} /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {f.track !== 'basket' && f.track !== 'all' && <small className='dv-fd-note'>A sector fund tracks the sector’s index. Each word’s price is its own waves plus the sector’s, so its words lean the same way on the same days.</small>}
        </div>
      )}
    </div>
  )
}

const heat = (d) => { const a = Math.min(1, Math.abs(d) / 0.08); return d >= 0 ? `color-mix(in oklab, var(--good) ${Math.round(25 + a * 75)}%, var(--panel-raise))` : `color-mix(in oklab, var(--bad) ${Math.round(25 + a * 75)}%, var(--panel-raise))` }
const togetherText = (c) => (c >= 0.6 ? 'closely' : c >= 0.35 ? 'fairly closely' : c >= 0.15 ? 'loosely' : 'hardly at all')

function MiniSpark ({ points }) {
  if (!points?.length) return null
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 60},${hi === lo ? 10 : 18 - ((p - lo) / (hi - lo)) * 16}`).join(' ')
  return <svg className={`spark ${points[points.length - 1] >= points[0] ? 'up' : 'down'}`} viewBox='0 0 60 20' preserveAspectRatio='none' aria-hidden='true'><polyline points={d} fill='none' stroke='currentColor' strokeWidth='1.5' vectorEffect='non-scaling-stroke' /></svg>
}
