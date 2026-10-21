import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { typeRating, ratingValue, nudge, formatRating } from '../shared/progress.js'
import { playRating, playTable } from './sound.js'
import { burst, centerOf, fxFor, burstFor } from './effects.js'
import { api, Avatar, Kbd, ratingColor, useToast, useInterval, wordSize, speak } from './ui.jsx'
import { titleText, packEmoji } from '../shared/cosmetics.js'
import { WildWord } from './Leximon.jsx'

// Lobbies. Before you're in one: host or join. In one: a round table with a
// seat per player and a card on the felt in front of each seat. What happens
// on the table depends on the mode; see src/core/lobby.js.

export const STYLES = [
  { id: 'classic', name: 'Classic', emoji: '☕', blurb: 'Everyone rates the same word, then the table flips. No points: see who went highest and lowest and talk it out.' },
  { id: 'highlow', name: 'High/Low', emoji: '↕️', blurb: 'Rate, then guess who went highest and who went lowest before anything is shown. 100 points for each right guess.' },
  { id: 'hotseat', name: 'Hot seat', emoji: '🔥', blurb: 'One player is in the seat; the next picks a word for them from three. Everyone predicts the seat’s rating.' },
  { id: 'hive', name: 'Hive mind', emoji: '🐝', blurb: 'You get a secret target and a rater. Find a word you think they’ll rate near your target.' },
  { id: 'jury', name: 'Grand Jury', emoji: '⚖️', blurb: 'One of you is secretly on trial for a rating you really gave. Vote on who did it, then argue about it. 3 or more players.' },
  { id: 'clues', name: 'Clues', emoji: '🧩', blurb: 'Guess a hidden word from its blanks and what the table rated it. Clues keep coming, and every clue and wrong guess costs points.' }
]
const coins = (n) => (n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}K` : String(n))
const cluePoints = (clue, wrong) => Math.max(10, 100 - 12 * clue - 10 * wrong)
const styleOf = (id) => STYLES.find((s) => s.id === id) || STYLES[0]

export default function Lobby ({ lobby, choices, me, active, events, settings, wild, clearWild }) {
  if (!lobby) return <Entry />
  return <Table lobby={lobby} choices={choices} active={active} events={events} settings={settings} wild={wild} clearWild={clearWild} />
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

function Table ({ lobby, choices, active, events, settings, wild, clearWild }) {
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
  const [clueText, setClueText] = useState('')
  const [tab, setTab] = useState('game') // the sidebar: the game, or chat and reactions
  const [seen, setSeen] = useState(0) // chat lines read
  const [leaving, setLeaving] = useState(false) // asked once before leaving a staked game
  const deadline = useRef(null)
  const chatEl = useRef(null)
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

  // Sounds for what others do, so the game can be heard from another tab.
  const heard = useRef(null)
  useEffect(() => {
    const locked = lobby.players.filter((p) => p.locked && !p.me).length
    const now = { phase, round: lobby.round, locked, mustAct: iMustAct, last: events[events.length - 1] || null }
    const was = heard.current
    heard.current = now
    if (!was) return
    const from = was.last ? events.lastIndexOf(was.last) + 1 : 0
    const fresh = (from > 0 || !was.last ? events.slice(from) : []).filter((e) => e.id !== you)
    for (const e of fresh) {
      if (e.kind === 'join' || e.kind === 'back') playTable('join', settings)
      else if (e.kind === 'leave') playTable('leave', settings)
      else if (e.kind === 'chat') playTable('chat', settings)
      else if (e.kind === 'react') playTable('react', settings)
      else if (e.kind === 'solved') playTable('solved', settings)
    }
    if (phase === 'results' && was.phase !== 'results') playTable('gameover', settings)
    else if (phase === 'reveal' && was.phase !== 'reveal') playTable('reveal', settings)
    else if ((was.phase === 'waiting' || was.phase === 'results') && phase !== was.phase) playTable('start', settings)
    else if (now.mustAct && (!was.mustAct || now.round !== was.round || now.phase !== was.phase)) playTable('turn', settings)
    else if (locked > was.locked && phase === was.phase && now.round === was.round) playTable('card', settings)
  }, [lobby, events]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resets for each phase of each word. The keyboard comes back to the table
  // too: whatever was focused (the chat, a button, a menu) lets go, so typing a
  // number always rates. The hive finder keeps it; it's where you type then.
  useEffect(() => {
    setText(''); setGuess({ high: null, low: null }); setPeek(null); setClueText(''); setLeaving(false)
    const el = document.activeElement
    if (el && el !== document.body && !el.closest?.('.finder') && !el.closest?.('.clue-form')) el.blur?.()
  }, [lobby.round, phase])
  // Perfect plays: confetti from the seat, and a fanfare if it's yours.
  useEffect(() => {
    if (phase !== 'reveal' || !res?.perfect) return
    const ids = Object.keys(res.perfect)
    if (!ids.length) return
    const t = setTimeout(() => {
      for (const id of ids) { const at = centerOf(document.querySelector(`[data-seat="${id}"] .seat-face`)); burst(at.x, at.y, 'confetti') }
      if (ids.includes(you)) playRating(5, settings)
    }, 900)
    return () => clearTimeout(t)
  }, [phase, lobby.round]) // eslint-disable-line react-hooks/exhaustive-deps
  // The end of a game: confetti from the winner's seat and the middle.
  useEffect(() => {
    if (phase !== 'results' || !lobby.summary?.scored) return
    const best = Math.max(...lobby.players.map((p) => p.score))
    if (!(best > 0)) return
    const winners = lobby.players.filter((p) => p.score === best)
    const t = setTimeout(() => {
      for (const w of winners) { const at = centerOf(document.querySelector(`[data-seat="${w.id}"] .seat-face`)); burst(at.x, at.y, 'confetti') }
      const mid = centerOf(document.querySelector('.felt-center'))
      burst(mid.x, mid.y, 'confetti')
      if (winners.some((w) => w.me)) playRating(5, settings)
    }, 1100)
    return () => clearTimeout(t)
  }, [phase, lobby.game]) // eslint-disable-line react-hooks/exhaustive-deps
  // Celebrations at the reveal, from the card that earned them.
  useEffect(() => {
    if (phase !== 'reveal' || !res || style === 'jury' || style === 'clues') return
    const cheers = Object.entries(res.ratings || {}).map(([id, v]) => [id, burstFor(fxFor(v, settings?.animations))]).filter(([, b]) => b && b !== 'sparkle')
    if (!cheers.length) return
    const t = setTimeout(() => cheers.forEach(([id, b]) => { const at = centerOf(document.querySelector(`[data-card="${id}"]`)); burst(at.x, at.y, b) }), 750)
    return () => clearTimeout(t)
  }, [phase, lobby.round]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { deadline.current = c?.endsIn != null ? Date.now() + c.endsIn : null }, [lobby.round, phase, c?.clue]) // eslint-disable-line react-hooks/exhaustive-deps
  useInterval(() => tick((x) => x + 1), deadline.current && phase !== 'reveal' ? 250 : 0)

  // Unread chat: what people said (not joins or reactions) since you last looked.
  const said = events.filter((e) => e.kind === 'chat' && e.id !== you).length
  const unread = tab === 'chat' ? 0 : Math.max(0, said - seen)
  useEffect(() => { if (tab === 'chat') setSeen(said) }, [tab, said])
  // Finding a Hive mind word, and word details, are in the Game tab.
  useEffect(() => { if (phase === 'choosing' || phase === 'results') setTab('game') }, [phase])
  useEffect(() => { if (details) setTab('game') }, [details])
  // Opening the chat shows the newest lines.
  useEffect(() => { if (tab === 'chat' && chatEl.current) chatEl.current.scrollTop = chatEl.current.scrollHeight }, [tab])
  // The chat follows the newest line, unless you've scrolled up to read.
  useEffect(() => {
    const el = chatEl.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight
  }, [events])
  useEffect(() => {
    const last = events[events.length - 1]
    if (last?.kind === 'notice' && Date.now() - (last.at || 0) < 3000) toast({ emoji: 'ℹ️', title: last.text })
    if (last?.kind === 'solved' && last.id === you) playRating(4.6, settings)
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
  const word = peek || (style === 'hive' ? (phase === 'rating' ? mine.toRate : mine.pick ? { word: mine.pick, info: mine.pickInfo } : null) : c?.word ? { word: c.word, info: c.info } : mine.word ? { word: mine.word, info: mine.info } : null)

  // Can I type a rating right now, and is it a prediction?
  const rating = phase === 'rating' && c && c.roster.includes(you) && (style !== 'hive' || mine.toRate)
  const predicting = rating && style === 'hotseat' && c.seat !== you
  const locked = rating && !iMustAct
  const ordered = useMemo(() => {
    const i = lobby.players.findIndex((p) => p.me)
    return [...lobby.players.slice(i), ...lobby.players.slice(0, i)]
  }, [lobby.players])
  const guessable = phase === 'guessing' ? ordered.filter((p) => c.roster.includes(p.id)) : phase === 'voting' ? ordered.filter((p) => c.roster.includes(p.id) && !p.me) : []
  const vote = (id) => { if (phase === 'voting' && c?.roster.includes(you) && id !== you) act('vote', id) }

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
    if ((k === 't' || k === 'T') && phase !== 'clues') { e.preventDefault(); setTab('chat'); setTimeout(() => document.querySelector('.lobby-side form input')?.focus(), 0); return }
    if (k === ' ' && word) { e.preventDefault(); speak(word.word); return }
    if (rating) {
      if (k === 'Enter') { e.preventDefault(); const r = ratingValue(text); if (r !== null && !locked) { act('rate', r); setText(formatRating(r)); if (!predicting) playRating(r, settings) } } else if (k === 'Backspace') { e.preventDefault(); if (locked) act('rate', null); setText('') } else if (/^[0-9.]$/.test(k) && !locked) { e.preventDefault(); setText((t) => typeRating((t.length === 3 ? '' : t) + k)) } else if ((k === 'ArrowUp' || k === 'ArrowDown') && !locked) { e.preventDefault(); setText((t) => formatRating(nudge(ratingValue(t) ?? 2.5, (k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.5 : 0.1)))) }
    } else if (phase === 'guessing') {
      if (/^[1-8]$/.test(k) && guessable[Number(k) - 1]) { e.preventDefault(); pickGuess(guessable[Number(k) - 1].id) } else if (k === 'Enter') { e.preventDefault(); lockGuess() } else if (k === 'Backspace') { e.preventDefault(); if (!iMustAct) act('guess', { high: null, low: null }); setGuess({ high: null, low: null }) }
    } else if (phase === 'voting') {
      if (/^[1-8]$/.test(k) && guessable[Number(k) - 1]) { e.preventDefault(); vote(guessable[Number(k) - 1].id) } else if (k === 'Backspace') { e.preventDefault(); act('vote', null) }
    } else if (phase === 'clues' && !mine.solved && /^[a-z]$/i.test(k) && !e.altKey) {
      // Typing anywhere goes to the guess box.
      e.preventDefault(); setClueText((t) => t + k); document.querySelector('.clue-form input')?.focus()
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
  const pot = lobby.pot
  const potLive = pot && ['collecting', 'open', 'settling'].includes(pot.status) && (pot.status === 'collecting' || pot.members.length > 1)
  const myStakeAtRisk = potLive && pot.status === 'open' && pot.members.includes(you)
  const timerSecs = phase === 'clues' ? (c?.final ? 15 : 10) : lobby.options.timer * (phase === 'choosing' ? 3 : 1)
  // Where the ring starts when it appears (already part-drained if you join late).
  const ringDelay = useMemo(() => -Math.max(0, timerSecs * 1000 - (c?.endsIn ?? timerSecs * 1000)), [lobby.round, phase, c?.clue]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (style === 'jury') {
      // What each person really gave the word before tonight.
      const v = res.past?.[p.id] ?? null
      const pts = res.points[p.id]
      return { v, note: p.id === res.defendant ? (pts ? `free +${pts}` : 'guilty') : pts ? `+${pts}` : v === null ? 'never rated' : 'rated it' }
    }
    if (style === 'clues') {
      const v = res.table[p.id]
      const pts = res.points[p.id]
      return { v: v ?? null, note: pts ? `+${pts}` : v === null || v === undefined ? 'not rated' : 'rated' }
    }
    const v = res.ratings[p.id]
    return v === undefined ? null : { v, note: style === 'highlow' && res.points[p.id] ? `+${res.points[p.id]}` : null }
  }
  // Cards that are face up before the reveal: the table's ratings in Clues.
  const openCard = (p) => {
    if (style === 'clues' && phase === 'clues') { const v = c.table?.[p.id] ?? null; return { v, note: c.solved?.[p.id] ? 'solved ✓' : v === null ? 'not rated' : 'rated' } }
    return null
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
            {lobby.isHost && ['rating', 'guessing', 'picking', 'choosing', 'voting', 'clues'].includes(phase) && <button className='btn small ghost' onClick={() => act('advance')}>{phase === 'clues' ? (c?.final ? 'Reveal now' : 'Next clue') : phase === 'rating' || phase === 'guessing' || phase === 'voting' ? 'Reveal now' : 'Move on'}</button>}
            {lobby.isHost && phase === 'reveal' && <button className='btn small ghost' onClick={() => act('advance')}>Skip waiting</button>}
            {lobby.isHost && c && phase !== 'results' && <button className='btn small ghost' onClick={() => act('backToLobby')}>End game</button>}
            {potLive && <span className='pot-chip' title={`${pot.members.length} players put in ${pot.stake.toLocaleString()} coins each. Highest score takes it.`}><CoinDot /> Pot <b>{pot.status === 'collecting' ? '…' : (pot.stake * pot.members.length).toLocaleString()}</b></span>}
            <button className={`btn small ${leaving ? 'danger' : ''}`} onBlur={() => setLeaving(false)} onClick={() => {
              // Leaving a staked game in progress costs your stake: ask once.
              if (myStakeAtRisk && !leaving) return setLeaving(true)
              api('leaveLobby')
            }}>{leaving ? (lobby.isHost ? 'Close? Every stake goes back' : `Leave and lose ${pot.stake.toLocaleString()}?`) : lobby.isHost ? 'Close lobby' : 'Leave'}</button>
          </span>
        </div>

        <div className={`table felt-${lobby.table || 'classic'}`}>
          {left !== null && phase !== 'reveal' && timerSecs > 0 && (
            <svg className='timer' viewBox='0 0 100 100' preserveAspectRatio='none' aria-hidden='true'>
              {/* Drained by the compositor, not redrawn every tick: smooth however busy the page is. */}
              <ellipse key={`${lobby.round}:${phase}:${c?.clue ?? ''}`} className='timer-ring' cx='50' cy='50' rx='49' ry='49' fill='none' stroke='var(--accent)' strokeWidth='1.2' vectorEffect='non-scaling-stroke' pathLength='100' strokeDasharray='100 100' transform='rotate(-90 50 50)' style={{ animationDuration: `${timerSecs * 1000}ms`, animationDelay: `${ringDelay}ms` }} />
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
            const face = phase === 'reveal' ? cardFor(p) : openCard(p)
            // In hive mind a card is lit by how well its chooser aimed.
            const cardHi = style === 'hive' ? Boolean(face && res?.best?.includes(face.picker)) : null
            const cardLo = style === 'hive' ? Boolean(face && res?.worst?.includes(face.picker)) : null
            const showCard = inRound && phase !== 'waiting' && phase !== 'results' && phase !== 'preparing' && !(style === 'hotseat' && phase === 'picking')
            const hi = res?.highest?.includes(p.id)
            const lo = res?.lowest?.includes(p.id)
            const best = res?.best?.includes(p.id)
            const worst = res?.worst?.includes(p.id)
            const g = res?.guesses?.[p.id]
            const guessIndex = guessable.findIndex((x) => x.id === p.id)
            const clickable = (phase === 'guessing' && iMustAct && guessIndex >= 0) || (phase === 'voting' && guessIndex >= 0 && c.roster.includes(you))
            const myVote = phase === 'voting' && mine.vote === p.id
            const juryVote = style === 'jury' && phase === 'reveal' ? res?.votes?.[p.id] : null
            return [
              showCard && (
                <div key={`c${p.id}`} data-card={p.id} className={`card ${p.locked || phase === 'guessing' ? 'locked' : ''} ${face ? 'flip' : ''} ${face && (cardHi ?? (hi || best)) ? 'card-hi' : ''} ${face && (cardLo ?? (lo || worst)) ? 'card-lo' : ''} ${face && face.v !== null && face.v <= 0.5 && phase === 'reveal' && style !== 'clues' && settings?.animations !== 'off' ? 'crack' : ''} ${style === 'hotseat' && p.id === c.seat ? 'card-seat' : ''}`} style={cardPos} title={face?.title}>
                  <div style={{ transitionDelay: `${i * 90}ms` }}>
                    <div className={`back cb-${p.look?.cardBack || 'stripes'}`}>{p.locked || phase === 'guessing' ? '✓' : ''}</div>
                    <div className='face' style={face && face.v !== null ? { '--rc': ratingColor(face.v) } : undefined}>{face ? (face.v === null ? '–' : formatRating(face.v)) : ''}{face?.note && <small>{face.note}</small>}</div>
                  </div>
                </div>
              ),
              <div key={p.id} data-seat={p.id} className={`seat ${flat ? 'row' : ''} ${p.away ? 'away' : ''} ${clickable ? 'pickable' : ''} ${guess.high === p.id || myVote ? 'g-high' : ''} ${guess.low === p.id ? 'g-low' : ''} ${(style === 'hotseat' && c && p.id === c.seat) || (style === 'jury' && phase === 'reveal' && res?.defendant === p.id) ? 'in-seat' : ''}`} style={pos} onClick={clickable ? () => (phase === 'voting' ? vote(p.id) : pickGuess(p.id)) : undefined} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined} aria-label={clickable ? (phase === 'voting' ? `Vote for ${p.name}` : `Guess ${p.me ? 'yourself' : p.name}`) : undefined}>
                <SeatReactions reactions={reactions} playerId={p.id} />
                {phase === 'reveal' && res?.perfect?.[p.id] && <span className='perfect-pop' aria-live='polite'>💎 {res.perfect[p.id].map((x) => x.label).join(' · ')} <b>+{res.perfect[p.id].reduce((a, x) => a + x.bonus, 0)}</b></span>}
                <span className='seat-face'><Avatar name={p.name} color={p.color} frame={p.look?.frame} /><i className='seat-ring' aria-hidden='true' />{clickable && <span className='seat-key'>{guessIndex + 1}</span>}{(phase === 'waiting' || phase === 'results' ? p.stakeIn : p.inPot) && <span className='seat-coin' title={phase === 'waiting' || phase === 'results' ? 'Bought in' : 'In the pot'}><CoinDot size={18} /></span>}</span>
                <div className='seat-text'>
                  <span className={`sname nm-${p.look?.name || 'plain'}`} title={p.edition ? `Edition ${p.edition + 1}` : undefined}>{p.me ? 'You' : p.name}{p.edition > 0 && <sup className='ed'>✦{p.edition + 1}</sup>}{p.id === lobby.host && <small> host</small>}{p.friend && <small> friend</small>}
                    {!p.me && !p.friend && p.userId && (phase === 'waiting' || phase === 'results') && <button className='seat-act' onClick={(e) => { e.stopPropagation(); askFriend(p) }} disabled={asked.has(p.id)} title={asked.has(p.id) ? 'Asked' : `Add ${p.name} as a friend`} aria-label={asked.has(p.id) ? 'Friend request sent' : `Add ${p.name} as a friend`}>{asked.has(p.id) ? '✓' : <PersonPlus />}</button>}
                    {lobby.isHost && !p.me && phase === 'waiting' && <button className='seat-act kick' onClick={(e) => { e.stopPropagation(); act('kick', p.id) }} title={`Remove ${p.name} from the lobby`} aria-label={`Remove ${p.name}`}>×</button>}
                  </span>
                  <span className='slvl'>
                    {c && phase !== 'results' && p.role ? ({ seat: 'in the hot seat', picker: 'picking', defendant: 'the defendant' })[p.role] : titleText(p.look?.title) || `Level ${p.level}`}
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
                    {myVote && <span className='tag hi'>your vote</span>}
                    {phase === 'clues' && c.solved?.[p.id] && <span className='tag ok'>{c.solved[p.id].first ? 'got it first' : 'got it'}</span>}
                    {phase === 'clues' && !c.solved?.[p.id] && c.wrong?.[p.id] > 0 && <span className='tag'>{c.wrong[p.id]} miss{c.wrong[p.id] === 1 ? '' : 'es'}</span>}
                    {phase === 'reveal' && style === 'jury' && res?.tally?.[p.id] > 0 && <span className={`tag ${p.id === res.defendant ? 'hi' : 'lo'}`}>{res.tally[p.id]} vote{res.tally[p.id] === 1 ? '' : 's'}</span>}
                    {phase === 'reveal' && p.next && <span className='tag ok'>ready</span>}
                  </span>
                  {juryVote && <span className='guess-line'>voted <b className={juryVote === res.defendant ? 'hit' : 'miss'}>{name(juryVote)}</b></span>}
                  {phase === 'reveal' && g && <span className='guess-line'><b className={g.hitHigh ? 'hit' : 'miss'}>↑{name(g.high)}</b> <b className={g.hitLow ? 'hit' : 'miss'}>↓{name(g.low)}</b></span>}
                </div>
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
          {phase === 'voting' && (
            <div className='rate-help' style={{ textAlign: 'center' }}>
              <span className='prompt'>{mine.vote ? <>You voted <b>{name(mine.vote)}</b>. Click another seat to change it.</> : mine.defendant ? <>Vote for someone else to cover your tracks: click a seat or press its number.</> : <>Who gave it {formatRating(c.charge)}? Click a seat or press its number.</>}</span>
              <span>Waiting on {[...waiting].map(name).join(', ') || 'nobody'}</span>
            </div>
          )}
          {phase === 'clues' && c.roster.includes(you) && (
            mine.solved
              ? <div className='rate-help' style={{ textAlign: 'center' }}><span className='prompt'>You got it: <b>{mine.word}</b>, +{mine.points}. Don’t give it away!</span><span>Waiting on {[...waiting].map(name).join(', ') || 'nobody'}</span></div>
              : (
                <form className='clue-form' onSubmit={(e) => { e.preventDefault(); if (clueText.trim()) { act('clueGuess', clueText); setClueText('') } }}>
                  <input className='field' autoFocus value={clueText} maxLength={40} onChange={(e) => setClueText(e.target.value)} placeholder='Type your guess and press Enter' aria-label='Your guess' onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur() }} />
                  <span className='rate-help'><span>Worth <b>{cluePoints(c.clue, mine.wrong)}</b> now{mine.wrong ? `, after ${mine.wrong} miss${mine.wrong === 1 ? '' : 'es'}` : ''}. Each clue costs 12, each miss 10.</span></span>
                </form>
                )
          )}
          {phase === 'buyin' && <span className='rate-help'>Collecting the stakes…</span>}
          {phase === 'preparing' && <span className='rate-help'>{style === 'jury' ? 'The court is choosing a case…' : 'Picking a word most of you have rated…'}</span>}
          {phase === 'rating' && !rating && c && <span className='rate-help'>{style === 'hive' ? 'Nobody chose a word for you to rate this time.' : 'Next word, you’re in.'} Waiting on {[...waiting].map(name).join(', ')}.</span>}
          {phase === 'guessing' && (
            <div className='rate-help'>
              {iMustAct
                ? <><span className='prompt'>{guess.high === null ? <>Who went <b>highest</b>? Click a seat or press its number.</> : guess.low === null ? <>And who went <b>lowest</b>?</> : <><Kbd>Enter</Kbd> to lock in: highest {name(guess.high)}, lowest {name(guess.low)}</>}</span><span>{guess.high !== null && <button className='btn small ghost' onClick={() => setGuess({ high: null, low: null })}>Start over</button>} {guess.high && guess.low && <button className='btn small primary' onClick={lockGuess}>Lock in my guess</button>}</span></>
                : <><span>Guess locked in. <Kbd>Backspace</Kbd> to change it.</span><span>Waiting on {[...waiting].map(name).join(', ') || 'nobody'}</span></>}
            </div>
          )}
          {phase === 'picking' && <div className='rate-help' style={{ textAlign: 'center' }}><span>{c.picker === you ? <>Pick a word for <b>{name(c.seat)}</b>: click one, or press <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd>.</> : <>{Name(c.picker)} is picking a word for {name(c.seat)}.</>}</span></div>}
          {phase === 'choosing' && <div className='rate-help' style={{ textAlign: 'center' }}><span>{waiting.has(you) ? <>Find your word in the panel on the right. <Kbd>↑</Kbd> <Kbd>↓</Kbd> to look, <Kbd>Enter</Kbd> to choose.</> : <>Chosen: <b>{mine.pick}</b>. Pick another to change it.</>}</span><span>Waiting on {[...waiting].map(name).join(', ') || 'nobody'}</span></div>}
          {phase === 'reveal' && (
            <div className='rate-help' style={{ textAlign: 'center' }}>
              {style === 'jury' && res && <JuryTalk res={res} name={name} Name={Name} you={you} />}
              <span>{me?.next ? <>Waiting on {list(notReady.map(name))}{lobby.isHost && <> <button className='btn small ghost' onClick={() => act('advance')}>Go on without them</button></>}</> : <><Kbd>Enter</Kbd> when you’re ready for the next word{style === 'classic' ? ', after you’ve talked it over' : ''}</>}</span>
              <span>{nextCount} of {total} ready</span>
            </div>
          )}
          {(phase === 'waiting' || phase === 'results') && lobby.stake > 0 && (
            me?.stakeIn
              ? <button className='btn buyin in' onClick={() => act('stakeIn', { in: false })} title='Click to play for points only'><CoinDot /> In for {lobby.stake.toLocaleString()}</button>
              : <button className='btn buyin' onClick={() => act('stakeIn', { in: true, amount: lobby.stake })}><CoinDot /> Buy in for {lobby.stake.toLocaleString()}</button>
          )}
          {(phase === 'waiting' || phase === 'results') && (lobby.isHost
            ? (lobby.options.style === 'jury' && lobby.players.length < 3
                ? <span className='rate-help'>Grand Jury needs at least 3 players. Pick another mode, or wait for more.</span>
                : <button className='btn primary' onClick={() => act('begin')}>{phase === 'results' ? 'Play again' : lobby.players.length < 2 ? 'Start on your own' : `Start ${styleOf(lobby.options.style).name} with ${lobby.players.length}`}</button>)
            : <span className='rate-help'>The host will start {phase === 'results' ? 'the next game' : 'when everyone’s here'}.</span>)}
        </div>
      </section>

      <aside className='lobby-side'>
        <div className='side-tabs' role='tablist'>
          <button role='tab' aria-selected={tab === 'game'} className={tab === 'game' ? 'on' : ''} onClick={() => setTab('game')}>Game{offers.some((o) => lobby.players.some((p) => p.id === o.from)) && <i className='dot' />}</button>
          <button role='tab' aria-selected={tab === 'chat'} className={tab === 'chat' ? 'on' : ''} onClick={() => { setTab('chat'); setTimeout(() => document.querySelector('.lobby-side form input')?.focus(), 0) }}>Chat{unread > 0 && <b className='unread'>{unread > 9 ? '9+' : unread}</b>}</button>
        </div>
        {wild && <div className='lobby-wild'><WildWord e={wild} toast={toast} active={active && phase !== 'clues'} onDone={clearWild} /></div>}
        {tab === 'game' && <div className='side-scroll'>
        {offers.filter((o) => lobby.players.some((p) => p.id === o.from)).map((o) => (
          <div key={o.from} className='sect friend-offer'>
            <h3>🤝 {o.name} wants to be friends</h3>
            <p className='opt-hint' style={{ margin: '0 0 8px' }}>You’d swap ratings, comments and playlists whenever you’re both online.</p>
            <span><button className='btn small primary' onClick={() => answer(o, true)}>Be friends</button> <button className='btn small ghost' onClick={() => answer(o, false)}>Not now</button></span>
          </div>
        ))}
        {phase === 'results' && lobby.summary && (
          <div className='sect recap'>
            <h3>Game recap</h3>
            {pot?.status === 'paid' && pot.payouts && <PotResult pot={pot} Name={Name} />}
            {lobby.summary.awards.map((a, i) => <div key={i} className='award' style={{ animationDelay: `${0.15 + i * 0.12}s` }}><span className='em'>{a.emoji}</span><strong>{a.title}{a.word && `: ${a.word}`}</strong><span>{a.detail}</span></div>)}
          </div>
        )}
        {phase === 'results' && lobby.history.length > 0 && <Rounds history={lobby.history} name={name} you={you} open />}
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
              <label>Stakes
                <div className='seg'>{choices.stakes.map((x) => <button key={x} disabled={lobby.options.style === 'classic' && x > 0} className={lobby.options.stake === x && (x === 0 || lobby.options.style !== 'classic') ? 'on' : ''} onClick={() => act('configure', { stake: x })}>{x ? coins(x) : 'None'}</button>)}</div>
                <small className='opt-hint'>{lobby.options.style === 'classic' ? 'Classic has no points, so nothing to stake on.' : lobby.stake ? `Players who buy in put ${lobby.stake.toLocaleString()} coins each in the pot. Highest score takes it; ties split. Leaving mid-game leaves your stake behind.` : 'Players can buy in to a pot of coins. Highest score takes it.'}</small>
              </label>
            </div>
          </div>
        )}
        {!lobby.isHost && (phase === 'waiting' || phase === 'results') && (
          <div className='sect'>
            <h3>{styleOf(lobby.options.style).emoji} {styleOf(lobby.options.style).name}</h3>
            <p className='opt-hint' style={{ margin: '0 0 6px' }}>{styleOf(lobby.options.style).blurb}</p>
            <div className='rate-help'><span>{choices.modes.find((m) => m.id === lobby.options.mode)?.name || 'Shuffle'}, {lobby.options.rounds} words, {lobby.options.timer ? `${lobby.options.timer}s timer` : 'no timer'}{lobby.stake ? `, ${lobby.stake.toLocaleString()} coin stakes` : ''}</span></div>
          </div>
        )}
        {scored && phase !== 'waiting' && (
          <div className='sect'>
            <h3>Scores</h3>
            <div className='scores'>{[...lobby.players].sort((a, b) => b.score - a.score).map((p) => <div key={p.id}><Avatar name={p.name} color={p.color} /><span className={`nm-${p.look?.name || 'plain'}`}>{p.me ? 'You' : p.name}</span><b>{p.score}</b></div>)}</div>
          </div>
        )}
        {phase !== 'results' && phase !== 'waiting' && lobby.history.length > (phase === 'reveal' ? 1 : 0) && <Rounds history={phase === 'reveal' ? lobby.history.slice(0, -1) : lobby.history} name={name} you={you} />}
        </div>}
        {tab === 'chat' && <>
        <div className='sect react-sect'>
          <h3>React <span style={{ fontWeight: 400, fontSize: 12 }}>Alt + 1–8</span></h3>
          <div className='reactions'>{[...choices.reactions, ...packEmoji(me?.look?.reactions)].map((e) => <button key={e} onClick={() => act('react', e)} aria-label={`React ${e}`}>{e}</button>)}</div>
        </div>
        <div className='chat' aria-live='polite' ref={chatEl}>
          {events.filter((e) => e.kind !== 'react').map((e, i) => {
            const p = lobby.players.find((x) => x.id === e.id)
            const who = p ? (p.me ? 'You' : p.name) : (e.name || 'Someone')
            if (e.kind === 'join') return <div key={i} className='sys'>{who} sat down.</div>
            if (e.kind === 'leave') return <div key={i} className='sys'>{who} left.</div>
            if (e.kind === 'back') return <div key={i} className='sys'>{who} reconnected.</div>
            if (e.kind === 'notice') return <div key={i} className='sys'>{e.text}</div>
            if (e.kind === 'guess') return <div key={i} className='sys guess'>{who} guessed “{e.text}”. Not it.</div>
            if (e.kind === 'pot') return <div key={i} className='sys solved'>{list(e.winners.map((w) => Name(w)))} {e.winners.length === 1 ? 'won' : 'split'} the pot: {e.pot.toLocaleString()} coins</div>
            if (e.kind === 'solved') return <div key={i} className='sys solved'>{who} got it{e.first ? ' first' : ''}! +{e.points}</div>
            return <div key={i}><b className={`nm-${p?.look?.name || 'plain'}`} style={{ color: p?.color }}>{who}</b> {e.text}</div>
          })}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (chat.trim()) { act('chat', chat); setChat('') } e.currentTarget.querySelector('input')?.blur() }}>
          <input className='field' value={chat} maxLength={140} onChange={(e) => setChat(e.target.value)} placeholder='Say something to the table' onFocus={() => setChatting(true)} onBlur={() => setChatting(false)} onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur() }} />
        </form>
        </>}
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
  if (phase === 'buyin') {
    return (
      <>
        <div className='tsub'>Buying in</div>
        <div className='prep-dots' aria-hidden='true'><i /><i /><i /></div>
        <div className='tsub'>Each stake is going into the pot…</div>
      </>
    )
  }
  if (!c) return null
  if (phase === 'preparing') {
    return (
      <>
        <div className='tsub'>{style === 'jury' ? 'Order in the court' : 'New word'}</div>
        <div className='prep-dots' aria-hidden='true'><i /><i /><i /></div>
        <div className='tsub'>{style === 'jury' ? 'Choosing a case from someone’s past ratings…' : 'Finding a word most of you have rated…'}</div>
      </>
    )
  }
  if (phase === 'reveal' && res) {
    if (style === 'jury') {
      return (
        <>
          <div className={`jury-stamp ${res.convicted ? 'guilty' : 'free'}`}>{res.convicted ? 'Guilty' : 'Not guilty'}</div>
          <div className='verdict-who'>{Name(res.defendant)} gave “{res.word}”</div>
          <div className='charge'>a <b style={{ color: ratingColor(res.charge) }}>{formatRating(res.charge)}</b></div>
          <div className='tverdict'>{res.convicted ? (res.right.length > 3 ? `${res.right.length} of them saw through it` : `${list(res.right.map(name))} saw through it`) : res.defendant === you ? `You fooled ${res.missed} of them: +${res.points[res.defendant] || 0}` : `${Name(res.defendant)} walked free: +${res.points[res.defendant] || 0}`}</div>
        </>
      )
    }
    if (style === 'clues') {
      const got = Object.entries(res.solved).sort((a, b) => a[1].clue - b[1].clue)
      return (
        <>
          <div className='tsub'>The word was</div>
          <WordBlock w={res.word} info={res.info} compact />
          <div className='tverdict'>{!got.length ? 'Nobody got it' : got.length === total ? 'Everyone got it' : got.length > 3 ? `${got.length} of ${total} got it` : `${list(got.map(([id]) => name(id)))} got it`}</div>
          {got[0] && <div className='extremes'><span>{Name(got[0][0])} first, after {got[0][1].clue} clue{got[0][1].clue === 1 ? '' : 's'}</span></div>}
        </>
      )
    }
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
          {low && <div className='extremes'><span>Furthest: {low.picker === you ? 'Your' : `${Name(low.picker)}’s`} “{low.word}” for {name(low.rater)}, aimed {formatRating(low.target)}, got {formatRating(low.r)}</span></div>}
          <div className='tsub' style={{ marginTop: 6 }}>Every word is in the panel on the right</div>
        </>
      )
    }
    return <Verdict word={res.word} res={res} name={name} style={style} />
  }
  if (style === 'jury') {
    return (
      <>
        {mine.defendant ? <div className='you-did'>You’re on trial</div> : <div className='tsub'>Someone at this table once gave</div>}
        <WordBlock w={c.word} info={c.info} compact />
        <div className='charge'>a <b style={{ color: ratingColor(c.charge) }}>{formatRating(c.charge)}</b></div>
      </>
    )
  }
  if (style === 'clues' && phase === 'clues') {
    const shown = c.clues.filter((x) => x.kind !== 'start' && x.kind !== 'letter')
    const latest = c.clues[c.clues.length - 1]
    return (
      <>
        <div className='tsub'>{mine.solved ? <>You got it: <b>{mine.word}</b></> : `${c.pattern.filter((x) => x === null || /[A-Z]/.test(x)).length} letters`}</div>
        <div className='blanks' aria-label={`The word: ${c.pattern.map((x) => x || 'blank').join(' ')}`}>
          {c.pattern.map((x, i) => (x === ' ' || x === '-' || x === "'" ? <span key={i} className='gap'>{x === ' ' ? '' : x}</span> : <span key={`${i}${x}`} className={`blank ${x ? 'open' : ''} ${latest.kind === 'letter' && latest.at === i ? 'new' : ''}`}>{x || ''}</span>))}
        </div>
        <div className='clue-list'>
          {shown.map((x, i) => (
            <div key={i} className={`clue k-${x.kind} ${x === latest ? 'new' : ''}`}>
              <i>{({ pos: 'kind', def: 'means', syn: 'like', ex: 'as in' })[x.kind]}</i> {x.kind === 'ex' ? `“${x.text}”` : x.text}
            </div>
          ))}
          {!shown.length && <div className='clue'><i>clue 1</i> what the table rated it, on the cards</div>}
        </div>
        <div className='tsub' style={{ marginTop: 6 }}>Clue {c.clue + 1} of {c.clueCount} · {Object.keys(c.solved).length} of {total} solved{c.final ? ' · last chance' : ''}</div>
      </>
    )
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

// After the verdict: a nudge to argue about it.
function JuryTalk ({ res, name, Name, you }) {
  const most = Math.max(0, ...Object.values(res.tally || {}))
  const blamed = Object.keys(res.tally || {}).filter((id) => id !== res.defendant && res.tally[id] === most && most > 0)
  return (
    <span className='prompt'>
      {res.defendant === you ? 'Explain yourself.' : `${Name(res.defendant)}, explain yourself.`}
      {blamed.length === 1 && <> And {`why did ${most === 1 ? 'someone' : `${most} of you`} think it was ${name(blamed[0])}?`}</>}
    </span>
  )
}

// The game so far, a round to a line: the word, what happened, and what it
// meant for you. Open at the end of a game; during one, the latest first.
function Rounds ({ history, name, you, open }) {
  const rows = open ? history : [...history].reverse()
  return (
    <div className='sect rounds'>
      <h3>{open ? 'Round by round' : 'Earlier this game'}</h3>
      <ol>
        {rows.map((h) => {
          const line = roundLine(h, name, you)
          const mine = h.points?.[you]
          return (
            <li key={h.round}>
              <span className='rn'>{h.round}</span>
              <div>
                <b className='rw'>{line.word || '—'}</b>
                <small>{line.text}</small>
                {(h.perfect?.[you] || []).map((x) => <small key={x.label} className='rp'>💎 {x.label}</small>)}
              </div>
              {mine ? <span className='rpts'>+{mine}</span> : line.mine != null ? <span className='rmine' style={{ color: ratingColor(line.mine) }}>{formatRating(line.mine)}</span> : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// One round in words, for each mode.
function roundLine (h, name, you) {
  const r = (x) => (x === null || x === undefined ? '–' : formatRating(x))
  switch (h.style) {
    case 'hotseat': return { word: h.word, text: `${cap(name(h.seat))} gave it ${r(h.r)}${h.best?.length ? `; ${list(h.best.map(name))} read it best` : ''}`, mine: h.predictions?.[you] }
    case 'hive': {
      const best = [...(h.entries || [])].filter((e) => e.diff !== null).sort((a, b) => a.diff - b.diff)[0]
      const mineE = (h.entries || []).find((e) => e.picker === you)
      return { word: mineE?.word || best?.word, text: best ? `Closest: ${name(best.picker)}, aimed ${r(best.target)} and got ${r(best.r)}` : 'No words rated', mine: null }
    }
    case 'jury': return { word: h.word, text: `${cap(name(h.defendant))} gave it ${r(h.charge)} and ${h.convicted ? 'was caught' : 'got away with it'}`, mine: null }
    case 'clues': {
      const got = Object.keys(h.solved || {})
      return { word: h.word, text: got.length ? `${got.length} solved it${h.solved[you] ? `, you after ${h.solved[you].clue} clue${h.solved[you].clue === 1 ? '' : 's'}` : ''}` : 'Nobody got it', mine: null }
    }
    default: return { word: h.word, text: h.mean === null || h.mean === undefined ? 'No ratings' : `Averaged ${r(h.mean)}${h.spread >= 1 ? `, ${h.spread.toFixed(1)} apart` : ''}${h.hive ? ', in sync' : ''}`, mine: h.ratings?.[you] }
  }
}
const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1)

// How the pot went, on the results screen.
function PotResult ({ pot, Name }) {
  const top = Math.max(0, ...Object.values(pot.payouts))
  const winners = Object.keys(pot.payouts).filter((id) => pot.payouts[id] === top && top > 0)
  const total = pot.stake * Object.keys(pot.payouts).length
  return (
    <div className='award pot-award'>
      <span className='em'><CoinDot size={26} /></span>
      <strong>The pot: {total.toLocaleString()} coins</strong>
      <span>{winners.length === 1 ? `${Name(winners[0])} took it all` : winners.length ? `${list(winners.map(Name))} split it` : 'Nobody was left to take it'}{pot.forfeit.length ? `, including ${pot.forfeit.length} stake${pot.forfeit.length === 1 ? '' : 's'} left behind` : ''}.</span>
    </div>
  )
}

function PersonPlus () {
  return <svg viewBox='0 0 24 24' width='13' height='13' fill='none' stroke='currentColor' strokeWidth='2.2' strokeLinecap='round' aria-hidden='true'><circle cx='9' cy='8' r='3.5' /><path d='M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5' /><path d='M19 8v6M16 11h6' /></svg>
}

function CoinDot ({ size = 14 }) { return <i className='coin-dot' style={{ width: size, height: size }} aria-hidden='true' /> }

// The word on the felt: big, with its pronunciation and first meaning.
function WordBlock ({ w, info, compact }) {
  return (
    <>
      <div className='tword' key={w} style={{ fontSize: wordSize(w, compact ? 50 : 64, 24) }}>{w}</div>
      <div className='tipa'>
        <button className='say' onClick={() => speak(w)} title='Hear it (Space)' aria-label={`Hear “${w}”`}><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'><path d='M11 5 6 9H3v6h3l5 4z' /><path d='M15.5 8.5a5 5 0 0 1 0 7' /><path d='M18.5 5.5a9 9 0 0 1 0 13' /></svg></button>
        {info?.ipa?.[0] && <span>/{info.ipa[0]}/</span>}
      </div>
      {info?.senses?.[0] && !compact && <div className='tdef'><i className='tpos'>{info.senses[0].posName}</i> {info.senses[0].def}</div>}
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
  const label = { highlow: 'Best at reading the table', hotseat: 'Knew each other best', hive: 'Best aim', jury: 'Sharpest jury', clues: 'Quickest minds' }[style] || 'Top scores'
  const best = top[0]?.score || 0
  const winners = top.filter((p) => p.score === best && best > 0)
  return (
    <>
      <div className='winner-banner'>{winners.length === 1 ? `🏆 ${winners[0].me ? 'You win!' : `${winners[0].name} wins!`}` : winners.length ? `🏆 A tie at the top` : 'Game over'}</div>
      <div className='tsub'>{label}</div>
      <div className='podium'>
        {order.map((p) => {
          const place = top.indexOf(p)
          return (
            <div key={p.id} style={{ '--d': `${[0.5, 0.2, 0.8][place]}s` }}>
              {p.score === best && best > 0 && <span className='crown' aria-hidden='true'>👑</span>}
              <Avatar name={p.name} color={p.color} frame={p.look?.frame} />
              <span style={{ fontWeight: 500, fontSize: 13 }}>{p.me ? 'You' : p.name}</span>
              <i className='bar' style={{ height: h[place] }}>{p.score}</i>
            </div>
          )
        })}
      </div>
    </>
  )
}
