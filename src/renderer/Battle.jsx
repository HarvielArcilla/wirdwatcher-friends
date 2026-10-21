import { useEffect, useMemo, useRef, useState } from 'react'
import { rarityName } from '../shared/leximon.js'
import { battleScript } from '../shared/battle.js'
import { burst, centerOf } from './effects.js'
import { playLevelUp } from './sound.js'
import { roman, LexCard } from './Leximon.jsx'

const up = (w) => String(w || '').toUpperCase()

// A duel, played out like a classic monster battle: the other team at the
// top, yours at the bottom, HP bars, a text box, and attacks with their own
// animations. Who wins each bout was settled by the duel itself (the same
// on both computers); this only acts it out, the same way every time.

const BEAT_MS = { say: 1050, clear: 200, send: 1100, attack: 1650, faint: 1300, end: 0 }

export default function Battle ({ res, foe, settings, onClose }) {
  const beats = useMemo(() => battleScript(res, foe), [res, foe])
  const [i, setI] = useState(0)
  const [state, setState] = useState({ me: null, foe: null, hp: { me: 100, foe: 100 }, text: '', anim: null, fainted: {} })
  const field = useRef(null)
  const calm = typeof document !== 'undefined' && document.documentElement.classList.contains('calm')
  const beat = beats[i]
  const done = beat?.t === 'end'

  // Play each beat, then wait before the next.
  useEffect(() => {
    if (!beat) return
    const k = Math.random()
    setState((s) => {
      if (beat.t === 'clear') return { ...s, me: s.fainted.me ? null : s.me, foe: s.fainted.foe ? null : s.foe, fainted: {}, anim: null }
      if (beat.t === 'send') return { ...s, [beat.side]: beat.card, hp: { ...s.hp, [beat.side]: 100 }, text: beat.text, anim: { kind: 'send', side: beat.side, k } }
      if (beat.t === 'attack') return { ...s, text: beat.text, anim: { kind: 'attack', from: beat.from, to: beat.to, stance: beat.stance, k } }
      if (beat.t === 'faint') return { ...s, text: beat.text, fainted: { ...s.fainted, [beat.side]: true }, anim: { kind: 'faint', side: beat.side, k } }
      if (beat.t === 'say') return { ...s, text: beat.text, anim: null }
      if (beat.t === 'end') return { ...s, text: res.won ? `You defeated ${foe}! ${res.wins}–${res.losses}` : `${foe} won ${res.losses}–${res.wins}. Good fight!`, anim: null }
      return s
    })
    // HP drops when the hit lands, partway into the attack.
    let hpTimer
    if (beat.t === 'attack') {
      hpTimer = setTimeout(() => { setState((s) => ({ ...s, hp: beat.hp })); hitSound(settings) }, calm ? 100 : 850)
    }
    if (beat.t === 'faint') faintSound(settings)
    if (beat.t === 'end' && res.won) {
      setTimeout(() => { const at = centerOf(field.current); burst(at.x, at.y, 'confetti'); playLevelUp(settings) }, 200)
    }
    const ms = calm ? Math.min(700, BEAT_MS[beat.t]) : BEAT_MS[beat.t]
    const next = beat.t === 'end' ? null : setTimeout(() => setI((n) => n + 1), ms)
    return () => { clearTimeout(next); clearTimeout(hpTimer) }
  }, [i]) // eslint-disable-line react-hooks/exhaustive-deps

  // Click, Space or Enter hurries it along; Escape skips to the end.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); if (done) onClose(); else skip() }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (done) onClose(); else setI((n) => Math.min(beats.length - 1, n + 1)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  const skip = () => {
    // Jump to the end with the last bout's state.
    let s = { me: null, foe: null, hp: { me: 100, foe: 100 }, fainted: {} }
    for (const b of beats) {
      if (b.t === 'send') { s[b.side] = b.card; s.hp[b.side] = 100 }
      if (b.t === 'attack') s.hp = { ...b.hp }
      if (b.t === 'faint') s.fainted = { ...s.fainted, [b.side]: true }
      if (b.t === 'clear') s.fainted = {}
    }
    setState((x) => ({ ...x, ...s, anim: null }))
    setI(beats.length - 1)
  }

  const a = state.anim
  const cls = (side) => [
    'bt-mon', side,
    a?.kind === 'send' && a.side === side ? 'sent' : '',
    a?.kind === 'attack' && a.from === side ? `lunge-${side}` : '',
    a?.kind === 'attack' && a.to === side ? 'hit' : '',
    state.fainted[side] ? 'fainted' : ''
  ].join(' ')
  return (
    <div className='battle-wrap' role='dialog' aria-label={`Duel with ${foe}`}>
      <div className='battle'>
        <div className='bt-field' ref={field} onClick={() => (done ? null : setI((n) => Math.min(beats.length - 1, n + 1)))}>
          <div className='bt-arena' aria-hidden='true'><i className='bt-felt' /></div>
          {state.foe && <Info card={state.foe} hp={state.hp.foe} side='foe' />}
          {state.me && <Info card={state.me} hp={state.hp.me} side='me' />}
          {state.foe && <Mon card={state.foe} className={cls('foe')} key={`f${state.foe.word}`} front />}
          {state.me && <Mon card={state.me} className={cls('me')} key={`m${state.me.word}`} />}
          {a?.kind === 'attack' && !calm && <Projectile key={a.k} from={a.from} stance={a.stance} />}
          <Tally res={res} beats={beats} i={i} />
        </div>
        <div className='bt-text' onClick={() => (done ? onClose() : setI((n) => Math.min(beats.length - 1, n + 1)))}>
          <Typed key={`${i}${state.text}`} text={state.text} />
          {!done && <span className='bt-more' aria-hidden='true'>▼</span>}
          {done && (
            <div className='bt-end'>
              <small>{res.ups?.length ? `${res.ups.map((u) => `${up(u.word)} grew to level ${u.level}`).join(' · ')}. ` : 'Your team learned from the fight. '}{res.left} duel{res.left === 1 ? '' : 's'} left today.</small>
              <button className='btn primary' onClick={onClose}>Done</button>
            </div>
          )}
        </div>
        {!done && <button className='bt-skip' onClick={skip}>Skip ⏭</button>}
      </div>
    </div>
  )
}

// Bouts won so far, as little marks like party balls.
function Tally ({ res, beats, i }) {
  const faints = beats.slice(0, i + 1).filter((b) => b.t === 'faint' || (b.t === 'say' && /no one left/.test(b.text)))
  const meLost = faints.filter((b) => b.side === 'me' || (b.t === 'say' && b.text.startsWith('You have'))).length
  const foeLost = faints.length - meLost
  const total = res.bouts.length
  const dots = (lost) => Array.from({ length: total }, (_, k) => <i key={k} className={k < lost ? 'out' : ''} />)
  return (
    <>
      <div className='bt-tally foe' aria-hidden='true'>{dots(foeLost)}</div>
      <div className='bt-tally me' aria-hidden='true'>{dots(meLost)}</div>
    </>
  )
}

export function Info ({ card, hp, side }) {
  const color = hp > 50 ? 'ok' : hp > 20 ? 'mid' : 'low'
  return (
    <div className={`bt-info ${side}`}>
      <div className='bt-name'><b>{up(card.word)}</b><span>Lv{card.level}</span></div>
      <div className='bt-sub'><span className={`side-${card.rarity?.side || 'none'} rt-${card.rarity?.tier || 0} bt-rar`}>{rarityName(card.rarity || { tier: 0 })}</span><span>{side === 'me' ? 'Yours' : 'Theirs'} · tier {roman(card.tier || 1)}</span></div>
      <div className='bt-hp'><small>HP</small><span className='bt-hpbar'><i className={color} style={{ width: `${hp}%` }} /></span></div>
      {side === 'me' && <div className='bt-hpnum'>{hp}/100</div>}
    </div>
  )
}

// A fighter is its Leximon card, tier frame, foil and all, standing on its
// mat. The other side's faces you; yours is nearer and bigger.
export function Mon ({ card, className, front }) {
  return (
    <div className={className}>
      <div className='bt-card'><LexCard c={card} size={front ? 'md' : 'lg'} /></div>
      <div className='bt-shadow' aria-hidden='true' />
    </div>
  )
}

// What flies across: hearts for Charm, slashes for Spite, a shockwave for Guard.
export function Projectile ({ from, stance }) {
  if (stance === 'spite') return <div className={`bt-slash at-${from === 'me' ? 'foe' : 'me'}`} aria-hidden='true'><i /><i /><i /></div>
  if (stance === 'guard') return <div className={`bt-wave from-${from}`} aria-hidden='true' />
  return <div className={`bt-hearts from-${from}`} aria-hidden='true'>{[0, 1, 2, 3, 4].map((k) => <i key={k} style={{ animationDelay: `${300 + k * 70}ms`, '--dy': `${(k - 2) * 14}px` }}>💗</i>)}</div>
}

// The text box writes itself out, like the old games.
export function Typed ({ text }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!text) return
    const id = setInterval(() => setN((x) => { if (x >= text.length) { clearInterval(id); return x } return x + 1 }), 22)
    return () => clearInterval(id)
  }, [text])
  return <p className='bt-line'>{text.slice(0, n)}<span className='bt-ghost'>{text.slice(n)}</span></p>
}

// Little sounds, at the app's volume.
let ctx = null
function tone (settings, freqs, dur, type = 'square', gain = 0.08) {
  try {
    if (!settings || settings.ratingSound === 'off' || !settings.soundVolume) return
    ctx = ctx || new AudioContext()
    const t0 = ctx.currentTime
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain * (settings.soundVolume / 100), t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    g.connect(ctx.destination)
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freqs[0], t0)
    o.frequency.exponentialRampToValueAtTime(freqs[1], t0 + dur)
    o.connect(g)
    o.start(t0)
    o.stop(t0 + dur + 0.02)
  } catch {}
}
export const hitSound = (s) => tone(s, [220, 70], 0.18, 'square', 0.1)
export const faintSound = (s) => tone(s, [520, 110], 0.7, 'triangle', 0.09)
