import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { typeRating, ratingValue, nudge, formatRating } from '../shared/progress.js'
import { playRating } from './sound.js'
import { burst, centerOf, fxFor, burstFor } from './effects.js'
import { api, Avatar, Kbd, ratingColor, useToast, useInterval, wordSize, speak } from './ui.jsx'
import { titleText, packEmoji } from '../shared/cosmetics.js'

// Lobbies. Before you're in one: host or join. In one: a round table with a
// seat per player and a card on the felt in front of each seat. What happens
// on the table depends on the mode; see src/core/lobby.js.

export const STYLES = [
  { id: 'classic', name: 'Classic', emoji: '☕', blurb: 'Everyone rates the same word, then the table flips. No points: see who went highest and lowest and talk it out.' },
  { id: 'highlow', name: 'High/Low', emoji: '↕️', blurb: 'Rate, then guess who went highest and who went lowest before anything is shown. 100 points for each right guess.' },
  { id: 'hotseat', name: 'Hot seat', emoji: '🔥', blurb: 'One player is in the seat; the next picks a word for them from three. Everyone predicts the seat’s rating.' },
  { id: 'hive', name: 'Hive mind', emoji: '🐝', blurb: 'You get a secret target and a rater. Find a word you think they’ll rate near your target.' }
]
const styleOf = (id) => STYLES.find((s) => s.id === id) || STYLES[0]

export default function Lobby ({ lobby, choices, me, active, events, settings }) {
  if (!lobby) return <Entry />
  return <Table lobby={lobby} choices={choices} active={active} events={events} settings={settings} />
}

function Entry () {
  const toast = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(null)
  const host = async () => {
    setBusy('host')
    try { await api('hostLobby', { rounds: 10, mode: 'everyday', timer: 0, style: 'classic' }) } catch (err) { toast({ error: true, title: 'Couldn’t open a lobby', text: err.message }) }
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
      <p className='lede'>Play with up to 7 other people around one table. Nothing anyone rates is shown until the table is ready, then everything flips at once.</p>
      <div className='lobby-entry'>
        <div className='panel'>
          <h3>Host a table</h3>
          <p>You’ll get a code to send to the others, and choose the mode, the words and the number of rounds.</p>
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
      <h2>Modes</h2>
      <div className='style-list'>
        {STYLES.map((s) => <div key={s.id} className='style-card static'><span className='em'>{s.emoji}</span><strong>{s.name}</strong><small>{s.blurb}</small></div>)}
      </div>
    </div>
  )
}

// Seats go round the table starting at the bottom (you); each player's card
// sits on the felt in front of them.
function around (i, n, rx, ry) {
  const a = Math.PI / 2 + (i / n) * Math.PI * 2
  return { left: `${50 + Math.cos(a) * rx}%`, top: `${50 + Math.sin(a) * ry}%` }
}

// Is this element somewhere you type words (chat, the hive finder)? Keys
// pressed there stay there; everywhere else, they go to the table.
const typingIn = (el) => Boolean(el && ((el.tagName === 'INPUT' && !el.readOnly) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable))

const list = (xs) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

function Table ({ lobby, choices, active, events, settings }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [, tick] = useState(0)
  const [reactions, setReactions] = useState([])
  const [chat, setChat] = useState('')
  const [guess, setGuess] = useState({ high: null, low: null })
  const [details, setDetails] = useState(false)
  const [peek, setPeek] = useState(null) // a word to show in the details panel (a choice being considered)
  const [chatting, setChatting] = useState(false) // the chat box has the keyboard
  const [offers, setOffers] = useState([]) // friend requests from people at the table
  const [asked, setAsked] = useState(() => new Set()) // seats I've asked
  const deadline = useRef(null)
  const me = lobby.players.find((p) => p.me)
  const you = me?.id
  const c = lobby.current
  const res = c?.result
  const style = c?.style || lobby.options.style
  const phase = lobby.phase
  const mine = c?.mine || {}
  const waiting = new Set(lobby.waitingOn || [])
  const iMustAct = waiting.has(you)
  const name = (id) => { const p = lobby.players.find((x) => x.id === id); return p ? (p.me ? 'you' : p.name) : 'someone' }
  const Name = (id) => { const p = lobby.players.find((x) => x.id === id); return p ? (p.me ? 'You' : p.name) : 'Someone' }

  // Resets for each phase of each word. The keyboard comes back to the table
  // too: whatever was focused (the chat, a button, a menu) lets go, so typing a
  // number always rates. The hive finder keeps it; it's where you type then.
  useEffect(() => {
    setText(''); setGuess({ high: null, low: null }); setPeek(null)
    const el = document.activeElement
    if (el && el !== document.body && !el.closest?.('.finder')) el.blur?.()
  }, [lobby.round, phase])
  // Celebrations at the reveal, from the card that earned them.
  useEffect(() => {
    if (phase !== 'reveal' || !res) return
    const cheers = Object.entries(res.ratings || {}).map(([id, v]) => [id, burstFor(fxFor(v, settings?.animations))]).filter(([, b]) => b && b !== 'sparkle')
    if (!cheers.length) return
    const t = setTimeout(() => cheers.forEach(([id, b]) => { const at = centerOf(document.querySelector(`[data-card="${id}"]`)); burst(at.x, at.y, b) }), 750)
    return () => clearTimeout(t)
  }, [phase, lobby.round]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { deadline.current = c?.endsIn != null ? Date.now() + c.endsIn : null }, [lobby.round, phase]) // eslint-disable-line react-hooks/exhaustive-deps
  useInterval(() => tick((x) => x + 1), deadline.current && phase !== 'reveal' ? 250 : 0)

  useEffect(() => {
    const last = events[events.length - 1]
    if (last?.kind === 'react') {
      const key = Math.random()
      setReactions((r) => [...r, { ...last, key }])
      setTimeout(() => setReactions((r) => r.filter((x) => x.key !== key)), 1700)
    }
  }, [events])

  // Friend requests at the table.
  useEffect(() => window.ww.on.lobbyFriend((m) => {
    if (m.kind === 'ask') setOffers((o) => (o.some((x) => x.from === m.from) ? o : [...o, m]))
    else if (m.yes) toast({ emoji: '🤝', title: `You and ${m.name} are friends`, text: 'Your ratings will swap whenever you’re both online.' })
    else if (m.error) toast({ error: true, title: 'Couldn’t add that friend', text: m.error })
    else toast({ emoji: '🙂', title: 'Maybe another time', text: 'They said not now.' })
  }), [toast])
  const askFriend = (p) => api('askFriend', p.id).then(() => { setAsked((s) => new Set([...s, p.id])); toast({ emoji: '📨', title: `Asked ${p.name}`, text: 'They’ll see it at the table.' }) }).catch((err) => toast({ error: true, title: 'Couldn’t ask', text: err.message }))
  const answer = (o, yes) => { setOffers((all) => all.filter((x) => x.from !== o.from)); api('answerFriend', o.from, yes).then((f) => { if (f) toast({ emoji: '🤝', title: `You and ${o.name} are friends`, text: 'Your ratings will swap whenever you’re both online.' }) }).catch((err) => toast({ error: true, title: 'Couldn’t add that friend', text: err.message })) }

  const act = useCallback((action, arg) => api('lobbyAction', action, arg).catch((err) => toast({ error: true, title: 'Couldn’t do that', text: err.message })), [toast])

  // The word on the table right now, for the details panel.
  const word = peek || (style === 'hive' ? (phase === 'rating' ? mine.toRate : mine.pick ? { word: mine.pick, info: mine.pickInfo } : null) : c?.word ? { word: c.word, info: c.info } : null)

  // Can I type a rating right now, and is it a prediction?
  const rating = phase === 'rating' && c && c.roster.includes(you) && (style !== 'hive' || mine.toRate)
  const predicting = rating && style === 'hotseat' && c.seat !== you
  const locked = rating && !iMustAct
  const ordered = useMemo(() => {
    const i = lobby.players.findIndex((p) => p.me)
    return [...lobby.players.slice(i), ...lobby.players.slice(0, i)]
  }, [lobby.players])
  const guessable = phase === 'guessing' ? ordered.filter((p) => c.roster.includes(p.id)) : []

  const pickGuess = (id) => {
    if (phase !== 'guessing' || !iMustAct) return
    setGuess((g) => (g.high === null ? { ...g, high: id } : g.low === null ? { ...g, low: id } : { high: id, low: null }))
  }
  const lockGuess = () => { if (guess.high && guess.low) act('guess', guess) }

  const onKey = useCallback((e) => {
    if (!active || typingIn(e.target) || e.metaKey || e.ctrlKey) return
    if (e.repeat && e.key === 'Enter') { e.preventDefault(); return }
    const k = e.key
    if (e.altKey) {
      const n = /^Digit[1-8]$/.test(e.code) ? Number(e.code.slice(5)) : 0
      if (n && choices?.reactions[n - 1]) { e.preventDefault(); act('react', choices.reactions[n - 1]) }
      return
    }
    if ((k === 'd' || k === 'D') && word) { e.preventDefault(); setDetails((v) => !v); return }
    if (k === ' ' && word) { e.preventDefault(); speak(word.word); return }
    if (rating) {
      if (k === 'Enter') { e.preventDefault(); const r = ratingValue(text); if (r !== null && !locked) { act('rate', r); setText(formatRating(r)); if (!predicting) playRating(r, settings) } } else if (k === 'Backspace') { e.preventDefault(); if (locked) act('rate', null); setText('') } else if (/^[0-9.]$/.test(k) && !locked) { e.preventDefault(); setText((t) => typeRating((t.length === 3 ? '' : t) + k)) } else if ((k === 'ArrowUp' || k === 'ArrowDown') && !locked) { e.preventDefault(); setText((t) => formatRating(nudge(ratingValue(t) ?? 2.5, (k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.5 : 0.1)))) }
    } else if (phase === 'guessing') {
      if (/^[1-8]$/.test(k) && guessable[Number(k) - 1]) { e.preventDefault(); pickGuess(guessable[Number(k) - 1].id) } else if (k === 'Enter') { e.preventDefault(); lockGuess() } else if (k === 'Backspace') { e.preventDefault(); if (!iMustAct) act('guess', { high: null, low: null }); setGuess({ high: null, low: null }) }
    } else if (phase === 'picking' && c?.picker === you && /^[1-3]$/.test(k)) {
      e.preventDefault(); act('pick', Number(k) - 1)
    } else if (phase === 'reveal' && k === 'Enter') {
      e.preventDefault(); act('next')
    } else if ((phase === 'waiting' || phase === 'results') && k === 'Enter' && lobby.isHost) {
      e.preventDefault(); act('begin')
    }
  }, [active, phase, text, locked, rating, predicting, act, c, lobby.isHost, choices, settings, word, guess, guessable, iMustAct, you]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onKey])

  const n = Math.max(ordered.length, Math.min(lobby.max, Math.max(4, ordered.length + 1)))
  const left = deadline.current ? Math.max(0, deadline.current - Date.now()) : null
  const total = c ? c.roster.filter((id) => lobby.players.some((p) => p.id === id)).length : lobby.players.length
  const nextCount = lobby.players.filter((p) => p.next).length
  const notReady = c ? lobby.players.filter((p) => c.roster.includes(p.id) && !p.next).map((p) => p.id) : []
  const r = ratingValue(text)
  const scored = style !== 'classic'
  const timerSecs = lobby.options.timer * (phase === 'choosing' ? 3 : 1)

  // What each seat's card shows at the reveal, and a note under the number.
  const cardFor = (p) => {
    if (!res) return null
    if (style === 'hotseat') {
      if (p.id === res.seat) return res.r === null ? null : { v: res.r, note: 'the seat' }
      const pr = res.predictions[p.id]
      return pr === undefined ? null : { v: pr, note: res.points[p.id] ? `+${res.points[p.id]}` : 'guess' }
    }
    if (style === 'hive') {
      // What this person gave the word they were handed, and what its
      // chooser was hoping they'd give it.
      const e = res.entries.find((x) => x.rater === p.id && x.word)
      return e && e.r !== null ? { v: e.r, note: `aim ${formatRating(e.target)}`, picker: e.picker, title: `${Name(p.id)} gave “${e.word}” ${formatRating(e.r)}. ${Name(e.picker)} chose it, aiming for ${formatRating(e.target)}.` } : null
    }
    const v = res.ratings[p.id]
    return v === undefined ? null : { v, note: style === 'highlow' && res.points[p.id] ? `+${res.points[p.id]}` : null }
  }

  return (
    <div className='lobby' onClickCapture={(e) => { const b = e.target.closest?.('button'); if (b) setTimeout(() => { if (document.activeElement === b) b.blur() }, 0) }}>
      <section className={`lobby-stage room-${lobby.room || 'plain'}`} onMouseDown={(e) => { if (!['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) document.activeElement?.blur?.() }}>
        {lobby.reconnecting && <div className='reconnecting' role='status'>Lost the host for a moment. Reconnecting… your seat is saved.</div>}
        <div className='lobby-top'>
          <span className='round'>
            <span className='mode-chip'>{styleOf(style).emoji} {styleOf(style).name}</span>
            {phase === 'waiting' && ' Waiting for players'}
            {c && phase !== 'results' && phase !== 'waiting' && <> Word <b>{lobby.round}</b> of {lobby.options.rounds}</>}
            {phase === 'results' && ' Game over'}
          </span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {left !== null && phase !== 'reveal' && <span className='round'><b>{Math.ceil(left / 1000)}</b>s</span>}
            {word && <button className='btn small ghost' onClick={() => setDetails((v) => !v)} title='Definitions and more (D)'>{details ? 'Hide word details' : 'Word details'}</button>}
            {lobby.isHost && ['rating', 'guessing', 'picking', 'choosing'].includes(phase) && <button className='btn small ghost' onClick={() => act('advance')}>{phase === 'rating' || phase === 'guessing' ? 'Reveal now' : 'Move on'}</button>}
            {lobby.isHost && phase === 'reveal' && <button className='btn small ghost' onClick={() => act('advance')}>Skip waiting</button>}
            {lobby.isHost && c && phase !== 'results' && <button className='btn small ghost' onClick={() => act('backToLobby')}>End game</button>}
            <button className='btn small' onClick={() => api('leaveLobby')}>{lobby.isHost ? 'Close lobby' : 'Leave'}</button>
          </span>
        </div>

        <div className={`table felt-${lobby.table || 'classic'}`}>
          {left !== null && phase !== 'reveal' && timerSecs > 0 && (
            <svg className='timer' viewBox='0 0 100 100' preserveAspectRatio='none' aria-hidden='true'>
              <ellipse cx='50' cy='50' rx='49' ry='49' fill='none' stroke='var(--accent)' strokeWidth='1.2' vectorEffect='non-scaling-stroke' pathLength='100' strokeDasharray={`${(left / (timerSecs * 1000)) * 100} 100`} transform='rotate(-90 50 50)' />
            </svg>
          )}
          <div className='felt' />
          <div className='felt-center'>
            <Center lobby={lobby} c={c} res={res} style={style} phase={phase} mine={mine} you={you} name={name} Name={Name} act={act} setPeek={setPeek} total={total} waiting={waiting} toast={toast} guess={guess} />
          </div>

          {Array.from({ length: n }, (_, i) => {
            const p = ordered[i]
            const pos = around(i, n, 45, 45)
            // The seats at the very top and bottom lie flat (name beside the
            // face), so they don't reach into the bar above or the text below.
            const flat = Math.abs(Math.sin(Math.PI / 2 + (i / n) * Math.PI * 2)) > 0.92
            const cardPos = around(i, n, 26, 25)
            if (!p) return <div key={`e${i}`} className='seat empty' style={pos}><span className='avatar' /><span className='sname'>Open seat</span></div>
            const inRound = c && c.roster.includes(p.id)
            const face = phase === 'reveal' ? cardFor(p) : null
            // In hive mind a card is lit by how well its chooser aimed.
            const cardHi = style === 'hive' ? Boolean(face && res?.best?.includes(face.picker)) : null
            const cardLo = style === 'hive' ? Boolean(face && res?.worst?.includes(face.picker)) : null
            const showCard = inRound && phase !== 'waiting' && phase !== 'results' && !(style === 'hotseat' && phase === 'picking')
            const hi = res?.highest?.includes(p.id)
            const lo = res?.lowest?.includes(p.id)
            const best = res?.best?.includes(p.id)
            const worst = res?.worst?.includes(p.id)
            const g = res?.guesses?.[p.id]
            const guessIndex = guessable.findIndex((x) => x.id === p.id)
            const clickable = phase === 'guessing' && iMustAct && guessIndex >= 0
            return [
              showCard && (
                <div key={`c${p.id}`} data-card={p.id} className={`card ${p.locked || phase === 'guessing' ? 'locked' : ''} ${face ? 'flip' : ''} ${face && (cardHi ?? (hi || best)) ? 'card-hi' : ''} ${face && (cardLo ?? (lo || worst)) ? 'card-lo' : ''} ${face && face.v <= 0.5 && settings?.animations !== 'off' ? 'crack' : ''} ${style === 'hotseat' && p.id === c.seat ? 'card-seat' : ''}`} style={cardPos} title={face?.title}>
                  <div style={{ transitionDelay: `${i * 90}ms` }}>
                    <div className={`back cb-${p.look?.cardBack || 'stripes'}`}>{p.locked || phase === 'guessing' ? '✓' : ''}</div>
                    <div className='face' style={face ? { '--rc': ratingColor(face.v) } : undefined}>{face ? formatRating(face.v) : ''}{face?.note && <small>{face.note}</small>}</div>
                  </div>
                </div>
              ),
              <div key={p.id} className={`seat ${flat ? 'row' : ''} ${p.away ? 'away' : ''} ${clickable ? 'pickable' : ''} ${guess.high === p.id ? 'g-high' : ''} ${guess.low === p.id ? 'g-low' : ''} ${style === 'hotseat' && c && p.id === c.seat ? 'in-seat' : ''}`} style={pos} onClick={clickable ? () => pickGuess(p.id) : undefined} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined} aria-label={clickable ? `Guess ${p.me ? 'yourself' : p.name}` : undefined}>
                <SeatReactions reactions={reactions} playerId={p.id} />
                <span className='seat-face'><Avatar name={p.name} color={p.color} frame={p.look?.frame} /><i className='seat-ring' aria-hidden='true' />{clickable && <span className='seat-key'>{guessIndex + 1}</span>}</span>
                <div className='seat-text'>
                  <span className={`sname nm-${p.look?.name || 'plain'}`} title={p.edition ? `Edition ${p.edition + 1}` : undefined}>{p.me ? 'You' : p.name}{p.edition > 0 && <sup className='ed'>✦{p.edition + 1}</sup>}{p.id === lobby.host && <small> host</small>}{p.friend && <small> friend</small>}</span>
                  <span className='slvl'>
                    {style === 'hotseat' && c && phase !== 'results' && p.role ? (p.role === 'seat' ? 'in the hot seat' : 'picking') : titleText(p.look?.title) || `Level ${p.level}`}
                    {phase !== 'waiting' && scored && <b className='pts'> · {p.score} pts</b>}
                  </span>
                  <span className='seat-tags'>
                    {p.away && <span className='tag away'>reconnecting…</span>}
                    {guess.high === p.id && phase === 'guessing' && <span className='tag hi'>your highest</span>}
                    {guess.low === p.id && phase === 'guessing' && <span className='tag lo'>your lowest</span>}
                    {phase === 'reveal' && hi && <span className='tag hi'>highest</span>}
                    {phase === 'reveal' && lo && <span className='tag lo'>lowest</span>}
                    {phase === 'reveal' && best && <span className='tag hi'>{style === 'hive' ? 'closest aim' : 'best guess'}</span>}
                    {phase === 'reveal' && worst && <span className='tag lo'>{style === 'hive' ? 'furthest aim' : 'furthest'}</span>}
                    {phase === 'reveal' && res?.hotTake === p.id && <span className='tag'>hot take</span>}
                    {phase === 'reveal' && p.next && <span className='tag ok'>ready</span>}
                  </span>
                  {phase === 'reveal' && g && <span className='guess-line'><b className={g.hitHigh ? 'hit' : 'miss'}>↑{name(g.high)}</b> <b className={g.hitLow ? 'hit' : 'miss'}>↓{name(g.low)}</b></span>}
                </div>
                {!p.me && !p.friend && p.userId && <button className={`seat-friend ${phase === 'waiting' || phase === 'results' ? 'show' : ''}`} onClick={(e) => { e.stopPropagation(); askFriend(p) }} disabled={asked.has(p.id)} title={asked.has(p.id) ? 'Asked' : `Add ${p.name} as a friend`}>{asked.has(p.id) ? 'Asked' : '+ Friend'}</button>}
                {lobby.isHost && !p.me && phase === 'waiting' && <button className='btn small ghost' onClick={() => act('kick', p.id)}>Remove</button>}
              </div>
            ]
          })}
        </div>

        <div className='lobby-bottom'>
          {rating && (
            <>
              <div className={`rating-input ${locked ? 'locked' : ''} ${text ? '' : 'empty'} ${chatting ? 'away' : ''}`} role='status' aria-label={predicting ? 'Your prediction' : 'Your rating'} style={{ color: r !== null ? ratingColor(r) : undefined }}>{text || '0.0'}</div>
              <div className='rate-help'>
                <span className='prompt'>{predicting ? <>What will <b>{name(c.seat)}</b> give it?</> : style === 'hotseat' ? 'You’re in the hot seat. Rate it honestly.' : style === 'hive' ? 'Rate the word you were given. You don’t know who chose it, or why.' : 'Your rating'}</span>
                {chatting ? <span className='warn'>Your keys are going to the chat. <Kbd>Esc</Kbd> to rate.</span> : locked ? <span>Locked in. <Kbd>Backspace</Kbd> to change it.</span> : r !== null ? <span><Kbd>Enter</Kbd> to lock in <b>{text}</b></span> : <span>Type a number out of 5</span>}
                <span>Waiting on {[...waiting].map(name).join(', ') || 'nobody'}</span>
              </div>
            </>
          )}
          {phase === 'rating' && !rating && c && <span className='rate-help'>{style === 'hive' ? 'Nobody chose a word for you to rate this time.' : 'Next word, you’re in.'} Waiting on {[...waiting].map(name).join(', ')}.</span>}
          {phase === 'guessing' && (
            <div className='rate-help'>
              {iMustAct
                ? <><span className='prompt'>{guess.high === null ? <>Who went <b>highest</b>? Click a seat or press its number.</> : guess.low === null ? <>And who went <b>lowest</b>?</> : <><Kbd>Enter</Kbd> to lock in: highest {name(guess.high)}, lowest {name(guess.low)}</>}</span><span>{guess.high !== null && <button className='btn small ghost' onClick={() => setGuess({ high: null, low: null })}>Start over</button>} {guess.high && guess.low && <button className='btn small primary' onClick={lockGuess}>Lock in my guess</button>}</span></>
                : <><span>Guess locked in. <Kbd>Backspace</Kbd> to change it.</span><span>Waiting on {[...waiting].map(name).join(', ') || 'nobody'}</span></>}
            </div>
          )}
          {phase === 'picking' && <span className='rate-help'>{c.picker === you ? <>Pick a word for <b>{name(c.seat)}</b>: click one, or press <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd>.</> : <>{Name(c.picker)} is picking a word for {name(c.seat)}.</>}</span>}
          {phase === 'choosing' && <div className='rate-help' style={{ textAlign: 'center' }}><span>{waiting.has(you) ? <>Find your word in the panel on the right. <Kbd>↑</Kbd> <Kbd>↓</Kbd> to look, <Kbd>Enter</Kbd> to choose.</> : <>Chosen: <b>{mine.pick}</b>. Pick another to change it.</>}</span><span>Waiting on {[...waiting].map(name).join(', ') || 'nobody'}</span></div>}
          {phase === 'reveal' && (
            <div className='rate-help' style={{ textAlign: 'center' }}>
              <span>{me?.next ? <>Waiting on {list(notReady.map(name))}{lobby.isHost && <> <button className='btn small ghost' onClick={() => act('advance')}>Go on without them</button></>}</> : <><Kbd>Enter</Kbd> when you’re ready for the next word{style === 'classic' ? ', after you’ve talked it over' : ''}</>}</span>
              <span>{nextCount} of {total} ready</span>
            </div>
          )}
          {(phase === 'waiting' || phase === 'results') && (lobby.isHost
            ? <button className='btn primary' onClick={() => act('begin')}>{phase === 'results' ? 'Play again' : lobby.players.length < 2 ? 'Start on your own' : `Start ${styleOf(lobby.options.style).name} with ${lobby.players.length}`}</button>
            : <span className='rate-help'>The host will start {phase === 'results' ? 'the next game' : 'when everyone’s here'}.</span>)}
        </div>
        {phase === 'results' && lobby.summary && (
          <div className='awards'>
            {lobby.summary.awards.map((a, i) => <div key={i} className='award'><span className='em'>{a.emoji}</span><strong>{a.title}{a.word && `: ${a.word}`}</strong><span>{a.detail}</span></div>)}
          </div>
        )}
      </section>

      <aside className='lobby-side'>
        {offers.filter((o) => lobby.players.some((p) => p.id === o.from)).map((o) => (
          <div key={o.from} className='sect friend-offer'>
            <h3>🤝 {o.name} wants to be friends</h3>
            <p className='opt-hint' style={{ margin: '0 0 8px' }}>You’d swap ratings, comments and playlists whenever you’re both online.</p>
            <span><button className='btn small primary' onClick={() => answer(o, true)}>Be friends</button> <button className='btn small ghost' onClick={() => answer(o, false)}>Not now</button></span>
          </div>
        ))}
        {phase === 'choosing' && <HiveFinder mine={mine} name={name} act={act} setPeek={setPeek} waiting={waiting} you={you} />}
        {style === 'hive' && phase === 'reveal' && res?.entries && <HiveRound res={res} name={name} Name={Name} />}
        {details && word && <WordDetails w={word} onClose={() => setDetails(false)} />}
        {lobby.isHost && (phase === 'waiting' || phase === 'results') && (
          <div className='sect'>
            <h3>Mode</h3>
            <div className='style-list compact'>
              {STYLES.map((s) => (
                <button key={s.id} className={`style-card ${lobby.options.style === s.id ? 'on' : ''}`} onClick={() => act('configure', { style: s.id })} aria-pressed={lobby.options.style === s.id}>
                  <span className='em'>{s.emoji}</span><strong>{s.name}</strong>{lobby.options.style === s.id && <small>{s.blurb}</small>}
                </button>
              ))}
            </div>
            <div className='opts' style={{ marginTop: 12 }}>
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
                {lobby.options.timer > 0 && lobby.options.style === 'hive' && <small className='opt-hint'>Finding a word gets {lobby.options.timer * 3}s.</small>}
              </label>
            </div>
          </div>
        )}
        {!lobby.isHost && (phase === 'waiting' || phase === 'results') && (
          <div className='sect'>
            <h3>{styleOf(lobby.options.style).emoji} {styleOf(lobby.options.style).name}</h3>
            <p className='opt-hint' style={{ margin: '0 0 6px' }}>{styleOf(lobby.options.style).blurb}</p>
            <div className='rate-help'><span>{choices.modes.find((m) => m.id === lobby.options.mode)?.name || 'Shuffle'}, {lobby.options.rounds} words, {lobby.options.timer ? `${lobby.options.timer}s timer` : 'no timer'}</span></div>
          </div>
        )}
        {scored && phase !== 'waiting' && (
          <div className='sect'>
            <h3>Scores</h3>
            <div className='scores'>{[...lobby.players].sort((a, b) => b.score - a.score).map((p) => <div key={p.id}><Avatar name={p.name} color={p.color} /><span className={`nm-${p.look?.name || 'plain'}`}>{p.me ? 'You' : p.name}</span><b>{p.score}</b></div>)}</div>
          </div>
        )}
        <div className='sect'>
          <h3>React <span style={{ fontWeight: 400, fontSize: 12 }}>Alt + 1–8</span></h3>
          <div className='reactions'>{[...choices.reactions, ...packEmoji(me?.look?.reactions)].map((e) => <button key={e} onClick={() => act('react', e)} aria-label={`React ${e}`}>{e}</button>)}</div>
        </div>
        <div className='chat' aria-live='polite'>
          {events.filter((e) => e.kind !== 'react').map((e, i) => {
            const p = lobby.players.find((x) => x.id === e.id)
            const who = p ? (p.me ? 'You' : p.name) : (e.name || 'Someone')
            if (e.kind === 'join') return <div key={i} className='sys'>{who} sat down.</div>
            if (e.kind === 'leave') return <div key={i} className='sys'>{who} left.</div>
            if (e.kind === 'back') return <div key={i} className='sys'>{who} reconnected.</div>
            return <div key={i}><b className={`nm-${p?.look?.name || 'plain'}`} style={{ color: p?.color }}>{who}</b> {e.text}</div>
          })}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (chat.trim()) { act('chat', chat); setChat('') } e.currentTarget.querySelector('input')?.blur() }}>
          <input className='field' value={chat} maxLength={140} onChange={(e) => setChat(e.target.value)} placeholder='Say something to the table' onFocus={() => setChatting(true)} onBlur={() => setChatting(false)} onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur() }} />
        </form>
      </aside>
    </div>
  )
}

// The middle of the felt, for every mode and phase.
function Center ({ lobby, c, res, style, phase, mine, you, name, Name, act, setPeek, total, waiting, toast }) {
  const doneCount = total - waiting.size
  if (phase === 'waiting') {
    return (
      <>
        <div className='tsub'>Send this code to the others</div>
        <div className='bigcode' style={{ margin: '8px 0 10px' }}>{lobby.code}</div>
        <button className='btn small' onClick={() => { api('copy', lobby.code); toast({ emoji: '📋', title: 'Copied the code' }) }}>Copy code</button>
        <div className='tsub' style={{ marginTop: 14 }}>{lobby.players.length} of {lobby.max} seats taken. Playing {styleOf(lobby.options.style).name}.</div>
      </>
    )
  }
  if (phase === 'results') return lobby.summary?.scored ? <Podium players={lobby.players} style={style} /> : <TableWords history={lobby.history} />
  if (!c) return null
  if (phase === 'reveal' && res) {
    if (style === 'hotseat') {
      return (
        <>
          <div className='tsub'>{Name(res.seat)} gave “{res.word}”</div>
          <div className='tmean' style={{ color: ratingColor(res.r) }}>{res.r === null ? '–' : formatRating(res.r)}</div>
          <div className='tverdict'>{res.best.length ? `${list(res.best.map(name))} read ${res.seat === you ? 'you' : name(res.seat)} best` : 'No predictions this time'}</div>
          <div className='extremes'>
            {res.reaction && res.picker !== res.seat && <span>{Name(res.picker)} picked a word that got a reaction: +50</span>}
            {res.beaten > 0 && <span>{Name(res.seat)} beat {res.beaten} prediction{res.beaten === 1 ? '' : 's'}: +{res.beaten * 25}</span>}
          </div>
        </>
      )
    }
    if (style === 'hive') {
      const rows = [...res.entries].filter((e) => e.word && e.r !== null).sort((a, b) => a.diff - b.diff)
      const top = rows[0]
      const low = rows.length > 1 ? rows[rows.length - 1] : null
      if (!top) return <div className='tverdict'>Nobody’s word got rated this time</div>
      return (
        <>
          <div className='tsub'>Closest aim: {Name(top.picker)} for {name(top.rater)}</div>
          <div className='tword' style={{ fontSize: wordSize(top.word, 44, 22) }}>{top.word}</div>
          <div className='hive-aim'>aim <b style={{ color: ratingColor(top.target) }}>{formatRating(top.target)}</b> · got <b style={{ color: ratingColor(top.r) }}>{formatRating(top.r)}</b></div>
          {low && <div className='extremes'><span>Furthest: {Name(low.picker)}’s “{low.word}” for {name(low.rater)}, aimed {formatRating(low.target)}, got {formatRating(low.r)}</span></div>}
          <div className='tsub' style={{ marginTop: 6 }}>Every word is in the panel on the right</div>
        </>
      )
    }
    return <Verdict word={res.word} res={res} name={name} style={style} />
  }
  if (style === 'hotseat' && phase === 'picking') {
    const mePicking = c.picker === you
    return (
      <>
        <div className='tsub'>{mePicking ? <>Pick a word for <b>{name(c.seat)}</b></> : <>{Name(c.picker)} is picking a word for {name(c.seat)}</>}</div>
        <div className='choices'>
          {c.choices.map((x, i) => (
            <button key={x.word} className='choice' disabled={!mePicking} onClick={() => act('pick', i)} onMouseEnter={() => setPeek(x)} onFocus={() => setPeek(x)} title={x.info?.senses?.[0]?.def}>
              <span className='ck'>{i + 1}</span><b>{x.word}</b><small>{x.info?.senses?.[0]?.def}</small>
            </button>
          ))}
        </div>
      </>
    )
  }
  if (style === 'hive' && phase === 'choosing') {
    return (
      <>
        <div className='tsub'>Your secret mission</div>
        <div className='mission'>Find a word <b>{name(mine.rater)}</b> will rate</div>
        <div className='tmean' style={{ color: ratingColor(mine.target) }}>{mine.target === null ? '–' : formatRating(mine.target)}</div>
        <div className='tsub' style={{ marginTop: 8 }}>{mine.pick ? <>You chose “{mine.pick}”. {doneCount} of {total} chosen.</> : <>{doneCount} of {total} have chosen</>}</div>
      </>
    )
  }
  if (style === 'hive' && phase === 'rating') {
    return mine.toRate
      ? <><div className='tsub'>A word was chosen for you</div><WordBlock w={mine.toRate.word} info={mine.toRate.info} /><div className='tsub' style={{ marginTop: 10 }}>{doneCount} of {total} rated</div></>
      : <><div className='tsub'>The raters are rating</div><div className='tsub' style={{ marginTop: 10 }}>{doneCount} of {total} done</div></>
  }
  return (
    <>
      {style === 'hotseat' && <div className='tsub seat-sub'>{c.seat === you ? 'You’re in the hot seat' : <>{Name(c.seat)} is in the hot seat</>}</div>}
      <WordBlock w={c.word} info={c.info} />
      <div className='tsub' style={{ marginTop: 12 }}>
        {phase === 'guessing' ? `${doneCount} of ${total} guesses in` : `${doneCount} of ${total} locked in`}
      </div>
    </>
  )
}

// The word on the felt: big, with its pronunciation and first meaning.
function WordBlock ({ w, info }) {
  return (
    <>
      <div className='tword' key={w} style={{ fontSize: wordSize(w, 64, 26) }}>{w}</div>
      <div className='tipa'>
        <button className='say' onClick={() => speak(w)} title='Hear it (Space)' aria-label={`Hear “${w}”`}><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'><path d='M11 5 6 9H3v6h3l5 4z' /><path d='M15.5 8.5a5 5 0 0 1 0 7' /><path d='M18.5 5.5a9 9 0 0 1 0 13' /></svg></button>
        {info?.ipa?.[0] && <span>/{info.ipa[0]}/</span>}
      </div>
      {info?.senses?.[0] && <div className='tdef'><i className='tpos'>{info.senses[0].posName}</i> {info.senses[0].def}</div>}
    </>
  )
}

// Hive mind: finding a word for your rater. Search by spelling or meaning,
// or take one of a few suggestions; Enter (or click) to choose.
function HiveFinder ({ mine, name, act, setPeek, waiting, you }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([])
  const [sel, setSel] = useState(0)
  const [ideas, setIdeas] = useState([])
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  const deal = async () => setIdeas(await Promise.all([0, 1, 2, 3].map(() => api('deal', 'shuffle').then((d) => d.word && ({ word: d.word, def: d.info?.senses?.[0]?.def, info: d.info })))).then((xs) => xs.filter(Boolean)))
  useEffect(() => { deal() }, [])
  useEffect(() => {
    let live = true
    const t = setTimeout(() => api('searchWords', q).then((h) => { if (live) { setHits(h.slice(0, 6)); setSel(0) } }), q.length < 3 ? 0 : 90)
    return () => { live = false; clearTimeout(t) }
  }, [q])
  const shown = q ? hits : ideas
  useEffect(() => { const h = shown[sel]; if (h) api('wordInfo', h.word).then((info) => info && setPeek({ word: h.word, info })) }, [sel, shown]) // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (w) => { act('choose', w); setQ(''); ref.current?.blur() }
  const done = !waiting.has(you)
  return (
    <div className='sect finder'>
      <h3>Find a word for {name(mine.rater)} <span style={{ color: ratingColor(mine.target) }}>{formatRating(mine.target)}</span></h3>
      <div className='finder-top'>
        <input ref={ref} className='field' value={q} onChange={(e) => setQ(e.target.value)} placeholder='Spelling or meaning' spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(shown.length - 1, i + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)) }
            if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); choose(shown[sel].word) }
            if (e.key === 'Escape') e.currentTarget.blur()
          }} />
        {!q && <button className='btn small ghost' onClick={deal}>New ideas</button>}
      </div>
      {!q && <div className='finder-label'>Some ideas</div>}
      <div className='finder-hits'>
        {shown.map((h, i) => (
          <button key={h.word} className={`finder-hit ${i === sel ? 'on' : ''} ${mine.pick === h.word ? 'picked' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => choose(h.word)}>
            <b>{h.word}</b>{mine.pick === h.word && <span className='tag ok'>chosen</span>}<small>{h.def}</small>
          </button>
        ))}
        {q && !hits.length && <span className='rate-help'>Nothing matches. Try describing it.</span>}
      </div>
      <span className='rate-help'>{done ? <>Chosen: <b>{mine.pick}</b>. Pick another to change it.</> : <>The rater won’t know your target, or that it was you.</>}</span>
    </div>
  )
}

// Hive mind reveal: every word that was chosen, closest first.
function HiveRound ({ res, name, Name }) {
  const rows = [...res.entries].filter((e) => e.word).sort((a, b) => (a.diff ?? 9) - (b.diff ?? 9))
  return (
    <div className='sect'>
      <h3>This round</h3>
      <div className='hive-results'>
        {rows.map((e) => (
          <div key={e.picker}>
            <span className='hr-who'>{Name(e.picker)} → {name(e.rater)}</span>
            <span className='hr-word'>{e.word}</span>
            <span className='hr-nums'>aim {formatRating(e.target)}, got <b style={{ color: e.r === null ? undefined : ratingColor(e.r) }}>{e.r === null ? '–' : formatRating(e.r)}</b></span>
            <span className='hr-pts'>{e.points ? `+${e.points}` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Everything about the word on the table: hidden until you ask (D).
function WordDetails ({ w, onClose }) {
  const info = w.info
  if (!info) return null
  return (
    <div className='sect word-details'>
      <h3>{w.word} <button className='btn small ghost' onClick={onClose} aria-label='Hide word details'>Hide</button></h3>
      <div className='wd-say'>
        <button className='btn small ghost' onClick={() => speak(w.word)}>Say it</button>
        {info.ipa?.[0] && <span>/{info.ipa[0]}/</span>}
      </div>
      <ol className='wd-senses'>
        {info.senses.map((s, i) => <li key={i}><i>{s.posName}</i> {s.def}{s.ex?.[0] && <span className='ex'> “{s.ex[0]}”</span>}</li>)}
      </ol>
      {info.synonyms?.length > 0 && <div className='wd-syn'>Similar: {info.synonyms.slice(0, 10).join(', ')}</div>}
    </div>
  )
}

function SeatReactions ({ reactions, playerId }) {
  return reactions.filter((x) => x.id === playerId).map((x) => <span key={x.key} className='reaction'>{x.emoji}</span>)
}

// Classic and High/Low: the average, and who went highest and lowest.
function Verdict ({ word, res, name, style }) {
  const n = Object.keys(res.ratings).length
  let verdict = n < 2 ? 'Just you this time' : res.spread === 0 ? 'Perfect agreement' : res.hive ? 'In sync' : res.spread >= 3 ? 'The table is split' : res.spread >= 1.5 ? 'Some disagreement' : 'Pretty close'
  if (res.hotTake) verdict = `Hot take from ${name(res.hotTake)}`
  if (style === 'highlow' && !res.split && n > 1) verdict = 'Everyone agreed, so no guess could be right'
  const hiR = res.highest.length ? res.ratings[res.highest[0]] : null
  const loR = res.lowest.length ? res.ratings[res.lowest[0]] : null
  return (
    <>
      <div className='tsub'>{word}, on average</div>
      <div className='tmean' style={{ color: ratingColor(res.mean) }}>{res.mean === null ? '–' : formatRating(res.mean)}</div>
      <div className='tverdict'>{verdict}</div>
      {hiR !== null && (
        <div className='extremes one'>
          <span title='Highest'>↑ <b style={{ color: ratingColor(hiR) }}>{formatRating(hiR)}</b>{list(res.highest.map(name))}</span>
          <span title='Lowest'>↓ <b style={{ color: ratingColor(loR) }}>{formatRating(loR)}</b>{list(res.lowest.map(name))}</span>
        </div>
      )}
      {style === 'classic' && hiR !== null && hiR - loR >= 1.5 && <div className='tsub talk'>{res.highest.length === 1 ? name(res.highest[0]) : 'The highs'} and {res.lowest.length === 1 ? name(res.lowest[0]) : 'the lows'}, explain yourselves.</div>}
    </>
  )
}

// Classic results: the words the table loved and hated most.
function TableWords ({ history }) {
  const best = [...history].filter((h) => h.mean !== null && h.mean !== undefined).sort((a, b) => b.mean - a.mean)
  const shown = best.length > 4 ? [...best.slice(0, 2), ...best.slice(-2)] : best
  return (
    <>
      <div className='tsub'>The table’s verdicts</div>
      <div className='table-words'>
        {shown.map((h, i) => (
          <div key={h.word}>
            <span className='tw-word'>{h.word}</span>
            <span className='tw-r' style={{ color: ratingColor(h.mean) }}>{formatRating(h.mean)}</span>
            {i === 0 && <small>favorite</small>}
            {i === shown.length - 1 && shown.length > 1 && <small>least favorite</small>}
          </div>
        ))}
      </div>
    </>
  )
}

function Podium ({ players, style }) {
  const top = [...players].sort((a, b) => b.score - a.score).slice(0, 3)
  const order = [top[1], top[0], top[2]].filter(Boolean)
  const h = { 0: 90, 1: 64, 2: 46 }
  const label = { highlow: 'Best at reading the table', hotseat: 'Knew each other best', hive: 'Best aim' }[style] || 'Top scores'
  return (
    <>
      <div className='tsub'>{label}</div>
      <div className='podium'>
        {order.map((p) => {
          const place = top.indexOf(p)
          return (
            <div key={p.id}>
              <Avatar name={p.name} color={p.color} frame={p.look?.frame} />
              <span style={{ fontWeight: 500, fontSize: 13 }}>{p.me ? 'You' : p.name}</span>
              <i style={{ height: h[place] }}>{p.score}</i>
            </div>
          )
        })}
      </div>
    </>
  )
}
