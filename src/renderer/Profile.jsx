import { useEffect, useState } from 'react'
import { formatRating } from '../shared/progress.js'
import { api, Coins, ratingColor, timeAgo, useToast } from './ui.jsx'
import { LexCard, roman } from './Lexicon.jsx'
import { rarityName } from '../shared/lexicon.js'
import { formatCoins } from '../shared/economy.js'

// Pieces of a profile, the same on yours and a friend's (after Letterboxd):
// four favorite words up top, a diary of recent ratings, and tabs for the
// Lexicon and the casino and market.

// Four favorite words, big, like film posters. Yours can be changed.
export function Top4 ({ items, editable, onSave, openWord, name }) {
  const [editing, setEditing] = useState(null) // slot being chosen
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([])
  const toast = useToast()
  useEffect(() => {
    if (editing === null || !q.trim()) { setHits([]); return }
    api('searchWords', q).then((h) => setHits(h.filter((x) => x.r !== null).slice(0, 8))).catch(() => {})
  }, [q, editing])
  const save = async (list) => { try { await onSave(list) } catch (err) { toast({ error: true, title: 'Couldn’t save', text: err.message }) } }
  const set = (slot, word) => {
    const words = items.map((x) => x.word)
    while (words.length < 4) words.push(null)
    const was = words.indexOf(word)
    if (was >= 0) words[was] = words[slot]
    words[slot] = word
    setEditing(null); setQ('')
    save(words.filter(Boolean))
  }
  const slots = [0, 1, 2, 3].map((i) => items[i] || null)
  if (!editable && !items.length) return null
  return (
    <section className='top4'>
      <h2>{editable ? 'Your top 4' : `${name}’s top 4`}{editable && <small> words you love most</small>}</h2>
      <div className='top4-row'>
        {slots.map((x, i) => (x
          ? (
            <div key={i} className='poster' style={{ '--rc': ratingColor(x.r ?? 2.5) }}>
              <button className='poster-word' style={{ fontSize: x.word.length > 12 ? 17 : x.word.length > 9 ? 20 : x.word.length > 7 ? 25 : 30 }} onClick={() => openWord?.(x.word)}>{x.word}</button>
              <span className='poster-r'>{x.r === null || x.r === undefined ? '–' : formatRating(x.r)}</span>
              {x.def && <small className='poster-def'>{x.def}</small>}
              {editable && <span className='poster-acts'><button onClick={() => setEditing(i)}>Change</button><button onClick={() => save(items.filter((_, j) => j !== i).map((y) => y.word))}>Remove</button></span>}
            </div>
            )
          : editable
            ? <button key={i} className='poster empty' onClick={() => setEditing(i)}>+ Add a favorite</button>
            : <div key={i} className='poster empty none' />))}
      </div>
      {editing !== null && (
        <div className='top4-pick'>
          <input autoFocus className='field' placeholder='Search words you’ve rated' value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null) }} />
          <div className='top4-hits'>{hits.map((h) => <button key={h.word} className='chip' onClick={() => set(editing, h.word)}>{h.word} <b style={{ color: ratingColor(h.r) }}>{formatRating(h.r)}</b></button>)}</div>
          {q && !hits.length && <small>Only words you’ve rated can go here.</small>}
          <button className='btn small ghost' onClick={() => setEditing(null)}>Cancel</button>
        </div>
      )}
    </section>
  )
}

// Recent ratings, newest first, like a diary.
export function Diary ({ items, openWord, title = 'Recently rated' }) {
  if (!items.length) return null
  return (
    <section className='diary'>
      <h2>{title}</h2>
      <div className='diary-row'>
        {items.map((x) => (
          <button key={x.word} className='diary-item' onClick={() => openWord?.(x.word)} title={new Date(x.t).toLocaleString()}>
            <b>{x.word}</b>
            <span style={{ color: ratingColor(x.r) }}>{formatRating(x.r)}</span>
            <small>{timeAgo(x.t)}</small>
          </button>
        ))}
      </div>
    </section>
  )
}

// A Lexicon as anyone sees it.
export function LexiconPanel ({ lex, name }) {
  if (!lex) return <p className='lede'>{name ? `${name} hasn’t shared a Lexicon yet. It shows up once they’re on the latest wirdwatcher.` : 'No Lexicon yet.'}</p>
  const who = name || 'You'
  return (
    <div className='pf-lex'>
      <div className='hero-stats'>
        <div><strong>{lex.caught.toLocaleString()}</strong><span>words caught</span></div>
        <div><strong>{lex.wins}–{lex.losses}</strong><span>duels won–lost</span></div>
      </div>
      <h3>{name ? `${name}’s team` : 'Your team'}</h3>
      {lex.team.length ? <div className='lx-grid'>{lex.team.map((c) => <LexCard key={c.word} c={c} size='md' />)}</div> : <p className='lede'>{who} {name ? 'hasn’t' : 'haven’t'} picked a team yet.</p>}
      {(lex.beloved || lex.nemesis) && (
        <div className='pf-extremes'>
          {lex.beloved && <div><small>Most beloved</small><b>{lex.beloved.word}</b><span>{rarityName(lex.beloved.rarity)} · tier {roman(lex.beloved.tier)} · lv {lex.beloved.level}</span></div>}
          {lex.nemesis && <div><small>Worst nemesis</small><b>{lex.nemesis.word}</b><span>{rarityName(lex.nemesis.rarity)} · tier {roman(lex.nemesis.tier)} · lv {lex.nemesis.level}</span></div>}
        </div>
      )}
    </div>
  )
}

// The market and the casino: returns, flips and spins.
export function CasinoPanel ({ market, casino, name }) {
  if (!market && !casino) return <p className='lede'>{name ? `${name} keeps their market and casino record to themselves.` : 'Nothing yet.'}</p>
  const sign = (n) => `${n >= 0 ? '+' : '−'}${formatCoins(Math.abs(n))}`
  const pct = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`
  return (
    <div className='pf-casino'>
      {market && (
        <section className='panel'>
          <h3>📈 Word Exchange</h3>
          <div className='hero-stats'>
            <div><strong className={market.gain >= 0 ? 'up' : 'down'}>{market.trades ? pct(market.returnPct) : '–'}</strong><span>all-time return</span></div>
            <div><strong className={market.gain >= 0 ? 'up' : 'down'}>{sign(market.gain)}</strong><span>gained</span></div>
            <div><strong><Coins n={market.value} /></strong><span>holdings now</span></div>
            <div><strong>{market.trades.toLocaleString()}</strong><span>trades</span></div>
          </div>
          {market.best && <p className='pf-best'>Best trade: <b>{market.best.word}</b>, {pct(market.best.pct)}</p>}
        </section>
      )}
      {casino && (
        <section className='panel'>
          <h3>🎰 Casino</h3>
          <div className='hero-stats'>
            <div><strong>{casino.spins.toLocaleString()}</strong><span>spins</span></div>
            <div><strong>{casino.jackpots}</strong><span>jackpots</span></div>
            <div><strong>{casino.bestSpin ? casino.bestSpin.toUpperCase() : '–'}</strong><span>best word</span></div>
            <div><strong className={casino.slotNet >= 0 ? 'up' : 'down'}>{sign(casino.slotNet)}</strong><span>on slots</span></div>
          </div>
          <div className='hero-stats'>
            <div><strong>{casino.flips.toLocaleString()}</strong><span>coinflips</span></div>
            <div><strong>{casino.flips ? `${Math.round((casino.flipWins / casino.flips) * 100)}%` : '–'}</strong><span>won</span></div>
            <div><strong>{casino.flipStreak}</strong><span>best run</span></div>
            <div><strong className={casino.flipNet >= 0 ? 'up' : 'down'}>{sign(casino.flipNet)}</strong><span>on flips</span></div>
          </div>
        </section>
      )}
    </div>
  )
}

// Ratings from this calendar year.
export const thisYear = (list) => { const y = new Date().getFullYear(); return list.filter((x) => new Date(x.t).getFullYear() === y).length }
