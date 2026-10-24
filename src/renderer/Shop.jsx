import { useCallback, useEffect, useState } from 'react'
import { COSMETICS, KINDS, RARITY } from '../shared/cosmetics.js'
import { VALLEY_GOALS } from '../shared/cosmetics-valley.js'
import { WL_GOALS } from '../shared/wirdlike/content.js'
import { CW_GOALS } from '../shared/catchword/content.js'
import { LX_GOALS } from '../shared/tycoon/content.js'
import { BADGES } from '../shared/progress.js'
import { api, Avatar, Coins, CoinArt, useToast } from './ui.jsx'
import { burst, centerOf, setConfettiStyle } from './effects.js'
import { useLiveCoins } from './Wirdhouse.jsx'

// The shop: looks, never advantages. Tables show for everyone when you
// host; frames, card backs, titles and name styles show for everyone who
// sees you; confetti and coins are just for you. Everything here is kept
// forever, through every edition.
export default function Shop ({ econ, me }) {
  const toast = useToast()
  const [v, setV] = useState(null)
  const [kind, setKind] = useState(() => { try { return localStorage.getItem('shop-kind') || 'table' } catch { return 'table' } })
  const load = useCallback(() => api('economy').then(setV).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  useEffect(() => { try { localStorage.setItem('shop-kind', kind) } catch {} }, [kind])
  const coins = useLiveCoins(econ)
  if (!v) return null
  const owned = new Set(v.owned)
  const look = econ?.look || v.look
  const act = async (action, k, id, el) => {
    try {
      setV(await api('economyAction', action, k, id))
      if (action === 'buyCosmetic') {
        const c = COSMETICS.find((x) => x.kind === k && x.id === id)
        if (el) { const at = centerOf(el); burst(at.x, at.y, 'confetti-small') }
        toast({ emoji: '🛍️', title: `${c.name} is yours`, text: KINDS.find((x) => x.id === k).seen === 'you' ? 'You’re using it now.' : `You’re wearing it now. ${KINDS.find((x) => x.id === k).seen[0].toUpperCase()}${KINDS.find((x) => x.id === k).seen.slice(1)} will see it.` })
      }
    } catch (err) { toast({ error: true, title: 'Can’t do that', text: err.message }) }
  }
  // Cheapest first, the most expensive at the bottom; things you can't buy
  // (from badges, levels or publishing) after everything for sale.
  const rank = (c) => (c.free ? -1 : c.price === null ? Infinity : c.price)
  const items = COSMETICS.filter((c) => c.kind === kind).sort((a, b) => rank(a) - rank(b) || String(a.badge || a.level || a.edition || '').localeCompare(String(b.badge || b.level || b.edition || '')))
  const k = KINDS.find((x) => x.id === kind)
  return (
    <div className='page shop'>
      <div className='wh-head'>
        <div>
          <h1>Shop</h1>
          <div className='wh-coins'><Coins n={coins} /></div>
        </div>
        <p className='lede'>Looks only. Nothing here helps you win or changes what anything pays, and everything you buy is yours for good, even after publishing an edition.</p>
        {econ?.bankrupt && <p className='shop-locked'>⚖️ While you’re bankrupt your looks are locked away and the shop is closed. Everything you own is still yours: it all comes back when you’re discharged.</p>}
      </div>
      <div className='tabs' role='tablist'>
        {KINDS.map((x) => <button key={x.id} role='tab' aria-selected={kind === x.id} className={kind === x.id ? 'on' : ''} onClick={() => setKind(x.id)}>{x.name}</button>)}
      </div>
      <p className='lede' style={{ margin: '0 0 14px' }}>{k.blurb} <span className='seen'>Seen by {k.seen}.</span></p>
      <div className='shop-grid'>
        {items.map((c) => {
          const have = c.free || owned.has(`${c.kind}:${c.id}`)
          const wearing = look[c.kind] === c.id
          return (
            <div key={c.id} className={`shop-item r-${c.rarity} ${wearing ? 'wearing' : ''} ${have ? 'have' : ''}`}>
              <div className='preview'><Preview c={c} me={me} /></div>
              <div className='meta'>
                <strong>{c.name}</strong>
                <span className={`rarity r-${c.rarity}`}>{RARITY[c.rarity]}</span>
              </div>
              {flavor(c) && <small className='desc'>{flavor(c)}</small>}
              <div className='buy'>
                {wearing
                  ? <span className='wearing-tag'>{k.seen === 'you' ? 'In use' : 'Wearing'}</span>
                  : have
                    ? <button className='btn small' onClick={() => act('equip', c.kind, c.id)}>{k.seen === 'you' ? 'Use' : 'Wear'}</button>
                    : c.price === null
                      ? <span className='locked-tag' title={lockText(c)}>{lockText(c)}</span>
                      : <button className='btn small primary' disabled={coins < c.price} onClick={(e) => act('buyCosmetic', c.kind, c.id, e.currentTarget)}><Coins n={c.price} /></button>}
                {c.kind === 'confetti' && <button className='btn small ghost' onClick={(e) => { setConfettiStyle(c.id); const at = centerOf(e.currentTarget); burst(at.x, at.y, 'confetti'); setTimeout(() => setConfettiStyle(look.confetti), 50) }}>Try</button>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// How to get something that can't be bought, from the rule itself (so the
// words always match what's checked): a badge, a level, or publishing.
const BADGE = Object.fromEntries(BADGES.map((b) => [b.id, b]))
export function lockText (c) {
  if (c.badge) { const b = BADGE[c.badge]; return b ? `🏅 ${b.name} badge: ${b.hint.replace(/\.$/, '')}` : '🏅 Comes with a badge' }
  if (c.level) return `⭐ Reach level ${c.level}`
  if (c.edition) return `📖 Publish ${c.edition === 1 ? 'once' : `${c.edition} times`}`
  if (c.pack) return '🃏 Only in card packs'
  if (c.valley) return `🌾 Wird Valley: ${VALLEY_GOALS[c.valley]?.text || 'earned there'}`
  if (c.wl) return `🕳️ ${WL_GOALS[c.wl]?.text || 'Earned in Wirdlike'}`
  if (c.lx) return `📚 Wird Tycoon: ${LX_GOALS[c.lx]?.text || 'earned there'}`
  if (c.cw) return `🗣️ Catchword: ${CW_GOALS[c.cw]?.text || 'earned there'}`
  return '🔒 Not for sale'
}
// The description without the how-to-get-it part (the lock says that).
const flavor = (c) => String(c.desc || '').replace(/^(Reach level \d+\.|Comes with[^.]*\.|Earned [^.]*\.|Only in card packs\.|From Wirdlike\.|From Catchword\.|From Wird Tycoon)\s*/, '').trim()

// A small picture of each item, drawn with the same styles the real thing uses.
export function Preview ({ c, me }) {
  if (c.kind === 'room') {
    return (
      <div className={`mini-room room-${c.id}`}>
        <div className='mini-table felt-classic'><div className='felt' /><span className='mini-card' /><span className='mini-card' /><span className='mini-card' /></div>
      </div>
    )
  }
  if (c.kind === 'reactions') return <div className='mini-react'>{(c.emoji.length ? c.emoji : ['😂', '😮', '🔥', '💀']).map((e, i) => <span key={i}>{e}</span>)}</div>
  if (c.kind === 'table') {
    return (
      <div className={`mini-table felt-${c.id}`}>
        <div className='felt' />
        <span className='mini-card' /><span className='mini-card' /><span className='mini-card' />
      </div>
    )
  }
  if (c.kind === 'frame') return <Avatar name={me?.name || 'You'} color={me?.color || '#8ab4e8'} frame={c.id} size={54} />
  if (c.kind === 'face') return <Avatar name={me?.name || 'You'} color={me?.color || '#8ab4e8'} face={c.id} size={54} />
  if (c.kind === 'cardBack') return <div className={`mini-back cb-${c.id}`} />
  if (c.kind === 'title') return <div className='mini-title'><b>{me?.name || 'You'}</b><span>{c.text || 'Level 12'}</span></div>
  if (c.kind === 'name') return <div className={`mini-name nm-${c.id}`}>{me?.name || 'You'}</div>
  if (c.kind === 'confetti') return <div className='mini-confetti'>{c.letters ? 'A B C' : c.emoji ? c.emoji.join(' ') : '🎉'}</div>
  if (c.kind === 'coin') return <div className='mini-coins'><CoinArt skin={c.id} side='heads' size={58} /><CoinArt skin={c.id} side='tails' size={58} /></div>
  return null
}
