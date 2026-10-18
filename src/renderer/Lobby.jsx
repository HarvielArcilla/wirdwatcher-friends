import { useEffect, useRef, useState, useCallback } from 'react'
import { typeRating, ratingValue, nudge, formatRating } from '../shared/progress.js'
import { api, Avatar, Kbd, ratingColor, useToast, useInterval, wordSize, speak } from './ui.jsx'

// Lobbies. Before you're in one: host or join. In one: a round table with a
// seat per player. While rating, a seat shows a face-down card once that
// player locks in; when everyone has, every card flips at the same moment.
export default function Lobby ({ lobby, choices, me, active, events }) {
  if (!lobby) return <Entry />
  return <Table lobby={lobby} choices={choices} active={active} events={events} />
}

function Entry () {
  const toast = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(null)
  const host = async () => {
    setBusy('host')
    try { await api('hostLobby', { rounds: 10, mode: 'everyday', timer: 0 }) } catch (err) { toast({ error: true, title: 'Couldn’t open a lobby', text: err.message }) }
    setBusy(null)
  }
  const join = async (e) => {
    e.preventDefault()
    setBusy('join')
    try { await api('joinLobby', code) } catch (err) { toast({ error: true, title: 'Couldn’t join', text: err.message }) }
    setBusy(null)
  }
  return (
    <div className='page'>
      <h1>Lobby</h1>
      <p className='lede'>Rate the same words with up to 7 other people. Nobody sees a rating until everyone has locked theirs in, then the whole table flips at once.</p>
      <div className='lobby-entry'>
        <div className='panel'>
          <h3>Host a table</h3>
          <p>You’ll get a code to send to the others. You choose the words, the number of rounds and whether there’s a timer.</p>
          <button className='btn primary' onClick={host} disabled={Boolean(busy)}>{busy === 'host' ? 'Opening…' : 'Host a lobby'}</button>
        </div>
        <form className='panel' onSubmit={join}>
          <h3>Join a table</h3>
          <p>Type the code the host sent you. It looks like K7Q2M-9XD4P.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className='field' value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder='Lobby code' maxLength={14} spellCheck={false} style={{ fontSize: 18, letterSpacing: 1.5 }} />
            <button className='btn primary' disabled={Boolean(busy) || code.replace(/[^0-9A-Z]/gi, '').length !== 10}>{busy === 'join' ? 'Finding…' : 'Join'}</button>
          </div>
        </form>
      </div>
      <h2>How a round works</h2>
      <ol className='lede' style={{ paddingLeft: 20, lineHeight: 1.8 }}>
        <li>Everyone sees the same word. Type your rating and press <Kbd>Enter</Kbd> to lock it in.</li>
        <li>When the last person locks in, every card flips. You score up to 100 for how close you were to everyone else.</li>
        <li>Press <Kbd>Enter</Kbd> when you’re ready for the next word. Ratings you make here count as your own.</li>
      </ol>
    </div>
  )
}

// Seats go round the table starting at the bottom (you); each player's card
// sits on the felt in front of them.
function around (i, n, rx, ry) {
  const a = Math.PI / 2 + (i / n) * Math.PI * 2
  return { left: `${50 + Math.cos(a) * rx}%`, top: `${50 + Math.sin(a) * ry}%` }
}

function Table ({ lobby, choices, active, events }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [, tick] = useState(0)
  const [reactions, setReactions] = useState([])
  const [chat, setChat] = useState('')
  const deadline = useRef(null)
  const me = lobby.players.find((p) => p.me)
  const c = lobby.current
  const res = c?.result
  const locked = Boolean(me?.locked)
  const phase = lobby.phase

  useEffect(() => { setText('') }, [lobby.round, phase === 'waiting'])
  useEffect(() => { deadline.current = c?.endsIn != null ? Date.now() + c.endsIn : null }, [c?.word, phase]) // eslint-disable-line react-hooks/exhaustive-deps
  useInterval(() => tick((x) => x + 1), deadline.current && phase === 'rating' ? 250 : 0)

  useEffect(() => {
    const last = events[events.length - 1]
    if (last?.kind === 'react') {
      const key = Math.random()
      setReactions((r) => [...r, { ...last, key }])
      setTimeout(() => setReactions((r) => r.filter((x) => x.key !== key)), 1700)
    }
  }, [events])

  const act = useCallback((action, arg) => api('lobbyAction', action, arg).catch((err) => toast({ error: true, title: 'Couldn’t do that', text: err.message })), [toast])

  const onKey = useCallback((e) => {
    if (!active || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.metaKey || e.ctrlKey) return
    const k = e.key
    if (e.altKey) {
      const n = /^Digit[1-8]$/.test(e.code) ? Number(e.code.slice(5)) : 0
      if (n && choices?.reactions[n - 1]) { e.preventDefault(); act('react', choices.reactions[n - 1]) }
      return
    }
    if (phase === 'rating') {
      if (k === 'Enter') { e.preventDefault(); const r = ratingValue(text); if (r !== null && !locked) { act('rate', r); setText(formatRating(r)) } } else if (k === 'Backspace') { e.preventDefault(); if (locked) act('rate', null); setText('') } else if (/^[0-9.]$/.test(k) && !locked) { e.preventDefault(); setText((t) => typeRating((t.length === 3 ? '' : t) + k)) } else if ((k === 'ArrowUp' || k === 'ArrowDown') && !locked) { e.preventDefault(); setText((t) => formatRating(nudge(ratingValue(t) ?? 2.5, (k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.5 : 0.1)))) } else if (k === ' ') { e.preventDefault(); speak(c.word) }
    } else if (phase === 'reveal' && k === 'Enter') {
      e.preventDefault(); act('next')
    } else if ((phase === 'waiting' || phase === 'results') && k === 'Enter' && lobby.isHost) {
      e.preventDefault(); act('begin')
    }
  }, [active, phase, text, locked, act, c, lobby.isHost, choices])
  useEffect(() => { window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onKey])

  // Me at the bottom, everyone else around.
  const mine = lobby.players.findIndex((p) => p.me)
  const seats = [...lobby.players.slice(mine), ...lobby.players.slice(0, mine)]
  const n = Math.max(seats.length, Math.min(lobby.max, Math.max(4, seats.length + 1)))
  const left = deadline.current ? Math.max(0, deadline.current - Date.now()) : null
  const lockedCount = lobby.players.filter((p) => p.locked).length
  const nextCount = lobby.players.filter((p) => p.next).length
  const r = ratingValue(text)

  return (
    <div className='lobby'>
      <section className='lobby-stage'>
        <div className='lobby-top'>
          <span className='round'>
            {phase === 'waiting' && 'Waiting for players'}
            {(phase === 'rating' || phase === 'reveal') && <>Word <b>{lobby.round}</b> of {lobby.options.rounds}</>}
            {phase === 'results' && 'Game over'}
          </span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {left !== null && phase === 'rating' && <span className='round'><b>{Math.ceil(left / 1000)}</b>s</span>}
            {lobby.isHost && phase === 'rating' && <button className='btn small ghost' onClick={() => act('advance')}>Reveal now</button>}
            {lobby.isHost && phase === 'reveal' && <button className='btn small ghost' onClick={() => act('advance')}>Skip waiting</button>}
            {lobby.isHost && (phase === 'rating' || phase === 'reveal') && <button className='btn small ghost' onClick={() => act('backToLobby')}>End game</button>}
            <button className='btn small' onClick={() => api('leaveLobby')}>{lobby.isHost ? 'Close lobby' : 'Leave'}</button>
          </span>
        </div>

        <div className='table'>
          {left !== null && phase === 'rating' && c.endsIn != null && (
            <svg className='timer' viewBox='0 0 100 100' preserveAspectRatio='none' aria-hidden='true'>
              <ellipse cx='50' cy='50' rx='49' ry='49' fill='none' stroke='var(--accent)' strokeWidth='1.2' vectorEffect='non-scaling-stroke' pathLength='100' strokeDasharray={`${(left / (lobby.options.timer * 1000)) * 100} 100`} transform='rotate(-90 50 50)' />
            </svg>
          )}
          <div className='felt' />
          <div className='felt-center'>
            {phase === 'waiting' && (
              <>
                <div className='tsub'>Send this code to the others</div>
                <div className='bigcode' style={{ margin: '8px 0 10px' }}>{lobby.code}</div>
                <button className='btn small' onClick={() => { api('copy', lobby.code); toast({ emoji: '📋', title: 'Copied the code' }) }}>Copy code</button>
                <div className='tsub' style={{ marginTop: 14 }}>{lobby.players.length} of {lobby.max} seats taken</div>
              </>
            )}
            {phase === 'rating' && c && (
              <>
                <div className='tword' key={c.word} style={{ fontSize: wordSize(c.word, 64, 26) }}>{c.word}</div>
                {c.info?.ipa?.[0] && <div className='tipa'>/{c.info.ipa[0]}/</div>}
                {c.info?.senses?.[0] && <div className='tdef'><i style={{ color: 'var(--faint)', fontStyle: 'normal', fontFamily: 'var(--font-ui)', fontSize: 12 }}>{c.info.senses[0].posName}</i> {c.info.senses[0].def}</div>}
                <div className='tsub' style={{ marginTop: 12 }}>{lockedCount} of {lobby.players.length} locked in</div>
              </>
            )}
            {phase === 'reveal' && res && <Verdict word={c.word} res={res} players={lobby.players} />}
            {phase === 'results' && <Podium players={lobby.players} />}
          </div>

          {Array.from({ length: n }, (_, i) => {
            const p = seats[i]
            const pos = around(i, n, 45, 44)
            const cardPos = around(i, n, 26, 26)
            if (!p) return <div key={`e${i}`} className='seat empty' style={pos}><span className='avatar' /><span className='sname'>Open seat</span></div>
            const rv = res?.ratings[p.id]
            const flip = phase === 'reveal' && rv !== undefined
            return [
              phase !== 'waiting' && phase !== 'results' && (
                <div key={`c${p.id}`} className={`card ${p.locked ? 'locked' : ''} ${flip ? 'flip' : ''}`} style={cardPos}>
                  <div style={{ transitionDelay: `${i * 90}ms` }}>
                    <div className='back'>{p.locked ? '✓' : ''}</div>
                    <div className='face' style={flip ? { '--rc': ratingColor(rv) } : undefined}>{flip ? formatRating(rv) : ''}{flip && <small>+{res.points[p.id]}</small>}</div>
                  </div>
                </div>
              ),
              <div key={p.id} className='seat' style={pos}>
                <SeatReactions reactions={reactions} playerId={p.id} />
                <Avatar name={p.name} color={p.color} />
                <span className='sname'>{p.me ? 'You' : p.name}{p.id === lobby.host && <small> host</small>}{p.friend && <small> friend</small>}</span>
                <span className='slvl'>Level {p.level}</span>
                {phase !== 'waiting' && <span className='pts'>{p.score} pts</span>}
                {phase === 'reveal' && res.hotTake === p.id && <span className='tag'>hot take</span>}
                {phase === 'reveal' && p.next && <span className='tag ok'>ready</span>}
                {lobby.isHost && !p.me && phase === 'waiting' && <button className='btn small ghost' onClick={() => act('kick', p.id)}>Remove</button>}
              </div>
            ]
          })}
        </div>

        <div className='lobby-bottom'>
          {phase === 'rating' && (
            <>
              <input className={`rating-input ${locked ? 'locked' : ''}`} value={text} readOnly placeholder='0.0' aria-label='Your rating' style={{ color: r !== null ? ratingColor(r) : undefined }} />
              <div className='rate-help'>
                {locked ? <span>Locked in. <Kbd>Backspace</Kbd> to change it.</span> : r !== null ? <span><Kbd>Enter</Kbd> to lock in <b>{text}</b></span> : <span>Type a rating out of 5</span>}
                <span>Waiting on {lobby.players.filter((p) => !p.locked).map((p) => (p.me ? 'you' : p.name)).join(', ') || 'nobody'}</span>
              </div>
            </>
          )}
          {phase === 'reveal' && (
            <div className='rate-help' style={{ textAlign: 'center' }}>
              <span>{me?.next ? `Waiting for ${lobby.players.length - nextCount} more` : <><Kbd>Enter</Kbd> when you’re ready for the next word</>}</span>
              <span>{nextCount} of {lobby.players.length} ready</span>
            </div>
          )}
          {(phase === 'waiting' || phase === 'results') && (lobby.isHost
            ? <button className='btn primary' onClick={() => act('begin')} disabled={lobby.players.length < 1}>{phase === 'results' ? 'Play again' : lobby.players.length < 2 ? 'Start on your own' : `Start with ${lobby.players.length} players`}</button>
            : <span className='rate-help'>The host will start {phase === 'results' ? 'the next game' : 'when everyone’s here'}.</span>)}
        </div>
        {phase === 'results' && lobby.summary && (
          <div className='awards'>
            {lobby.summary.awards.map((a, i) => <div key={i} className='award'><span className='em'>{a.emoji}</span><strong>{a.title}{a.word && `: ${a.word}`}</strong><span>{a.detail}</span></div>)}
          </div>
        )}
      </section>

      <aside className='lobby-side'>
        {lobby.isHost && (phase === 'waiting' || phase === 'results') && (
          <div className='sect'>
            <h3>Game</h3>
            <div className='opts'>
              <label>Words from
                <select className='field' value={lobby.options.mode} onChange={(e) => act('configure', { mode: e.target.value })}>
                  {choices.modes.map((m) => <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}
                </select>
              </label>
              <label>Rounds
                <div className='seg'>{choices.rounds.map((x) => <button key={x} className={lobby.options.rounds === x ? 'on' : ''} onClick={() => act('configure', { rounds: x })}>{x}</button>)}</div>
              </label>
              <label>Timer
                <div className='seg'>{choices.timers.map((x) => <button key={x} className={lobby.options.timer === x ? 'on' : ''} onClick={() => act('configure', { timer: x })}>{x ? `${x}s` : 'None'}</button>)}</div>
              </label>
            </div>
          </div>
        )}
        {!lobby.isHost && (phase === 'waiting' || phase === 'results') && (
          <div className='sect'>
            <h3>Game</h3>
            <div className='rate-help'>
              <span>{choices.modes.find((m) => m.id === lobby.options.mode)?.name || 'Shuffle'}, {lobby.options.rounds} words, {lobby.options.timer ? `${lobby.options.timer}s timer` : 'no timer'}</span>
            </div>
          </div>
        )}
        <div className='sect'>
          <h3>React <span style={{ fontWeight: 400, fontSize: 12 }}>Alt + 1–8</span></h3>
          <div className='reactions'>{choices.reactions.map((e) => <button key={e} onClick={() => act('react', e)} aria-label={`React ${e}`}>{e}</button>)}</div>
        </div>
        <div className='chat' aria-live='polite'>
          {events.filter((e) => e.kind !== 'react').map((e, i) => {
            const p = lobby.players.find((x) => x.id === e.id)
            const who = p ? (p.me ? 'You' : p.name) : (e.name || 'Someone')
            if (e.kind === 'join') return <div key={i} className='sys'>{who} sat down.</div>
            if (e.kind === 'leave') return <div key={i} className='sys'>{who} left.</div>
            return <div key={i}><b style={{ color: p?.color }}>{who}</b> {e.text}</div>
          })}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (chat.trim()) { act('chat', chat); setChat('') } }}>
          <input className='field' value={chat} maxLength={140} onChange={(e) => setChat(e.target.value)} placeholder='Say something to the table' onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur() }} />
        </form>
      </aside>
    </div>
  )
}

function SeatReactions ({ reactions, playerId }) {
  return reactions.filter((x) => x.id === playerId).map((x) => <span key={x.key} className='reaction'>{x.emoji}</span>)
}

function Verdict ({ word, res, players }) {
  const n = Object.keys(res.ratings).length
  const hot = players.find((p) => p.id === res.hotTake)
  let verdict = n < 2 ? 'Just you this time' : res.spread === 0 ? 'Perfect agreement' : res.hive ? 'Hive mind' : res.spread >= 3 ? 'The table is split' : res.spread >= 1.5 ? 'Some disagreement' : 'Pretty close'
  if (hot) verdict = `Hot take from ${hot.me ? 'you' : hot.name}`
  return (
    <>
      <div className='tsub'>{word}</div>
      <div className='tmean' style={{ color: ratingColor(res.mean) }}>{res.mean === null ? '–' : formatRating(res.mean)}</div>
      <div className='tverdict'>{verdict}</div>
      {n >= 2 && <div className='tsub'>{formatRating(res.spread)} between highest and lowest</div>}
    </>
  )
}

function Podium ({ players }) {
  const top = [...players].sort((a, b) => b.score - a.score).slice(0, 3)
  const order = [top[1], top[0], top[2]].filter(Boolean)
  const h = { 0: 90, 1: 64, 2: 46 }
  return (
    <>
      <div className='tsub'>Most in tune with the table</div>
      <div className='podium'>
        {order.map((p) => {
          const place = top.indexOf(p)
          return (
            <div key={p.id}>
              <Avatar name={p.name} color={p.color} />
              <span style={{ fontWeight: 500, fontSize: 13 }}>{p.me ? 'You' : p.name}</span>
              <i style={{ height: h[place] }}>{p.score}</i>
            </div>
          )
        })}
      </div>
    </>
  )
}

