import { useCallback, useEffect, useState } from 'react'
import { api, Coins, useToast, useInterval } from './ui.jsx'
import { formatCoins } from '../shared/economy.js'

// Debt and bankruptcy. Coins can go below zero (big losses on the Word
// Exchange); debt charges interest and anything you earn pays it down. When
// what you own can't cover what you owe, you can declare bankruptcy: the
// Exchange sells everything, the rest is cancelled, and until you've built
// steady income the casino, cosmetics and risky trades are locked.

export function Credit ({ econ, compact = false }) {
  const toast = useToast()
  const [nw, setNw] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const load = useCallback(() => { api('netWorth').then(setNw).catch(() => {}) }, [])
  useEffect(() => { load() }, [load, econ?.coins < 0, Boolean(econ?.bankrupt)])
  useInterval(load, 15000)
  const b = econ?.bankrupt
  if (b) return <Bankrupt b={b} compact={compact} />
  if (!nw || nw.debt <= 0) return null
  const file = async () => {
    try {
      const out = await api('declareBankruptcy')
      if (out.covered) toast({ emoji: '💸', title: 'Covered', text: 'Selling what you held paid off the debt.' })
      else toast({ emoji: '⚖️', title: 'Bankruptcy filed', text: `${formatCoins(out.discharged)} coins of debt cancelled.` })
      setConfirm(false)
      load()
    } catch (err) { toast({ error: true, title: 'Couldn’t file', text: err.message }) }
  }
  return (
    <section className={`credit debt ${compact ? 'compact' : ''}`}>
      <div className='credit-main'>
        <span className='credit-icon' aria-hidden='true'>🧾</span>
        <div>
          <b>You owe <Coins n={nw.debt} /></b>
          <small>Debt grows 24% a year. Everything you earn pays it down first. No publishing until it’s paid.</small>
        </div>
        <div className='credit-nums'>
          <span><small>Holdings</small><Coins n={nw.holdings} /></span>
          <span><small>Net worth</small><b className={nw.total >= 0 ? 'up' : 'down'}><Coins n={nw.total} /></b></span>
        </div>
      </div>
      {nw.total >= 0
        ? <small className='credit-note'>Selling what you hold would cover it, so bankruptcy isn’t on the table.</small>
        : !confirm
            ? <div className='credit-acts'><button className='btn small danger' onClick={() => setConfirm(true)}>Declare bankruptcy…</button></div>
            : (
              <div className='credit-confirm'>
                <p><b>Declaring bankruptcy</b> sells everything on the Exchange (shares, funds, every open position) to pay what it can, then cancels the rest. Your wirdhouse stays, so there’s income to rebuild on.</p>
                <p>Until you’re discharged: no casino or card packs, no lobby stakes, no margin, futures or options, no publishing, and only the free looks. Each filing lasts longer than the last.</p>
                <div className='credit-acts'>
                  <button className='btn small ghost' onClick={() => setConfirm(false)}>Not yet</button>
                  <button className='btn small danger' onClick={file}>File for bankruptcy</button>
                </div>
              </div>
              )}
    </section>
  )
}

function Bankrupt ({ b, compact }) {
  const until = new Date(b.until)
  const timeDone = b.daysLeft <= 0
  const earnDone = b.progress >= 1
  return (
    <section className={`credit bankrupt ${compact ? 'compact' : ''}`}>
      <div className='credit-main'>
        <span className='credit-icon' aria-hidden='true'>⚖️</span>
        <div>
          <b>Bankrupt{b.n > 1 ? ` (filing ${b.n})` : ''}</b>
          <small><Coins n={b.discharged} /> of debt was cancelled. Build some steady income and you’re discharged.</small>
        </div>
      </div>
      <div className='credit-steps'>
        <div className={earnDone ? 'done' : ''}>
          <small>{earnDone ? '✓ ' : ''}Earn <Coins n={b.need} /> from ratings and the wirdhouse</small>
          <span className='bar'><i style={{ width: `${Math.round(b.progress * 100)}%` }} /></span>
          <small className='faint'><Coins n={Math.min(b.earned, b.need)} /> so far</small>
        </div>
        <div className={timeDone ? 'done' : ''}>
          <small>{timeDone ? '✓ ' : ''}Wait until {until.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, {until.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
          <span className='bar'><i style={{ width: `${Math.round(Math.max(0, 1 - b.daysLeft / Math.max(1, (b.until - b.at) / 864e5)) * 100)}%` }} /></span>
          <small className='faint'>{timeDone ? 'Done' : `${b.daysLeft < 1 ? `${Math.ceil(b.daysLeft * 24)}h` : `${Math.ceil(b.daysLeft)} days`} left`}</small>
        </div>
      </div>
      {!compact && <small className='credit-note'>Locked until then: the casino and card packs, lobby stakes, margin, futures and options, publishing, and cosmetics beyond the free ones. Shares and funds are still open.</small>}
    </section>
  )
}
