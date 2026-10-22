import { useEffect, useRef, useState } from 'react'
import { api, useInterval } from './ui.jsx'
import { STANCES } from '../shared/leximon.js'
import { DUEL_TURN_SECS } from '../shared/duel.js'
import { Info, Mon, Projectile, Typed, hitSound, faintSound } from './Battle.jsx'
import { burst, centerOf } from './effects.js'
import { playLevelUp } from './sound.js'
import { LexCard } from './Leximon.jsx'

// Live Leximon duels: make a duel code or type one in, then fight a friend
// turn by turn. Each turn you choose an attack for the Leximon you have out,
// or switch to another; the turn plays out once you've both chosen. The
// rules are in src/shared/duel.js.

const up = (w) => String(w || '').toUpperCase()
const stanceOf = (id) => STANCES.find((s) => s.id === id)
const typeEmoji = (t) => (t ? stanceOf(t)?.emoji : '⚪')
const BEAT_MS = { switch: 1100, brace: 1000, attack: 1500, miss: 1000, faint: 1300, forfeit: 1200, end: 0, start: 900 }

export default function LiveDuels ({ v, toast, settings }) {
  const [duel, setDuel] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(null)
  const [scaled, setScaled] = useState(false)
  useEffect(() => { api('duelState').then(setDuel).catch(() => {}) }, [])
  useEffect(() => window.ww.on.duel((s) => setDuel(s)), [])
  useEffect(() => window.ww.on.duelClosed((reason) => toast({ emoji: '👋', title: 'The duel’s over', text: reason })), [toast])
  const host = async () => {
    setBusy('host')
    try { setDuel(await api('hostDuel', { scaled })) } catch (err) { toast({ error: true, title: 'Couldn’t start a duel', text: err.message }) }
    setBusy(null)
  }
  const join = async (e) => {
    e.preventDefault()
    setBusy('join')
    try { setDuel(await api('joinDuel', code)) } catch (err) { toast({ error: true, title: 'Couldn’t join', text: err.message }) }
    setBusy(null)
  }
  if (duel && duel.phase !== 'waiting') return <LiveBattle d={duel} settings={settings} toast={toast} />
  if (duel) {
    return (
      <div className='dl-wait'>
        <h3>{duel.scaled ? 'Level-scaled duel' : 'Duel'}: send this code to your opponent</h3>
        <div className='bigcode'>{duel.code}</div>
        <div className='dl-row'>
          <button className='btn' onClick={() => { api('copy', duel.code); toast({ emoji: '📋', title: 'Copied the code' }) }}>Copy code</button>
          <button className='btn ghost' onClick={() => api('leaveDuel')}>Cancel</button>
        </div>
        <p className='lede'>{duel.players?.b ? `${duel.players.b.name} is joining…` : 'Waiting for them to type it in, under Leximon → Duels.'}</p>
      </div>
    )
  }
  const noTeam = !v.team.length
  return (
    <>
      <p className='lede'>Duel a friend live. Each turn you both choose: an attack for the Leximon you have out, or a switch to another. Power counts, and so does type: 💗 Charm beats 🗡️ Spite, 🗡️ Spite beats 🛡️ Guard, 🛡️ Guard beats 💗 Charm. Your team learns from {v.duels.perDay} duels a day ({v.duels.perDay - v.duels.today} left today).</p>
      <div className='lobby-entry'>
        <div className='panel'>
          <h3>Start a duel</h3>
          <p>You’ll get a code to send to your opponent.</p>
          <div className='seg dl-mode' role='radiogroup' aria-label='Levels'>
            <button className={!scaled ? 'on' : ''} onClick={() => setScaled(false)} aria-pressed={!scaled}>Real levels</button>
            <button className={scaled ? 'on' : ''} onClick={() => setScaled(true)} aria-pressed={scaled}>Level-scaled</button>
          </div>
          <small className='opt-hint'>{scaled ? 'Every Leximon fights as tier I, level 25: only rarity, type and your choices count.' : 'Training counts: the stronger team hits harder.'}</small>
          <button className='btn primary' onClick={host} disabled={noTeam || Boolean(busy)}>{noTeam ? 'Build a team first' : busy === 'host' ? 'Opening…' : 'Make a duel code'}</button>
        </div>
        <form className='panel' onSubmit={join}>
          <h3>Join a duel</h3>
          <p>Type the code your opponent sent you.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className='field' value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder='Duel code' maxLength={14} spellCheck={false} style={{ fontSize: 18, letterSpacing: 1.5 }} />
            <button className='btn primary' disabled={noTeam || Boolean(busy) || code.replace(/[^0-9A-Z]/gi, '').length !== 10}>{busy === 'join' ? 'Finding…' : 'Join'}</button>
          </div>
        </form>
      </div>
      {v.team.length > 0 && <div className='dl-team'><h3>Your team</h3><div>{v.team.map((c) => <LexCard key={c.word} c={c} size='sm' />)}</div></div>}
      {v.duels.history.length > 0 && (
        <div className='lx-history'>
          <h3>Recent duels</h3>
          {v.duels.history.map((h, i) => <div key={i}><b className={h.draw ? '' : h.won ? 'up' : 'down'}>{h.draw ? 'Drew' : h.won ? 'Won' : 'Lost'}{h.score ? ` ${h.score}` : ''}</b> against {h.name}{h.scaled ? ' (level-scaled)' : ''} · {h.mine.join(', ')} vs {h.theirs.join(', ')} <small>{new Date(h.at).toLocaleDateString()}</small></div>)}
        </div>
      )}
    </>
  )
}

// What's on screen during a duel: the Leximon out and their HP, played
// forward one event at a time as turns come in.
const snapshot = (st) => ({
  active: { a: st.sides.a.active, b: st.sides.b.active },
  hp: { a: st.sides.a.team.map((c) => c.hp), b: st.sides.b.team.map((c) => c.hp) }
})

function LiveBattle ({ d, settings, toast }) {
  const me = d.you
  const foe = me === 'a' ? 'b' : 'a'
  const st = d.state
  const foeName = d.players[foe]?.name || 'They'
  const [shown, setShown] = useState(() => (st ? snapshot(st) : null))
  const [queue, setQueue] = useState([])
  const [text, setText] = useState(() => `${foeName} wants to duel!`)
  const [anim, setAnim] = useState(null)
  const [fainted, setFainted] = useState({})
  const seenTurns = useRef(d.log.filter((x) => x.t === 'turn').length)
  const field = useRef(null)
  const calm = typeof document !== 'undefined' && document.documentElement.classList.contains('calm')
  const [, tick] = useState(0)
  useInterval(() => tick((x) => x + 1), d.phase === 'fighting' ? 500 : 0)
  const turnStart = useRef(Date.now() + (d.endsIn ?? 0))
  useEffect(() => { turnStart.current = Date.now() + (d.endsIn ?? 0) }, [st?.turn, st?.need]) // eslint-disable-line react-hooks/exhaustive-deps

  // New turns: queue their events.
  useEffect(() => {
    const turns = d.log.filter((x) => x.t === 'turn')
    if (turns.length > seenTurns.current) {
      const fresh = turns.slice(seenTurns.current).flatMap((x) => x.events)
      seenTurns.current = turns.length
      setQueue((q) => [...q, ...fresh])
    }
    if (!shown && st) setShown(snapshot(st))
  }, [d]) // eslint-disable-line react-hooks/exhaustive-deps

  // Play the queue, one event at a time. A turn that's arrived but not yet
  // queued counts as playing too, so the HP shown never jumps ahead of the
  // attack that causes it.
  const unseen = d.log.filter((x) => x.t === 'turn').length > seenTurns.current
  const busy = queue.length > 0 || unseen
  useEffect(() => {
    if (!queue.length || !shown) return
    const e = queue[0]
    const k = Math.random()
    const name = (side, word) => `${side === me ? '' : `${foeName}’s `}${up(word)}`
    let hpTimer
    if (e.t === 'switch') {
      setShown((s) => ({ ...s, active: { ...s.active, [e.side]: e.to } }))
      setFainted((f) => ({ ...f, [e.side]: false }))
      setText(e.side === me ? `Go! ${up(e.word)}!` : `${foeName} sent out ${up(e.word)}!`)
      setAnim({ kind: 'send', side: e.side === me ? 'me' : 'foe', k })
    } else if (e.t === 'brace') {
      setText(e.failed ? `${name(e.side, e.word)} tried to brace again, but couldn’t!` : `${name(e.side, e.word)} braced itself!`)
      setAnim(null)
    } else if (e.t === 'miss') {
      setText(`${name(e.side, e.word)} used ${e.move}! It missed!`)
      setAnim(null)
    } else if (e.t === 'attack') {
      const to = e.side === 'a' ? 'b' : 'a'
      const extra = `${e.crit ? ' A critical hit!' : ''}${e.edge > 1 ? ' It’s super effective!' : e.edge < 1 ? ' It’s not very effective…' : ''}${e.braced ? ' (Braced!)' : ''}`
      setText(`${name(e.side, e.word)} used ${e.move}!${extra}`)
      setAnim({ kind: 'attack', from: e.side === me ? 'me' : 'foe', to: to === me ? 'me' : 'foe', stance: e.type || 'guard', k })
      hpTimer = setTimeout(() => {
        setShown((s) => ({ ...s, hp: { ...s.hp, [to]: s.hp[to].map((h, i) => (i === s.active[to] ? e.hp : h)) } }))
        hitSound(settings)
      }, calm ? 100 : 800)
    } else if (e.t === 'faint') {
      setText(`${name(e.side, e.word)} fainted!`)
      setFainted((f) => ({ ...f, [e.side]: true }))
      setAnim({ kind: 'faint', side: e.side === me ? 'me' : 'foe', k })
      faintSound(settings)
    } else if (e.t === 'forfeit') {
      setText(e.side === me ? 'You left the duel.' : `${foeName} left the duel.`)
    } else if (e.t === 'end') {
      setText(e.winner === null ? 'It’s a draw!' : e.winner === me ? `You defeated ${foeName}!` : `${foeName} won. Good fight!`)
      setAnim(null)
      if (e.winner === me) setTimeout(() => { const at = centerOf(field.current); burst(at.x, at.y, 'confetti'); playLevelUp(settings) }, 200)
    }
    const ms = calm ? Math.min(700, BEAT_MS[e.t] ?? 900) : BEAT_MS[e.t] ?? 900
    const next = setTimeout(() => setQueue((q) => q.slice(1)), ms)
    return () => { clearTimeout(next); clearTimeout(hpTimer) }
  }, [queue[0]]) // eslint-disable-line react-hooks/exhaustive-deps

  // When nothing's playing, what's shown is the duel as it stands.
  useEffect(() => {
    if (busy || !st) return
    setShown(snapshot(st))
    setFainted({ a: st.sides.a.team[st.sides.a.active].hp <= 0, b: st.sides.b.team[st.sides.b.active].hp <= 0 })
    if (d.phase === 'fighting') {
      const mustAct = d.waiting.includes(me)
      setText(st.need === 'replace' ? (mustAct ? 'Who will you send out next?' : `${foeName} is choosing who to send out…`) : mustAct ? `What will ${up(st.sides[me].team[st.sides[me].active].word)} do?` : `Waiting for ${foeName}…`)
    }
  }, [busy, st?.turn, d.waiting.join(), d.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!st || !shown) return <div className='dl-wait'><h3>Getting ready…</h3></div>
  const card = (side) => {
    const c = st.sides[side].team[shown.active[side]]
    return c ? { ...c, hp: shown.hp[side][shown.active[side]] } : null
  }
  const mine = card(me)
  const theirs = card(foe)
  const live = d.phase === 'fighting' && !busy
  const mustAct = live && d.waiting.includes(me)
  const replacing = st.need === 'replace'
  const left = Math.max(0, Math.ceil((turnStart.current - Date.now()) / 1000))
  const act = (action) => api('duelAction', action).catch((err) => toast({ error: true, title: 'Can’t do that', text: err.message }))
  const cls = (side) => ['bt-mon', side, anim?.kind === 'send' && anim.side === side ? 'sent' : '', anim?.kind === 'attack' && anim.from === side ? `lunge-${side}` : '', anim?.kind === 'attack' && anim.to === side ? 'hit' : '', fainted[side === 'me' ? me : foe] ? 'fainted' : ''].join(' ')
  const bench = st.sides[me].team.map((c, i) => ({ ...c, i, hp: shown.hp[me][i] }))
  return (
    <div className='dl-live'>
      <div className='battle dl-battle'>
        <div className='bt-field' ref={field}>
          <div className='bt-arena' aria-hidden='true'><i className='bt-felt' /></div>
          {theirs && <Info card={theirs} hp={theirs.hp} side='foe' />}
          {mine && <Info card={mine} hp={mine.hp} side='me' />}
          {theirs && <Mon card={theirs} className={cls('foe')} key={`f${theirs.word}`} front />}
          {mine && <Mon card={mine} className={cls('me')} key={`m${mine.word}`} />}
          {anim?.kind === 'attack' && !calm && <Projectile key={anim.k} from={anim.from} stance={anim.stance} />}
          <div className='bt-tally foe' aria-hidden='true'>{st.sides[foe].team.map((c, i) => <i key={i} className={shown.hp[foe][i] <= 0 ? 'out' : ''} />)}</div>
          <div className='bt-tally me' aria-hidden='true'>{st.sides[me].team.map((c, i) => <i key={i} className={shown.hp[me][i] <= 0 ? 'out' : ''} />)}</div>
          {d.scaled && <span className='dl-tag'>Level-scaled</span>}
          {d.phase === 'fighting' && !busy && <span className='dl-timer'>{left}s</span>}
        </div>
        <div className='bt-text'>
          <Typed key={text} text={text} />
          {d.phase === 'over' && !busy && (
            <div className='bt-end'>
              <small>{st.winner === null ? 'Nobody won this one.' : st.winner === me ? `You won with ${st.sides[me].team.filter((c) => c.hp > 0).length} left standing.` : 'Train up and try again.'}</small>
              <button className='btn primary' onClick={() => api('leaveDuel')}>Done</button>
            </div>
          )}
        </div>
      </div>
      <div className='dl-panel'>
        {mustAct && !replacing && (
          <>
            <h3>Attack</h3>
            <div className='dl-moves'>
              {mine.moves.map((m, i) => (
                <button key={m.id} className={`dl-move t-${m.type || 'none'}`} onClick={() => act({ kind: 'move', i })}>
                  <b>{typeEmoji(m.type)} {m.name}</b>
                  <small>{m.brace ? 'Goes first, halves damage this turn' : `${m.type ? stanceOf(m.type).name : 'No type'} · ${m.power} power · ${Math.round(m.acc * 100)}%`}</small>
                </button>
              ))}
            </div>
          </>
        )}
        {mustAct && (
          <>
            <h3>{replacing ? 'Send out' : 'Switch'}</h3>
            <div className='dl-bench'>
              {bench.filter((c) => c.i !== st.sides[me].active || replacing).map((c) => (
                <button key={c.i} className='dl-swap' disabled={c.hp <= 0 || (c.i === st.sides[me].active)} onClick={() => act({ kind: 'switch', to: c.i })}>
                  <b>{up(c.word)}</b><small>Lv{c.level} · {stanceOf(c.stance)?.emoji} · {c.hp > 0 ? `${c.hp} HP` : 'fainted'}</small>
                </button>
              ))}
            </div>
          </>
        )}
        {live && !mustAct && <p className='dl-note'>Chosen. Waiting for {foeName}…</p>}
        {d.phase === 'fighting' && <button className='btn ghost small dl-leave' onClick={() => api('leaveDuel')}>Leave (forfeits)</button>}
        {!live && d.phase === 'fighting' && <p className='dl-note'>…</p>}
        <p className='dl-help'>{DUEL_TURN_SECS} seconds a turn; a turn not chosen in time is a Strike.</p>
      </div>
    </div>
  )
}
