import { useEffect, useMemo, useState } from 'react'
import { formatRating } from '../shared/progress.js'
import { api, Bar, ratingColor, timeAgo, plural, useToast } from './ui.jsx'

// Your collection: stats, badges, every word you've rated, favorites and
// playlists. Clicking a word opens it on the Play screen.
export default function Collection ({ profile, modes, openWord, refreshTop, playMode }) {
  const [tab, setTab] = useState('words')
  if (!profile) return null
  const s = profile.stats
  const earned = profile.badges.filter((b) => b.earned).length
  return (
    <div className='page'>
      <h1>Collection</h1>
      <p className='lede'>{profile.level.title}, level {profile.level.level}. {profile.level.step - profile.level.into} XP to level {profile.level.level + 1}.</p>
      <div className='hero-stats'>
        <div><strong>{s.rated.toLocaleString()}</strong><span>words rated</span></div>
        <div><strong style={{ color: ratingColor(s.average) }}>{s.average === null ? '–' : formatRating(s.average)}</strong><span>average rating</span></div>
        <div><strong>{s.median === null ? '–' : formatRating(s.median)}</strong><span>median</span></div>
        <div><strong>{s.bestStreak}</strong><span>best streak (days)</span></div>
        <div><strong>{earned}/{profile.badges.length}</strong><span>badges</span></div>
      </div>

      {s.rated > 0 && (
        <>
          <h2>How you rate</h2>
          <div className='hist' role='img' aria-label='How many words you gave each rating'>
            {s.histogram.map((count, i) => {
              const max = Math.max(...s.histogram, 1)
              return <div key={i}><i style={{ height: `${(count / max) * 100}%`, background: ratingColor(i / 2) }} title={`${count} words`} /><small>{i === 10 ? '5' : (i / 2).toFixed(1)}</small></div>
            })}
          </div>
        </>
      )}

      <div className='tabs' role='tablist'>
        {[['words', 'Rated words'], ['favorites', 'Favorites'], ['playlists', 'Playlists'], ['badges', 'Badges']].map(([id, label]) => (
          <button key={id} role='tab' aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'words' && <Rated openWord={openWord} profile={profile} />}
      {tab === 'favorites' && (
        profile.favorites.length
          ? <div className='wordcloud'>{profile.favorites.map((f) => <button key={f.word} className='chip' onClick={() => openWord(f.word)}>💛 {f.word}</button>)}</div>
          : <p className='lede'>Press <kbd>F</kbd> on any word to keep it here.</p>
      )}
      {tab === 'playlists' && <Playlists modes={modes} refreshTop={refreshTop} playMode={playMode} openWord={openWord} />}
      {tab === 'badges' && (
        <div className='badges'>
          {profile.badges.map((b) => (
            <div key={b.id} className={`badge ${b.earned ? '' : 'locked'}`} title={b.earned ? `Earned ${new Date(b.earned).toLocaleDateString()}` : 'Not yet'}>
              <span className='em'>{b.emoji}</span><strong>{b.name}</strong><small>{b.hint}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Rated ({ openWord, profile }) {
  const [all, setAll] = useState(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('recent')
  useEffect(() => { api('allRatings').then(setAll) }, [profile])
  const shown = useMemo(() => {
    if (!all) return []
    let list = q ? all.filter((x) => x.word.includes(q.toLowerCase())) : all
    if (sort === 'high') list = [...list].sort((a, b) => b.r - a.r)
    if (sort === 'low') list = [...list].sort((a, b) => a.r - b.r)
    if (sort === 'az') list = [...list].sort((a, b) => a.word.localeCompare(b.word))
    return list.slice(0, 300)
  }, [all, q, sort])
  if (!all) return null
  if (!all.length) return <p className='lede'>Nothing yet. Every word you rate lands here.</p>
  return (
    <>
      <div style={{ display: 'flex', gap: 10, maxWidth: 760, marginBottom: 6 }}>
        <input className='field' placeholder={`Search ${plural(all.length, 'word')}`} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className='seg' style={{ width: 300 }}>
          {[['recent', 'Recent'], ['high', 'Best'], ['low', 'Worst'], ['az', 'A–Z']].map(([id, label]) => <button key={id} className={sort === id ? 'on' : ''} onClick={() => setSort(id)}>{label}</button>)}
        </div>
      </div>
      <table className='rated-table'>
        <tbody>
          {shown.map((x) => (
            <tr key={x.word} onClick={() => openWord(x.word)}>
              <td className='r' style={{ color: ratingColor(x.r) }}>{formatRating(x.r)}</td>
              <td>{x.word}</td>
              <td className='t'>{timeAgo(x.t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 300 && <p className='lede'>Showing 300. Search to find the rest.</p>}
    </>
  )
}

const EMOJIS = ['🎧', '🐾', '🍜', '🌈', '🔥', '🧠', '🎲', '🌙', '🌊', '🍄', '🎭', '⚡']

function Playlists ({ modes, refreshTop, playMode, openWord }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎧')
  const [words, setWords] = useState('')
  const [open, setOpen] = useState(null)
  const create = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    const list = words.toLowerCase().split(/[\s,]+/).filter(Boolean)
    await api('createPlaylist', { name, emoji, words: list })
    toast({ emoji, title: `Made “${name.trim()}”`, text: 'Friends will see it too.' })
    setName(''); setWords('')
    refreshTop()
  }
  return (
    <>
      <form className='panel' onSubmit={create} style={{ maxWidth: 760, marginBottom: 18 }}>
        <h3>New playlist</h3>
        <p>Collect words to rate later, or for friends to play through. Finish one with 10 or more words for a bonus.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select className='field' style={{ width: 70 }} value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label='Playlist emoji'>{EMOJIS.map((x) => <option key={x}>{x}</option>)}</select>
          <input className='field' placeholder='Name' value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </div>
        <textarea className='field' style={{ height: 70, resize: 'vertical' }} placeholder='Words to start with, separated by spaces or commas (optional)' value={words} onChange={(e) => setWords(e.target.value)} />
        <div style={{ marginTop: 8 }}><button className='btn primary'>Make playlist</button></div>
      </form>
      <div className='lists'>
        {modes.playlists.map((l) => (
          <div key={l.id} className='list-card'>
            <header><span className='em'>{l.emoji}</span><strong>{l.name}</strong></header>
            <small>{l.done} of {plural(l.total, 'word')} rated</small>
            <Bar done={l.done} total={l.total} />
            <div className='actions'>
              <button className='btn small primary' onClick={() => playMode(l.id)} disabled={!l.total}>Play</button>
              <button className='btn small ghost' onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? 'Hide words' : 'Words'}</button>
              <button className='btn small ghost danger' onClick={async () => { await api('deletePlaylist', l.id.slice(5)); refreshTop() }}>Delete</button>
            </div>
            {open === l.id && <div className='wordcloud'>{l.words.map((w) => <button key={w} className='chip' onClick={() => openWord(w)}>{w}</button>)}</div>}
          </div>
        ))}
        {modes.friendPlaylists.map((l) => (
          <div key={l.id} className='list-card'>
            <header><span className='em'>{l.emoji}</span><strong>{l.name}</strong></header>
            <small>from {l.ownerName}, {l.done} of {plural(l.total, 'word')} rated</small>
            <Bar done={l.done} total={l.total} />
            <div className='actions'>
              <button className='btn small primary' onClick={() => playMode(l.id)} disabled={!l.total}>Play</button>
              <button className='btn small ghost' onClick={async () => { const [, owner, id] = l.id.split(':'); await api('savePlaylist', owner, id); toast({ emoji: l.emoji, title: `Saved “${l.name}” to your playlists` }); refreshTop() }}>Save a copy</button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
