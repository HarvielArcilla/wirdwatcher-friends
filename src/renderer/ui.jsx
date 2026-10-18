import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { formatRating } from '../shared/progress.js'

export const api = (name, ...args) => window.ww.call(name, ...args)

// The theme's rating scale: 0.0 → bad, 2.5 → mid, 5.0 → good.
export function ratingColor (r) {
  if (r === null || r === undefined) return 'var(--text)'
  const v = Math.max(0, Math.min(5, r))
  if (v <= 2.5) return `color-mix(in oklab, var(--bad) ${Math.round((1 - v / 2.5) * 100)}%, var(--mid))`
  return `color-mix(in oklab, var(--mid) ${Math.round((1 - (v - 2.5) / 2.5) * 100)}%, var(--good))`
}

export function R ({ r, className = 'r' }) {
  return <span className={className} style={{ color: ratingColor(r) }}>{formatRating(r)}</span>
}

export function Avatar ({ name, color, size, children }) {
  return <span className='avatar' style={{ background: color, ...(size ? { width: size, height: size } : {}) }}>{(name || '?').trim()[0]?.toUpperCase()}{children}</span>
}

export function Kbd ({ children }) { return <kbd>{children}</kbd> }

export function Bar ({ done, total }) {
  return <div className='bar'><i style={{ width: `${total ? Math.min(100, (done / total) * 100) : 0}%` }} /></div>
}

export const timeAgo = (t) => {
  if (!t) return ''
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return new Date(t).toLocaleDateString()
}

export const plural = (n, word, many = `${word}s`) => `${n.toLocaleString()} ${n === 1 ? word : many}`

// Size the word to fit: long words get smaller.
// Size the word to fit: long words get smaller. The word-size setting and
// the font's own width (wide fonts set a bit smaller) scale it.
export const wordSize = (word, base = 128, min = 44) => {
  const k = window.__wordScale || 1
  return Math.round(k * Math.max(min, Math.min(base, base * 9 / Math.max(9, word.length))))
}

// Rating sounds live in sound.js.

export function speak (word) {
  try {
    if (!window.speechSynthesis) return false
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(word)
    u.lang = 'en-US'
    u.rate = 0.9
    window.speechSynthesis.speak(u)
    return true
  } catch { return false }
}

// --- toasts ------------------------------------------------------------------
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastHost ({ children }) {
  const [toasts, setToasts] = useState([])
  const [level, setLevel] = useState(null)
  const push = useCallback((t) => {
    if (t.levelUp) { setLevel(t.levelUp); setTimeout(() => setLevel(null), 2700); return }
    const id = Math.random()
    setToasts((all) => [...all.slice(-3), { ...t, id }])
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.ms || 4200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className='toasts' role='status' aria-live='polite'>
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.error ? 'error' : ''}`}>
            {t.emoji && <span className='em'>{t.emoji}</span>}
            <div><strong>{t.title}</strong>{t.text && <span>{t.text}</span>}</div>
          </div>
        ))}
      </div>
      {level && <div className='levelup'><div><b>{level.level}</b><span>Level up. You’re a {level.title}.</span></div></div>}
    </ToastCtx.Provider>
  )
}

// Shows what a rating earned: level-ups, badges, finished chains and lists.
export function celebrate (toast, earned) {
  if (!earned) return
  if (earned.levelUp) toast({ levelUp: earned.level })
  for (const b of earned.badges || []) toast({ emoji: b.emoji, title: `Badge: ${b.name}`, text: b.hint, ms: 5500 })
  if (earned.chainDone) toast({ emoji: '🔗', title: 'Chain complete', text: earned.chainDone.words.join(', ') })
  for (const name of earned.finished || []) toast({ emoji: '🏁', title: `Finished “${name}”`, text: 'Every word in the playlist is rated.' })
}

export function useInterval (fn, ms) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => { if (!ms) return; const t = setInterval(() => ref.current(), ms); return () => clearInterval(t) }, [ms])
}

// --- icons (simple strokes) -----------------------------------------------------
const I = (d) => function Icon () { return <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>{d}</svg> }
export const icons = {
  play: I(<><rect x='3' y='5' width='18' height='14' rx='3' /><path d='M8 12h3m-1.5-1.5v3M15 11h.01M17 13h.01' /></>),
  collection: I(<><path d='M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2Z' /><path d='M4 17a2 2 0 0 1 2-2h12M9 7h5' /></>),
  friends: I(<><circle cx='9' cy='8' r='3.5' /><path d='M2.5 20a6.5 6.5 0 0 1 13 0' /><circle cx='17' cy='9' r='2.5' /><path d='M17.5 14.5A5 5 0 0 1 21.5 19' /></>),
  lobby: I(<><circle cx='12' cy='12' r='4.5' /><circle cx='12' cy='3' r='1.5' /><circle cx='12' cy='21' r='1.5' /><circle cx='3' cy='12' r='1.5' /><circle cx='21' cy='12' r='1.5' /></>),
  settings: I(<><circle cx='12' cy='12' r='3' /><path d='M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z' /></>),
  speaker: I(<><path d='M11 5 6 9H3v6h3l5 4V5Z' /><path d='M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13' /></>),
  heart: I(<path d='M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z' />),
  chevron: I(<path d='m6 9 6 6 6-6' />)
}
