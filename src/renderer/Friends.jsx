import { useEffect, useState } from 'react'
import { formatRating } from '../shared/progress.js'
import { api, Avatar, ratingColor, timeAgo, plural, useToast, useInterval } from './ui.jsx'

// Friends: make or use a one-time code, see who's online and what they rated.
export default function Friends ({ friends, openWord, refreshTop }) {
  const toast = useToast()
  const [code, setCode] = useState(null) // { code, expiresAt }
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  const [open, setOpen] = useState(null)
  useInterval(() => tick((x) => x + 1), code ? 1000 : 0)

  useEffect(() => window.ww.on.friendCode((e) => {
    if (e.friend) { toast({ emoji: '🤝', title: `You and ${e.friend.name} are friends`, text: 'Your ratings will swap whenever you’re both online.' }); setCode(null); refreshTop() }
    if (e.expired) setCode(null)
    if (e.error) toast({ error: true, title: 'Adding a friend didn’t work', text: e.error })
  }), [toast, refreshTop])

  const make = async () => {
    try { setCode(await api('makeFriendCode')) } catch (err) { toast({ error: true, title: 'Couldn’t make a code', text: err.message }) }
  }
  const redeem = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const f = await api('redeemFriendCode', input)
      toast({ emoji: '🤝', title: `You and ${f.name} are friends`, text: 'Your ratings will swap whenever you’re both online.' })
      setInput('')
      refreshTop()
    } catch (err) { toast({ error: true, title: 'Couldn’t add that friend', text: err.message }) }
    setBusy(false)
  }
  const left = code ? Math.max(0, code.expiresAt - Date.now()) : 0

  return (
    <div className='page'>
      <h1>Friends</h1>
      <p className='lede'>Friends get your ratings, comments, favorites and playlists, and you get theirs. It all goes straight between your computers whenever you’re both online. There’s no server in between.</p>
      <div className='friends-grid'>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className='panel'>
            <h3>Add a friend</h3>
            <p>Make a code and send it to them. It works once, and only while wirdwatcher is open here.</p>
            {code
              ? (
                <>
                  <div className='code'>{code.code}</div>
                  <div className='code-meta'>
                    <span>Waiting for them. {Math.floor(left / 60000)}:{String(Math.floor(left / 1000) % 60).padStart(2, '0')} left</span>
                    <span><button className='btn small' onClick={() => { api('copy', code.code); toast({ emoji: '📋', title: 'Copied the code' }) }}>Copy</button> <button className='btn small ghost' onClick={() => { api('cancelFriendCode'); setCode(null) }}>Cancel</button></span>
                  </div>
                </>
                )
              : <button className='btn primary' onClick={make}>Make a friend code</button>}
          </div>
          <form className='panel' onSubmit={redeem}>
            <h3>Got a code?</h3>
            <p>Type the code a friend sent you. They need wirdwatcher open.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className='field' placeholder='WW-XXXXX-XXXXX-XXXXX-XXXXX' value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} spellCheck={false} maxLength={40} />
              <button className='btn primary' disabled={busy || input.replace(/[^0-9A-Z]/gi, '').length < 20}>{busy ? 'Connecting…' : 'Add'}</button>
            </div>
          </form>
        </div>
        <div>
          {!friends.length && <div className='empty-state' style={{ marginTop: 40 }}><div className='big'>🫂</div><p>No friends yet. Make a code and send it to someone you’d like to compare words with.</p></div>}
          {friends.map((f) => (
            <div key={f.userId}>
              <div className='friend-row'>
                <Avatar name={f.name} color={f.color}><i className={f.online ? 'on' : ''} /></Avatar>
                <div>
                  <strong>{f.name}</strong>
                  <small>Level {f.level}{f.title && `, ${f.title}`}. {plural(f.rated, 'word')} rated. {f.online ? 'Online now' : f.lastSeen ? `Last seen ${timeAgo(f.lastSeen)}` : 'Not seen yet'}</small>
                  <small className='match'>{f.match?.pct != null ? <><b style={{ color: f.match.pct >= 80 ? 'var(--good)' : f.match.pct < 55 ? 'var(--bad)' : 'var(--mid)' }}>{f.match.pct}%</b> taste match over {plural(f.match.shared, 'word')} you both rated</> : f.match?.shared ? `${f.match.shared} of 5 shared words for a taste match` : 'Rate the same words to see your taste match'}</small>
                </div>
                <span>
                  <button className='btn small ghost' onClick={() => setOpen(open === f.userId ? null : f.userId)}>{open === f.userId ? 'Hide' : 'Their words'}</button>
                  <button className='btn small ghost danger' onClick={async () => { if (window.confirm?.(`Remove ${f.name}? You’ll both stop getting each other’s ratings.`) !== false) { await api('removeFriend', f.userId); refreshTop() } }}>Remove</button>
                </span>
              </div>
              {open === f.userId && <TheirWords id={f.userId} openWord={openWord} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TheirWords ({ id, openWord }) {
  const [list, setList] = useState(null)
  useEffect(() => { api('friendRatings', id).then((l) => setList(l.sort((a, b) => b.t - a.t))) }, [id])
  if (!list) return null
  if (!list.length) return <p className='lede' style={{ margin: '10px 0' }}>Nothing from them yet. It arrives the next time you’re both online.</p>
  return (
    <div className='wordcloud' style={{ padding: '12px 0 4px' }}>
      {list.slice(0, 80).map((x) => <button key={x.word} className='chip' onClick={() => openWord(x.word)}>{x.word} <span className='r' style={{ color: ratingColor(x.r) }}>{formatRating(x.r)}</span></button>)}
    </div>
  )
}
