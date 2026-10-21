import { useCallback, useEffect, useState } from 'react'
import { api, Coins, useToast, useInterval } from './ui.jsx'
import { formatCoins } from '../shared/economy.js'
import { STANCES, power, rarityName, TRAIN_MAX_HOURS } from '../shared/leximon.js'
import { burst, centerOf } from './effects.js'
import LiveDuels from './Duel.jsx'

// The Leximon: words you've caught, your team of three, training and duels.
// A word's rarity is how you feel about it; everything else is growth.

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
export const roman = (n) => ROMAN[n] || `${n}`
const stance = (id) => STANCES.find((s) => s.id === id) || STANCES[2]
const big = (n) => (n < 1000 ? Math.round(n).toLocaleString() : formatCoins(n))

// One word as a card. Tier sets the look: plain, framed, foil, holo, and
// beyond that ever more extravagant.
export function LexCard ({ c, size = 'md', onClick, selected, children }) {
  const side = c.rarity?.side || 'none'
  const tier = Math.max(1, c.tier || 1)
  const name = c.rarityName || rarityName(c.rarity || { tier: 0 })
  const pw = c.power ?? power(c)
  return (
    <div className={`lexcard s-${size} side-${side} rt-${c.rarity?.tier || 0} tier-${Math.min(tier, 8)} ${tier > 8 ? 'tier-max' : ''} ${selected ? 'selected' : ''} ${onClick ? 'clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick() } : undefined}>
      <div className='lc-inner'>
        <div className='lc-top'><span className='lc-rarity'>{name}</span><span className='lc-tier' title={`Tier ${tier}`}>{roman(tier)}</span></div>
        <div className='lc-word'>{c.word}</div>
        <div className='lc-stats'>
          <span title='Level'>Lv <b>{c.level}</b></span>
          <span title={stance(c.stance).name}>{stance(c.stance).emoji}</span>
          <span title='Power'>⚡ <b>{big(pw)}</b></span>
        </div>
        {c.next !== undefined && size !== 'sm' && <div className='lc-xp' title={c.ready ? 'Ready to ascend' : `${Math.floor(c.xp)} / ${c.next} XP`}><i style={{ width: `${c.ready ? 100 : Math.min(100, (c.xp / c.next) * 100)}%` }} /></div>}
        {children}
      </div>
    </div>
  )
}

// A wild word on the Play page, until your next new rating.
export function WildWord ({ e, onDone, toast, active = true }) {
  const grab = async (ev) => {
    try {
      const at = centerOf(ev?.currentTarget || document.querySelector('.wild'))
      const c = await api('leximonAction', 'catch')
      burst(at.x, at.y, 'confetti')
      toast({ emoji: '🃏', title: `You caught ${e.word}!`, text: `${e.rarityName || 'Common'}. ${c.team.some((x) => x.word === e.word) ? 'It’s on your team, learning from every new word you rate.' : 'It’s in your collection.'}` })
      onDone(true)
    } catch (err) { toast({ error: true, title: 'Couldn’t catch it', text: err.message }); onDone(false) }
  }
  useEffect(() => {
    const onKey = (ev) => {
      if (!active || ['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName) || ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (ev.key === 'l' || ev.key === 'L') { ev.preventDefault(); grab() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  const r = e.rarity || {}
  return (
    <div className={`wild side-${r.side || 'none'} rt-${r.tier || 0}`} role='status'>
      <small>A wild word appeared!</small>
      <b>{e.word}</b>
      <span className='wild-rar'>{e.rarityName || rarityName(r)}{r.side === 'love' ? ' · one you love' : r.side === 'hate' ? ' · one you can’t stand' : ''}</span>
      <div className='wild-actions'>
        <button className='btn small primary' onClick={grab}>Catch <kbd>L</kbd></button>
        <button className='btn small ghost' onClick={() => { api('leximonAction', 'dismiss'); onDone(false) }}>Let it go</button>
      </div>
      <small className='wild-hint'>{e.stay > 1 ? 'It sticks around for a few more words.' : 'It leaves after your next new word.'}</small>
    </div>
  )
}

export default function Leximon ({ econ, friends, settings }) {
  const toast = useToast()
  const [v, setV] = useState(null)
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('lex-tab') || 'team' } catch { return 'team' } })
  const load = useCallback(() => api('leximon').then(setV).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  useEffect(() => { try { localStorage.setItem('lex-tab', tab) } catch {} }, [tab])
  useInterval(load, 15000) // training ticks along
  const act = async (...args) => {
    try { setV(await api('leximonAction', ...args)); return true } catch (err) { toast({ error: true, title: 'Can’t do that', text: err.message }); return false }
  }
  if (!v) return null
  return (
    <div className='page leximon'>
      <div className='lx-head'>
        <div>
          <h1>Leximon</h1>
          <p className='lede'>Every few new words, one of the words you’ve rated shows up to be caught. How rare it is depends on how you feel about it, among all your ratings: your most-loved are <b>Beloved</b>, your most-hated are <b>Nemesis</b>. Your team of three learns from every new word you rate.</p>
        </div>
        <div className='mk-summary'>
          <div><small>Caught</small><b>{v.caught.toLocaleString()}</b><small>of {v.rated.toLocaleString()} rated</small></div>
          <div><small>Wirdhouse bonus</small><b>+{(v.bonus * 100).toFixed(1)}%</b><small>from your team</small></div>
          <div><small>Duels</small><b>{v.duels.wins}–{v.duels.losses}</b><small>{v.duels.perDay - v.duels.today} left today</small></div>
        </div>
      </div>
      <div className='tabs' role='tablist'>
        {[['team', 'Team'], ['dex', `Lexidex (${v.cards.length})`], ['train', `Training${v.training ? ` (${v.training})` : ''}`], ['duels', 'Duels']].map(([id, label]) => <button key={id} role='tab' aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {!v.cards.length && (
        <div className='lx-empty'>
          <div className='lx-empty-cards' aria-hidden='true'><span /><span /><span /></div>
          <b>No words yet.</b>
          <p>Keep rating new words: {v.nextIn ? `a wild word shows up in about ${v.nextIn} more` : 'one should show up soon'}. You’ll get the chance to catch it (press <kbd>L</kbd>).</p>
        </div>
      )}
      {v.cards.length > 0 && tab === 'team' && <Team v={v} act={act} econ={econ} />}
      {v.cards.length > 0 && tab === 'dex' && <Dex v={v} act={act} />}
      {v.cards.length > 0 && tab === 'train' && <Training v={v} act={act} econ={econ} />}
      {tab === 'duels' && <LiveDuels v={v} toast={toast} settings={settings} />}
    </div>
  )
}

function Team ({ v, act, econ }) {
  const [pick, setPick] = useState(null) // a slot being filled
  const coins = econ?.coins ?? 0
  return (
    <>
      <div className='lx-team'>
        {[0, 1, 2].map((slot) => {
          const c = v.team[slot]
          if (!c) return <button key={slot} className='lx-slot' onClick={() => setPick(slot)}>+ Add a word</button>
          return (
            <div key={c.word} className='lx-member'>
              <LexCard c={c} size='lg' />
              <div className='lx-stances' role='radiogroup' aria-label='Stance'>
                {STANCES.map((s) => <button key={s.id} role='radio' aria-checked={c.stance === s.id} className={c.stance === s.id ? 'on' : ''} title={`${s.name} beats ${STANCES.find((x) => x.id === s.beats).name}`} onClick={() => act('stance', c.word, s.id)}>{s.emoji} {s.name}</button>)}
              </div>
              {c.ready
                ? <button className='btn primary' disabled={coins < c.ascendCost} onClick={() => act('ascend', c.word)}>Ascend to tier {roman(c.tier + 1)} · <Coins n={c.ascendCost} /></button>
                : <small className='lx-note'>{Math.floor(c.next - c.xp)} XP to level {c.level + 1} · tier {roman(c.tier)} tops out at level {c.cap}</small>}
              <span className='lx-member-acts'>
                <button className='btn small ghost' onClick={() => setPick(slot)}>Swap</button>
                <button className='btn small ghost' onClick={() => act('unequip', c.word)}>Bench</button>
              </span>
            </div>
          )
        })}
      </div>
      <div className='lx-focus'>
        <div>
          <b>Focus</b>
          <small>{v.focus ? `×${v.focus.mult} on what your team learns from ratings, for ${Math.max(1, Math.round((v.focus.until - Date.now()) / 60000))} more min.` : 'Coins can speed up what your team learns from your ratings, for an hour. Never past ×1.5: rating is how words grow.'}</small>
        </div>
        <span>{v.focusOptions.map((f) => <button key={f.id} className='btn small' disabled={coins < f.cost || (v.focus && v.focus.mult >= f.mult)} onClick={() => act('focus', f.id)}>×{f.mult} · <Coins n={f.cost} /></button>)}</span>
      </div>
      {pick !== null && (
        <div className='lx-picker'>
          <h3>Pick a word for slot {pick + 1}</h3>
          <div className='lx-grid'>
            {v.cards.filter((c) => !c.onTeam || v.team[pick]?.word === c.word).map((c) => <LexCard key={c.word} c={c} size='sm' onClick={async () => { await act('equip', c.word, pick); setPick(null) }} />)}
          </div>
          <button className='btn small ghost' onClick={() => setPick(null)}>Cancel</button>
        </div>
      )}
    </>
  )
}

function Dex ({ v, act }) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('power')
  const [sel, setSel] = useState(null)
  let cards = v.cards.filter((c) => filter === 'all' || (filter === 'love' ? c.rarity.side === 'love' : filter === 'hate' ? c.rarity.side === 'hate' : !c.rarity.side))
  cards = [...cards].sort(sort === 'rarity' ? (a, b) => b.rarity.tier - a.rarity.tier || b.power - a.power : sort === 'name' ? (a, b) => a.word.localeCompare(b.word) : sort === 'new' ? (a, b) => b.caughtAt - a.caughtAt : (a, b) => b.power - a.power)
  const s = v.cards.find((c) => c.word === sel)
  return (
    <>
      <div className='lx-tools'>
        <div className='seg'>{[['all', 'All'], ['love', '💗 Loved'], ['hate', '🗡️ Hated'], ['none', 'Neither']].map(([id, label]) => <button key={id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div>
        <div className='seg'>{[['power', 'Power'], ['rarity', 'Rarity'], ['new', 'Newest'], ['name', 'A–Z']].map(([id, label]) => <button key={id} className={sort === id ? 'on' : ''} onClick={() => setSort(id)}>{label}</button>)}</div>
      </div>
      <div className='lx-grid'>{cards.map((c) => <LexCard key={c.word} c={c} size='md' selected={sel === c.word} onClick={() => setSel(sel === c.word ? null : c.word)} />)}</div>
      {s && (
        <div className='lx-sel'>
          <b>{s.word}</b> · {s.rarityName} · caught {new Date(s.caughtAt).toLocaleDateString()} · {Math.round(s.xpTotal).toLocaleString()} XP learned
          <span>
            {!s.onTeam && <button className='btn small' disabled={v.team.length >= 3} onClick={() => act('equip', s.word, v.team.length)}>{v.team.length >= 3 ? 'Team is full' : 'Add to team'}</button>}
            <button className='btn small ghost danger' onClick={async () => { if (await act('release', s.word)) setSel(null) }}>Release</button>
          </span>
        </div>
      )}
    </>
  )
}

function Training ({ v, act, econ }) {
  const coins = econ?.coins ?? 0
  const training = v.cards.filter((c) => c.train)
  const now = Date.now()
  return (
    <>
      <p className='lede'>Training teaches a word for coins while you’re doing other things, up to {TRAIN_MAX_HOURS} hours a word a day and {v.trainSlots} words at a time. A full day of it is worth about 20 new ratings. Rating is still the fastest way: every new word teaches your whole team.</p>
      {training.length > 0 && (
        <div className='lx-training'>
          {training.map((c) => {
            const k = Math.min(1, (now - c.train.start) / (c.train.end - c.train.start))
            return <div key={c.word} className='lx-trainrow'><LexCard c={c} size='sm' /><div><b>{c.word}</b><div className='lx-bar'><i style={{ width: `${k * 100}%` }} /></div><small>{Math.round(c.train.xp * k)} of {c.train.xp} XP · done {new Date(c.train.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></div></div>
          })}
        </div>
      )}
      <table className='rated-table lx-traintable'>
        <thead><tr><th>Word</th><th>Level</th><th>Left today</th><th>Train</th></tr></thead>
        <tbody>
          {v.cards.filter((c) => !c.train).map((c) => (
            <tr key={c.word}>
              <td><b>{c.word}</b> <small>{c.rarityName}</small></td>
              <td>{c.level}{c.ready ? ' (ascend first)' : ''}</td>
              <td>{c.trainLeft} h</td>
              <td className='lx-trainbtns'>{[1, 3, TRAIN_MAX_HOURS].filter((h, i, a) => a.indexOf(h) === i).map((h) => <button key={h} className='btn small' disabled={h > c.trainLeft || v.training >= v.trainSlots || coins < c.trainCost * h} onClick={() => act('train', c.word, h)}>{h} h · <Coins n={c.trainCost * h} /></button>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
