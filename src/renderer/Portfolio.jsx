import { useCallback, useEffect, useState } from 'react'
import { api, Coins, useMinuteTick } from './ui.jsx'
import { formatCoins } from '../shared/economy.js'
import { money, untilText } from './Derivs.jsx'

// Every way your coins are used, in one place: what you're worth and where
// it sits, how each part is doing, and where coins have come from and gone.

const pct = (x, d = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)}%`
const signed = (n) => `${n >= 0 ? '+' : '−'}${formatCoins(Math.abs(n))}`
const COLORS = { cash: 'var(--accent)', shares: '#4a9ee8', funds: '#3fbf9a', margin: '#e8a03a', future: '#a66bd8', option: '#e8648f', bets: '#6bc0e8', stakes: '#8a93a0', debt: 'var(--bad)' }
const SPENT = { wirdhouse: '🏠 Wirdhouse', cosmetics: '🛍️ Shop', packs: '🃏 Card packs', leximon: '🧬 Leximon', sports: '🏟️ Prediction bets', farm: '🌱 Wird Valley seeds and gifts', other: 'Other' }
const GOT = { income: '📝 Ratings and the wirdhouse', rewards: '🎁 Levels, quests and Daily Clues', sports: '🏟️ Prediction bets paid', farm: '🌾 Wird Valley harvests and finds', dev: '🛠️ Dev coins' }

export default function Portfolio ({ onPick }) {
  const [p, setP] = useState(null)
  const load = useCallback(() => { api('portfolioSummary').then(setP).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  useMinuteTick(load, 15000)
  if (!p) return null
  const positive = p.parts.filter((x) => x.value > 0)
  const gross = positive.reduce((a, x) => a + x.value, 0) || 1
  const invested = p.parts.filter((x) => !['cash', 'stakes', 'debt', 'bets'].includes(x.id))
  const investedValue = invested.reduce((a, x) => a + x.value, 0)
  const investedGain = invested.reduce((a, x) => a + (x.gain || 0), 0)
  const r = p.results
  const sinceText = new Date(p.ledger.since).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  const spent = Object.entries(p.ledger.spent).sort((a, b) => b[1] - a[1])
  const got = Object.entries(p.ledger.got).sort((a, b) => b[1] - a[1])
  return (
    <div className='pf'>
      <section className='pf-hero'>
        <div className='pf-worth'>
          <small>Net worth</small>
          <b className={p.total < 0 ? 'down' : ''}><Coins n={p.total} /></b>
          <span>{p.debt > 0 ? <>including <b className='down'><Coins n={-p.debt} /></b> of debt</> : <>coins, plus what everything would sell for now</>}</span>
        </div>
        <div className='pf-mini'>
          <div><small>On the Exchange</small><b><Coins n={investedValue} /></b><span className={investedGain >= 0 ? 'up' : 'down'}>{signed(investedGain)} open</span></div>
          <div><small>All-time trading</small><b className={r.market >= 0 ? 'up' : 'down'}>{signed(r.market)}</b><span>shares, funds and positions</span></div>
          <div><small>The wirdhouse</small><b><Coins n={p.wirdhouse.cps} />/s</b><span>edition {p.wirdhouse.edition + 1}</span></div>
        </div>
      </section>

      <section className='pf-alloc'>
        <h3>Where it sits</h3>
        <div className='pf-bar' role='img' aria-label='How your money is split'>
          {positive.map((x) => <i key={x.id} style={{ width: `${(x.value / gross) * 100}%`, background: COLORS[x.id] }} title={`${x.name}: ${formatCoins(x.value)}`} />)}
        </div>
        <div className='pf-legend'>
          {p.parts.filter((x) => x.value !== 0 || x.id === 'cash').map((x) => (
            <div key={x.id} className={`pf-part ${x.id}`}>
              <span className='sw' style={{ background: COLORS[x.id] }} />
              <span className='nm'>{x.name}{x.count ? <small> · {x.count}</small> : null}</span>
              <b><Coins n={x.value} /></b>
              <small className='share'>{x.value > 0 ? `${Math.round((x.value / gross) * 100)}%` : ''}</small>
              {x.gain !== undefined && x.value !== 0 && <small className={x.gain >= 0 ? 'up' : 'down'}>{signed(x.gain)}</small>}
            </div>
          ))}
        </div>
      </section>

      <div className='pf-stack'>
        <section className='panel pf-list'>
          <h3>Shares</h3>
          {p.shares.length
            ? (
              <table>
                <thead><tr><th>Word</th><th>Worth</th><th>Today</th><th>Gain</th></tr></thead>
                <tbody>{p.shares.map((s) => <tr key={s.word} onClick={() => onPick?.(s.word)}><td><b className='w'>{s.word}</b></td><td><Coins n={s.value} /></td><td className={s.day >= 0 ? 'up' : 'down'}>{pct(s.day)}</td><td className={s.gain >= 0 ? 'up' : 'down'}>{pct(s.pct)}</td></tr>)}</tbody>
              </table>
              )
            : <p className='lede'>No shares. Every word you rate can be bought on the Exchange.</p>}
        </section>
        <section className='panel pf-list'>
          <h3>Funds</h3>
          {p.funds.length
            ? (
              <table>
                <thead><tr><th>Fund</th><th>Worth</th><th>Today</th><th>Gain</th></tr></thead>
                <tbody>{p.funds.map((f) => <tr key={f.id}><td><b>{f.emoji} {f.id}</b> <small>{f.name}</small></td><td><Coins n={f.value} /></td><td className={f.day >= 0 ? 'up' : 'down'}>{pct(f.day)}</td><td className={f.gain >= 0 ? 'up' : 'down'}>{signed(f.gain)}</td></tr>)}</tbody>
              </table>
              )
            : <p className='lede'>No funds yet.</p>}
        </section>
        <section className='panel pf-list'>
          <h3>Open positions</h3>
          {p.positions.length
            ? (
              <table>
                <thead><tr><th>Position</th><th>Put up</th><th>Worth</th><th>P&L</th><th>Risk</th></tr></thead>
                <tbody>{p.positions.map((x) => (
                  <tr key={x.id} onClick={() => onPick?.(x.word)}>
                    <td><b>{x.label}</b>{x.expiry ? <small> · {untilText(x.expiry)} left</small> : null}</td>
                    <td><Coins n={x.paid} /></td>
                    <td><Coins n={x.value} /></td>
                    <td className={x.gain >= 0 ? 'up' : 'down'}>{signed(x.gain)} <small>{pct(x.pct)}</small></td>
                    <td>{x.liqPrice === undefined ? <small>premium only</small> : x.marginCall ? <small className='down'>⚠ under margin</small> : <small>closes past {money(x.liqPrice)}</small>}</td>
                  </tr>
                ))}
                </tbody>
              </table>
              )
            : <p className='lede'>No leveraged positions, futures or options open.</p>}
        </section>
      </div>

      <div className='pf-grid'>
        <section className='panel pf-flows'>
          <h3>Coins in <small>since {sinceText}</small></h3>
          {got.length ? got.map(([k, v]) => <div key={k} className='pf-row'><span>{GOT[k] || k}</span><b className='up'><Coins n={v} /></b></div>) : <p className='lede'>Nothing yet.</p>}
        </section>
        <section className='panel pf-flows'>
          <h3>Coins out <small>since {sinceText}</small></h3>
          {spent.length ? spent.map(([k, v]) => <div key={k} className='pf-row'><span>{SPENT[k] || k}</span><b><Coins n={v} /></b></div>) : <p className='lede'>Nothing spent yet.</p>}
        </section>
        <section className='panel pf-flows'>
          <h3>Luck and risk <small>all time</small></h3>
          {[['📈 Trading', r.market], ['🎰 Wird Slots', r.slots], ['🪙 Coinflips', r.flips], ['🎡 Roulette, blackjack and the wheel', r.tables || 0], ['🏟️ Prediction bets', r.sports], ['🎲 Lobby stakes', r.stakes]].map(([k, v]) => <div key={k} className='pf-row'><span>{k}</span><b className={v >= 0 ? 'up' : 'down'}>{signed(v)}</b></div>)}
          {r.debtInterest > 0 && <div className='pf-row'><span>🧾 Interest on debt</span><b className='down'>{signed(-r.debtInterest)}</b></div>}
          {r.bankruptcy > 0 && <div className='pf-row'><span>⚖️ Debt cancelled in bankruptcy</span><b><Coins n={r.bankruptcy} /></b></div>}
        </section>
      </div>
    </div>
  )
}
