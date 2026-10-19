import { useEffect, useMemo, useState } from 'react'
import { formatRating } from '../shared/progress.js'
import { api, Avatar, Bar, ratingColor, timeAgo, plural, useToast } from './ui.jsx'
import { titleText } from '../shared/cosmetics.js'

// A friend's profile, laid out like your own Collection: their numbers, how
// they rate (with yours drawn behind for comparison), how the two of you line
// up, and everything they've shared: words, favorites, comments, playlists
// and badges. Clicking a word opens it on the Play screen.
export default function FriendProfile ({ userId, online, myProfile, openWord, playMode, refreshTop, onBack }) {
  const [p, setP] = useState(null)
  const [tab, setTab] = useState('words')
  const [mineNow, setMineNow] = useState(null)
  useEffect(() => { api('profile').then(setMineNow).catch(() => {}) }, [userId])
  useEffect(() => {
    let live = true
    const load = () => api('friendProfile', userId).then((x) => { if (live) setP(x) }).catch(() => {})
    load()
    const off = window.ww.on.friendRecords?.(load)
    return () => { live = false; off?.() }
  }, [userId])
  if (!p) return <div className='page'><button className='btn small ghost back' onClick={onBack}>← Friends</button></div>
  const s = p.stats
  const mine = (mineNow || myProfile)?.stats?.rated ? (mineNow || myProfile).stats.histogram : null
  const myTotal = mine ? Math.max(1, mine.reduce((a, b) => a + b, 0)) : 1
  const theirTotal = Math.max(1, s.rated)
  // Both drawn as shares of each person's words, so a big collection doesn't dwarf a small one.
  const maxShare = Math.max(...s.histogram.map((c) => c / theirTotal), ...(mine || []).map((c) => c / myTotal), 0.0001)
  const m = p.match
  return (
    <div className='page friend-profile'>
      <button className='btn small ghost back' onClick={onBack}>← Friends</button>
      <div className='fp-head'>
        <Avatar name={p.name} color={p.color} frame={p.look?.frame}><i className={online ? 'on' : ''} /></Avatar>
        <div>
          <h1 className={`nm-${p.look?.name || 'plain'}`}>{p.name}</h1>
          <p className='lede'>
            {titleText(p.look?.title) ? <b className='fp-title'>{titleText(p.look.title)}. </b> : null}{p.title}, level {p.level}{p.edition > 0 ? `, edition ${p.edition + 1}` : ''}. {online ? 'Online now.' : p.lastSeen ? `Last seen ${timeAgo(p.lastSeen)}.` : 'Not seen yet.'} {p.addedAt && `Friends since ${new Date(p.addedAt).toLocaleDateString()}.`}
          </p>
        </div>
        <span className='fp-actions'>
          {p.unrated > 0 && <button className='btn primary' onClick={() => playMode(`friend:${userId}`)}>Rate their words <small>({p.unrated} left)</small></button>}
        </span>
      </div>

      <div className='hero-stats'>
        <div><strong>{s.rated.toLocaleString()}</strong><span>words rated</span></div>
        <div><strong style={{ color: ratingColor(s.average) }}>{s.average === null ? '–' : formatRating(s.average)}</strong><span>average rating</span></div>
        <div><strong>{s.median === null ? '–' : formatRating(s.median)}</strong><span>median</span></div>
        <div><strong>{p.bestStreak ?? '–'}</strong><span>best streak (days)</span></div>
        <div><strong>{p.badgeCount}</strong><span>badges</span></div>
        <div><strong style={{ color: m?.pct == null ? undefined : m.pct >= 80 ? 'var(--good)' : m.pct < 55 ? 'var(--bad)' : 'var(--mid)' }}>{m?.pct == null ? '–' : `${m.pct}%`}</strong><span>{m?.pct == null ? `taste match (${m?.shared || 0} of 5 shared)` : `taste match, ${plural(m.shared, 'word')}`}</span></div>
      </div>

      {s.rated > 0 && (
        <>
          <h2>How they rate</h2>
          <div className='hist two' role='img' aria-label={`How many words ${p.name} gave each rating, with yours behind`}>
            {s.histogram.map((count, i) => (
              <div key={i}>
                {mine && <b style={{ height: `${(mine[i] / myTotal / maxShare) * 100}%` }} title={`You: ${mine[i]} words`} />}
                <i style={{ height: `${(count / theirTotal / maxShare) * 100}%`, background: ratingColor(i / 2) }} title={`${p.name}: ${count} words`} />
                <small>{i === 10 ? '5' : (i / 2).toFixed(1)}</small>
              </div>
            ))}
          </div>
          {mine && <p className='hist-key'><span className='k them' /> {p.name} <span className='k you' /> you, as a share of each of your words</p>}
        </>
      )}

      {p.shared > 0 && (
        <div className='you-two'>
          <div className='panel'>
            <h3>Where you agree</h3>
            {p.agree.length ? <><PairHead name={p.name} />{p.agree.map((x) => <Pair key={x.word} x={x} name={p.name} openWord={openWord} />)}</> : <p>Nothing within half a point yet.</p>}
          </div>
          <div className='panel'>
            <h3>Where you don’t</h3>
            {p.disagree.length ? <><PairHead name={p.name} />{p.disagree.map((x) => <Pair key={x.word} x={x} name={p.name} openWord={openWord} />)}</> : <p>No real disagreements yet: nothing a full point apart.</p>}
          </div>
        </div>
      )}

      <div className='tabs' role='tablist'>
        {[['words', 'Rated words'], ['favorites', `Favorites (${p.favorites.length})`], ['comments', `Comments (${p.comments.length})`], ['playlists', `Playlists (${p.playlists.length})`], ['badges', 'Badges']].map(([id, label]) => (
          <button key={id} role='tab' aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'words' && <TheirRated list={p.ratings} name={p.name} openWord={openWord} />}
      {tab === 'favorites' && (p.favorites.length
        ? <div className='wordcloud'>{p.favorites.map((f) => <button key={f.word} className='chip' onClick={() => openWord(f.word)}>💛 {f.word}</button>)}</div>
        : <p className='lede'>No favorites from {p.name} yet.</p>)}
      {tab === 'comments' && (p.comments.length
        ? <div className='fp-comments'>{p.comments.map((c) => (
          <button key={c.word} className='fp-comment' onClick={() => openWord(c.word)}>
            <b>{c.word}</b>{p.ratings.find((x) => x.word === c.word) && <span className='r' style={{ color: ratingColor(p.ratings.find((x) => x.word === c.word).r) }}>{formatRating(p.ratings.find((x) => x.word === c.word).r)}</span>}
            <q>{c.text}</q><small>{timeAgo(c.t)}</small>
          </button>
        ))}</div>
        : <p className='lede'>No comments from {p.name} yet.</p>)}
      {tab === 'playlists' && (p.playlists.length
        ? <TheirPlaylists lists={p.playlists} playMode={playMode} refreshTop={refreshTop} openWord={openWord} />
        : <p className='lede'>{p.name} hasn’t made any playlists.</p>)}
      {tab === 'badges' && (p.badges
        ? (p.badges.length
            ? <div className='badges'>{p.badges.map((b) => <div key={b.id} className='badge'><span className='em'>{b.emoji}</span><strong>{b.name}</strong><small>{b.hint}</small></div>)}</div>
            : <p className='lede'>No badges yet.</p>)
        : <p className='lede'>{p.name} has {plural(p.badgeCount, 'badge')}. Which ones shows up once they’re on the latest wirdwatcher.</p>)}
    </div>
  )
}

function PairHead ({ name }) {
  return <div className='fp-pair head'><span /><span className='r'>{name}</span><span className='r you'>You</span></div>
}

function Pair ({ x, name, openWord }) {
  return (
    <button className='fp-pair' onClick={() => openWord(x.word)}>
      <span className='w'>{x.word}</span>
      <span className='r' title={name} style={{ color: ratingColor(x.r) }}>{formatRating(x.r)}</span>
      <span className='r you' title='You' style={{ color: ratingColor(x.mine) }}>{formatRating(x.mine)}</span>
    </button>
  )
}

function TheirRated ({ list, name, openWord }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('recent')
  const shown = useMemo(() => {
    let l = q ? list.filter((x) => x.word.includes(q.toLowerCase())) : list
    if (sort === 'high') l = [...l].sort((a, b) => b.r - a.r)
    if (sort === 'low') l = [...l].sort((a, b) => a.r - b.r)
    if (sort === 'apart') l = l.filter((x) => x.mine !== null).sort((a, b) => Math.abs(b.r - b.mine) - Math.abs(a.r - a.mine))
    if (sort === 'new') l = l.filter((x) => x.mine === null)
    return l.slice(0, 300)
  }, [list, q, sort])
  if (!list.length) return <p className='lede'>Nothing from {name} yet. It arrives the next time you’re both online.</p>
  return (
    <>
      <div style={{ display: 'flex', gap: 10, maxWidth: 820, marginBottom: 6, flexWrap: 'wrap' }}>
        <input className='field' style={{ flex: 1, minWidth: 180 }} placeholder={`Search ${plural(list.length, 'word')}`} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className='seg' style={{ width: 420 }}>
          {[['recent', 'Recent'], ['high', 'Best'], ['low', 'Worst'], ['apart', 'Most apart'], ['new', 'New to you']].map(([id, label]) => <button key={id} className={sort === id ? 'on' : ''} onClick={() => setSort(id)}>{label}</button>)}
        </div>
      </div>
      <table className='rated-table fp-table'>
        <thead><tr><th>{name}</th><th>You</th><th /><th /></tr></thead>
        <tbody>
          {shown.map((x) => (
            <tr key={x.word} onClick={() => openWord(x.word)}>
              <td className='r' style={{ color: ratingColor(x.r) }}>{formatRating(x.r)}</td>
              <td className='r you' style={{ color: x.mine === null ? undefined : ratingColor(x.mine) }}>{x.mine === null ? '·' : formatRating(x.mine)}</td>
              <td>{x.word}</td>
              <td className='t'>{timeAgo(x.t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!shown.length && <p className='lede'>{sort === 'new' ? 'You’ve rated every word they have.' : 'Nothing matches.'}</p>}
      {shown.length === 300 && <p className='lede'>Showing 300. Search to find the rest.</p>}
    </>
  )
}

function TheirPlaylists ({ lists, playMode, refreshTop, openWord }) {
  const toast = useToast()
  const [open, setOpen] = useState(null)
  return (
    <div className='lists'>
      {lists.map((l) => (
        <div key={l.id} className='list-card'>
          <header><span className='em'>{l.emoji}</span><strong>{l.name}</strong></header>
          <small>{l.done} of {plural(l.total, 'word')} rated by you</small>
          <Bar done={l.done} total={l.total} />
          <div className='actions'>
            <button className='btn small primary' onClick={() => playMode(l.id)} disabled={!l.total}>Play</button>
            <button className='btn small ghost' onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? 'Hide words' : 'Words'}</button>
            <button className='btn small ghost' onClick={async () => { const [, owner, id] = l.id.split(':'); await api('savePlaylist', owner, id); toast({ emoji: l.emoji, title: `Saved “${l.name}” to your playlists` }); refreshTop() }}>Save a copy</button>
          </div>
          {open === l.id && <div className='wordcloud'>{l.words.map((w) => <button key={w} className='chip' onClick={() => openWord(w)}>{w}</button>)}</div>}
        </div>
      ))}
    </div>
  )
}
