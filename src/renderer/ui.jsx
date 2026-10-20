import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { formatRating } from '../shared/progress.js'
import { formatCoins } from '../shared/economy.js'
import { playLevelUp } from './sound.js'
import { burst } from './effects.js'

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

// A face: the first letter on the person's color, in their frame (a shop
// cosmetic) if they wear one.
export function Avatar ({ name, color, size, frame, children }) {
  const face = <span className='avatar' style={{ background: color, ...(size ? { width: size, height: size } : {}) }}>{(name || '?').trim()[0]?.toUpperCase()}{children}</span>
  if (!frame || frame === 'none') return face
  return <span className={`framed frame-${frame}`}>{face}<i className='frame-art' aria-hidden='true' /></span>
}

// A coin amount, with the coin.
export function Coins ({ n, className = '' }) {
  return <span className={`coins ${className}`}><CoinArt size='0.95em' side='plain' className='coin-glyph' />{formatCoins(n)}</span>
}

// The coin, drawn: a milled rim, a raised ring, and a face. Heads carries
// the ww monogram, tails a five-point star (a 5.0). `skin` is a coin from the
// shop.
export const SKINS = {
  gold: ['#fff4c2', '#f2c23e', '#b07a12', '#7a5208'],
  silver: ['#ffffff', '#cfd4dc', '#7c8591', '#3c434d'],
  bronze: ['#f6d2a6', '#c47f3d', '#7a4416', '#4a260a'],
  rose: ['#ffe7e3', '#e9a9a2', '#a65f5c', '#6b3030'],
  obsidian: ['#9a7ae8', '#2c2340', '#0c0a12', '#cbb8ff'],
  rainbow: ['#fff', '#f4c542', '#6b4ad6', '#ffffff'],
  emerald: ['#d8ffe6', '#3fbf74', '#1a6b3f', '#0c3a20'],
  sapphire: ['#dfeaff', '#4a7ee8', '#1c3a8a', '#0c1c4a'],
  ruby: ['#ffe0e4', '#e0405a', '#8a1426', '#4a0812'],
  pearl: ['#ffffff', '#eae6f0', '#b8b0c8', '#6a6080'],
  pixel: ['#fff4c2', '#f2c23e', '#b07a12', '#5a3a00'],
  ink: ['#e8eaf6', '#3a3f6b', '#141632', '#e8eaf6'],
  platinum: ['#ffffff', '#e4e7ec', '#9aa3b0', '#4a5260']
}
let coinIds = 0
// thick: draw the milled edge under the face, so a coin at rest looks like a
// solid disc (off for the flipping coin, which draws its own edge in 3D).
export function CoinArt ({ skin = 'gold', side = 'heads', size = 40, className = '', thick = true }) {
  const [hi, mid, lo, ink] = SKINS[skin] || SKINS.gold
  const id = useRef(null)
  if (!id.current) id.current = `cg${++coinIds}`
  const g = id.current
  const rainbow = skin === 'rainbow'
  return (
    <svg className={className} width={size} height={size} viewBox='0 0 100 100' aria-hidden='true' style={{ flex: 'none', display: 'inline-block', verticalAlign: '-0.12em' }}>
      <defs>
        <radialGradient id={`${g}f`} cx='35%' cy='28%' r='80%'>
          <stop offset='0' stopColor={hi} /><stop offset='.5' stopColor={mid} /><stop offset='1' stopColor={lo} />
        </radialGradient>
        {rainbow && (
          <linearGradient id={`${g}r`} x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0' stopColor='#ff6b6b' /><stop offset='.25' stopColor='#f4c542' /><stop offset='.5' stopColor='#6bd68a' /><stop offset='.75' stopColor='#4ab1f0' /><stop offset='1' stopColor='#a66bd8' />
          </linearGradient>
        )}
      </defs>
      {thick && <>
        <circle cx='50' cy='53.5' r='46' fill={lo} />
        <circle cx='50' cy='53.5' r='45' fill='none' stroke={ink} strokeWidth='2.2' strokeDasharray='1.4 2' opacity='.35' />
      </>}
      <g transform={thick ? 'translate(2 0.5) scale(.96)' : undefined}>
      <circle cx='50' cy='50' r='48' fill={rainbow ? `url(#${g}r)` : `url(#${g}f)`} />
      <circle cx='50' cy='50' r='45' fill='none' stroke={lo} strokeWidth='4' strokeDasharray='2 2.2' opacity='.55' />
      <circle cx='50' cy='50' r='38' fill='none' stroke={rainbow ? '#fff' : hi} strokeWidth='2.5' opacity='.7' />
      <circle cx='50' cy='50' r='35.5' fill='none' stroke={lo} strokeWidth='1.5' opacity='.5' />
      {side === 'plain'
        ? <circle cx='50' cy='50' r='24' fill={lo} opacity='.28' />
        : side === 'heads'
        ? <text x='50' y='51' textAnchor='middle' dominantBaseline='central' fontFamily='Fredoka, system-ui, sans-serif' fontWeight='700' fontSize='34' fill={ink} opacity='.9' style={{ letterSpacing: '-1px' }}>ww</text>
        : <path d='M50 24 L57.6 41.2 L76 42.8 L62 55 L66.2 73 L50 63.4 L33.8 73 L38 55 L24 42.8 L42.4 41.2 Z' fill={ink} opacity='.85' />}
      <ellipse cx='36' cy='26' rx='16' ry='7' fill='#fff' opacity={skin === 'obsidian' || skin === 'ink' ? 0.12 : 0.28} transform='rotate(-25 36 26)' />
      </g>
    </svg>
  )
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

// Saying a word: with the voice chosen in Settings, or the best English
// voice on this computer. Left to itself the system can pick a low-quality
// or novelty voice, which mispronounces far more.
let voiceName = ''
export function setVoice (name) { voiceName = name || '' }
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|pipe organ|fred|junior|ralph|kathy|princess|grandma|grandpa|rocko|shelley|eddy|flo|reed|sandy)\b/i
export function englishVoices () {
  try { return (window.speechSynthesis?.getVoices() || []).filter((v) => /^en([-_]|$)/i.test(v.lang)) } catch { return [] }
}
export function voiceScore (v) {
  let s = 0
  if (/(premium|enhanced|natural|neural)/i.test(v.name)) s += 6
  if (/^(samantha|ava|allison|evan|zoe|nathan|alex|daniel|karen|moira|serena|aria|jenny|guy|zira|david|mark)\b/i.test(v.name.replace(/^microsoft /i, ''))) s += 3
  if (/en[-_]us/i.test(v.lang)) s += 2
  else if (/en[-_](gb|au|ca|ie|nz)/i.test(v.lang)) s += 1
  if (v.localService) s += 1
  if (NOVELTY.test(v.name)) s -= 20
  return s
}
export function bestVoice () {
  const all = englishVoices()
  return all.find((v) => v.name === voiceName) || [...all].sort((a, b) => voiceScore(b) - voiceScore(a))[0] || null
}
export function speak (word) {
  try {
    if (!window.speechSynthesis) return false
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(word)
    const v = bestVoice()
    if (v) u.voice = v
    u.lang = v?.lang || 'en-US'
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
    if (t.levelUp) { setLevel({ ...t.levelUp, reward: t.reward || null, key: Math.random() }); return }
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
      {level && <LevelUp key={level.key} level={level} onDone={() => setLevel(null)} />}
    </ToastCtx.Provider>
  )
}

// Shows what a rating earned: level-ups, badges, finished chains and lists.
export function celebrate (toast, earned) {
  if (!earned) return
  if (earned.levelUp) toast({ levelUp: earned.level, reward: earned.reward })
  for (const n of earned.notes || []) toast({ ...n, ms: 6000 })
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
  chevron: I(<path d='m6 9 6 6 6-6' />),
  house: I(<><path d='M3 10.5 12 3l9 7.5' /><path d='M5 9.5V21h14V9.5' /><path d='M9.5 21v-6h5v6' /><path d='M16 5.5V3h2.5v4.6' /></>),
  shop: I(<><path d='M5 8h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9Z' /><path d='M9 10V6.5a3 3 0 0 1 6 0V10' /></>),
  market: I(<><path d='M3 17l5-6 4 4 8-9' /><path d='M15 6h5v5' /></>),
  leximon: I(<><rect x='3.5' y='5' width='11' height='15' rx='2' transform='rotate(-8 9 12.5)' /><rect x='9.5' y='4' width='11' height='15' rx='2' /><path d='M15 9.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3Z' /></>),
  casino: I(<><rect x='3' y='5' width='18' height='14' rx='3' /><path d='M8 9v6M12 9v6M16 9v6' /></>),
  daily: I(<><rect x='3.5' y='5' width='17' height='15' rx='2.5' /><path d='M8 3v4M16 3v4M3.5 10h17' /><path d='m9 14.5 2 2 4-4' /></>)
}

// Leveling up: the screen dims, rays turn behind the new number, it counts
// up, and the rewards land one after another. Click anywhere (or wait) to go
// on; it never takes the keyboard.
let levelSettings = null
export function setLevelUpSettings (s) { levelSettings = s; setVoice(s?.voice) }
function LevelUp ({ level, onDone }) {
  const [shown, setShown] = useState(Math.max(1, level.level - 1))
  useEffect(() => {
    playLevelUp(levelSettings)
    const t1 = setTimeout(() => setShown(level.level), 450)
    const t2 = setTimeout(() => burst(window.innerWidth / 2, window.innerHeight / 2 - 40, 'confetti'), 500)
    const t3 = setTimeout(onDone, level.reward?.items?.length || level.reward?.packs ? 6500 : 4800)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const r = level.reward
  return (
    <div className='levelup-v2' onClick={onDone} role='status' aria-live='assertive'>
      <div className='lv-card'>
        <div className='lv-rays' aria-hidden='true' />
        <div className='lv-kicker'>Level up</div>
        <div className='lv-num' key={shown}>{shown}</div>
        <div className='lv-title'>{level.level % 5 === 0 ? <>New title: {level.title}</> : 5 - (level.level % 5) === 1 ? 'A new title next level' : `Next title in ${5 - (level.level % 5)} levels`}</div>
        {r && (
          <div className='lv-rewards'>
            {r.coins > 0 && <div className='lv-reward' style={{ animationDelay: '.9s' }}><Coins n={r.coins} /><small>coins</small></div>}
            {r.packs > 0 && <div className='lv-reward item' style={{ animationDelay: '1.05s' }}><b>🃏 {r.packs === 1 ? 'A free card pack' : `${r.packs} free card packs`}</b><small>waiting in the casino</small></div>}
            {r.items.map((it, i) => <div key={it.id} className='lv-reward item' style={{ animationDelay: `${1.2 + i * 0.25}s` }}><b>🎁 {it.name}</b><small>new {String(it.kindName || it.kind).toLowerCase().replace(/s$/, '')}, in the shop</small></div>)}
          </div>
        )}
        <div className='lv-hint'>Click to continue</div>
      </div>
    </div>
  )
}