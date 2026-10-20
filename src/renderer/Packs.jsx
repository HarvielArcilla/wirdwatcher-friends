import { useMemo, useState } from 'react'
import { Coins } from './ui.jsx'
import { COSMETICS, KINDS } from '../shared/cosmetics.js'
import { packPool, epicChance, RARITIES } from '../shared/packs.js'
import { burst, centerOf } from './effects.js'
import { Preview } from './Shop.jsx'

// Card packs: three cards of looks each, opened one card at a time. A free
// one comes every five levels; more cost coins. Odds are on the page, the
// third card is always rare or better, and a duplicate becomes scraps that
// craft whatever you like.

const RNAME = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' }
const pctText = (p) => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`

export default function Packs ({ v, coins, act }) {
  const pk = v.packs
  const [res, setRes] = useState(null)
  const [shown, setShown] = useState(0) // cards turned over
  const [busy, setBusy] = useState(false)
  const [craftKind, setCraftKind] = useState('all')
  const owned = useMemo(() => new Set(v.owned), [v.owned])

  const open = async (free, el) => {
    setBusy(true)
    const out = await act('openPack', { free })
    setBusy(false)
    if (!out) return
    setRes(out)
    setShown(0)
    // Turn them over one at a time; the big ones get a burst.
    out.cards.forEach((c, i) => setTimeout(() => {
      setShown(i + 1)
      if (c.rarity === 'epic' || c.rarity === 'legendary') {
        const card = document.querySelector(`.pk-card[data-i='${i}']`)
        if (card) { const at = centerOf(card); burst(at.x, at.y, 'confetti') }
      }
    }, 450 + i * 700))
    void el
  }
  const pool = packPool()
  const craftable = pool.filter((c) => !owned.has(`${c.kind}:${c.id}`) && (craftKind === 'all' || c.kind === craftKind))
    .sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.name.localeCompare(b.name))
  const kindsInPool = KINDS.filter((k) => pool.some((c) => c.kind === k.id))
  const left = pool.filter((c) => !owned.has(`${c.kind}:${c.id}`)).length

  return (
    <div className='packs'>
      <section className='pk-stage'>
        <div className='pk-buy'>
          <div className='pk-pack' aria-hidden='true'><span>wirdwatcher</span><b>Card pack</b><i>3 cards</i></div>
          <div className='pk-acts'>
            <button className='btn primary' disabled={busy || pk.free < 1} onClick={(e) => open(true, e.currentTarget)}>
              {pk.free > 0 ? `Open a free pack (${pk.free})` : 'No free packs'}
            </button>
            <button className='btn' disabled={busy || coins < pk.price} onClick={(e) => open(false, e.currentTarget)}>Buy and open · <Coins n={pk.price} /></button>
            <small>{pk.free > 0 ? 'Free packs never expire.' : `Next free pack at level ${pk.nextFreeAt}.`} An epic or better is guaranteed within {pk.toPity} more pack{pk.toPity === 1 ? '' : 's'}.</small>
          </div>
          <div className='pk-stats'>
            <span><b>{pk.opened}</b><small>opened</small></span>
            <span><b>{pk.scraps}</b><small>scraps</small></span>
            <span><b>{left}</b><small>still to find</small></span>
          </div>
        </div>
        {res && (
          <div className='pk-reveal'>
            {res.cards.map((c, i) => {
              const full = COSMETICS.find((x) => x.kind === c.kind && x.id === c.id)
              return (
                <div key={`${i}${c.id}`} data-i={i} className={`pk-card r-${c.rarity} ${i < shown ? 'up' : ''}`}>
                  <div className='pk-face back' aria-hidden='true'><span>ww</span></div>
                  <div className='pk-face front'>
                    <small className='pk-rar'>{RNAME[c.rarity]}</small>
                    <div className='pk-art'>{full && <Preview c={full} />}</div>
                    <b>{c.name}</b>
                    <small>{String(c.kindName || c.kind).replace(/s$/, '')}</small>
                    {c.dup ? <span className='pk-dup'>Duplicate · +{c.scraps} scraps</span> : <span className='pk-new'>New!</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className='pk-grid'>
        <section className='panel pk-odds'>
          <h3>The odds</h3>
          <table>
            <thead><tr><th /><th>Cards 1–2</th><th>Card 3</th><th>Duplicate</th><th>Craft</th></tr></thead>
            <tbody>
              {RARITIES.map((r) => (
                <tr key={r}>
                  <th><span className={`pk-dot r-${r}`} />{RNAME[r]}</th>
                  <td>{pctText(pk.odds[r] || 0)}</td>
                  <td>{pk.lastOdds[r] ? pctText(pk.lastOdds[r]) : '—'}</td>
                  <td>+{pk.scrapFor[r]}</td>
                  <td>{pk.craftCost[r]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <small>{pctText(epicChance())} of packs hold an epic or better. If {pk.pity} packs in a row don’t, the next one’s third card is epic (80%) or legendary (20%). Cards are anything the shop sells plus a few you can only find here. Never level, badge or edition rewards: those stay earned. Looks only: nothing changes a score, a rating or a duel.</small>
        </section>

        <section className='panel pk-craft'>
          <div className='pk-craft-head'>
            <h3>Craft with scraps <small>{pk.scraps} to spend</small></h3>
            <select className='field' value={craftKind} onChange={(e) => setCraftKind(e.target.value)}>
              <option value='all'>Everything</option>
              {kindsInPool.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>
          {craftable.length === 0
            ? <p className='lede'>You’ve found every card{craftKind !== 'all' ? ' of this kind' : ''}.</p>
            : (
              <div className='pk-craft-list'>
                {craftable.map((c) => (
                  <div key={`${c.kind}:${c.id}`} className={`pk-craft-item r-${c.rarity}`}>
                    <span className={`pk-dot r-${c.rarity}`} />
                    <span className='pk-craft-name'><b>{c.name}</b><small>{KINDS.find((k) => k.id === c.kind)?.name.replace(/s$/, '')}{c.pack ? ' · pack only' : ''}</small></span>
                    <button className='btn small' disabled={pk.scraps < pk.craftCost[c.rarity]} onClick={() => act('craft', c.kind, c.id)}>{pk.craftCost[c.rarity]} scraps</button>
                  </div>
                ))}
              </div>
              )}
        </section>
      </div>
    </div>
  )
}
