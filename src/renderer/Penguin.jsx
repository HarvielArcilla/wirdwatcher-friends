import { useEffect, useMemo, useState } from 'react'
import { api, Coins } from './ui.jsx'
import { formatCoins } from '../shared/economy.js'
import { PC_LEVELS, PC_MIN_STAKE, pcMult } from '../shared/penguin.js'
import { playPenguin } from './sound.js'
import { StakePicker } from './Tables.jsx'

// Penguin Cross: a penguin hops across a chain of iceberg islands, one per
// letter of a hidden word. Each island it lands on safely shows its letter
// and raises the multiplier. Cash out any time; an island that crumbles
// takes the lot. Rules in src/shared/penguin.js.

const HOP_MS = 420 // one jump
const CRACK_MS = 280 // the ice shudders before it goes
const SINK_MS = 900 // the shards and the penguin go under
const signed = (n) => `${n >= 0 ? '+' : '−'}${formatCoins(Math.abs(n))}`

// The scene, in SVG units: each column is W wide (the near shelf, one per
// island, then the far shore); the sea starts at SEA and the waterline,
// where islands sit, is at WL.
const W = 100
const H = 270
const SEA = 96
const WL = 182
const TOP = 160 // where the penguin stands on an island

// A small fixed jitter, so each island has its own shape every time.
const jit = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) }

function islandShape (i) {
  const cx = (i + 1.5) * W
  const rx = 38 + jit(i, 1) * 6
  // The top face: an uneven oval of points.
  const top = Array.from({ length: 12 }, (_, k) => {
    const a = (k / 12) * Math.PI * 2
    const r = 1 + (jit(i, k + 2) - 0.5) * 0.18
    return [cx + Math.cos(a) * rx * r, TOP + 2 + Math.sin(a) * 11 * r]
  })
  // The cliff: from the front half of the top face down past the waterline.
  const front = top.filter(([, y]) => y >= TOP + 1).sort((a, b) => a[0] - b[0])
  const left = cx - rx * 1.02
  const right = cx + rx * 1.02
  const cliff = [[left, TOP + 2], ...front, [right, TOP + 2], [right - 3, WL + 4], [cx + rx * 0.4, WL + 9], [cx - rx * 0.5, WL + 7], [left + 3, WL + 4]]
  const under = [[left + 3, WL + 4], [right - 3, WL + 4], [cx + rx * 0.75, WL + 44 + jit(i, 30) * 10], [cx - rx * 0.1, WL + 58], [cx - rx * 0.8, WL + 40]]
  // Three shards for crumbling, split along jagged lines.
  const s1 = cx - rx * 0.33 + (jit(i, 40) - 0.5) * 8
  const s2 = cx + rx * 0.33 + (jit(i, 41) - 0.5) * 8
  const cut = (x, k) => [[x + (jit(i, k) - 0.5) * 10, TOP - 20], [x - 4, TOP], [x + 5, TOP + 8], [x - 3, WL - 2], [x + 4, WL + 20], [x, H]]
  const c1 = cut(s1, 50)
  const c2 = cut(s2, 60)
  const shards = [
    [[cx - 80, TOP - 20], ...c1, [cx - 80, H]],
    [...c1, ...[...c2].reverse()],
    [...c2, [cx + 80, H], [cx + 80, TOP - 20]]
  ]
  const pts = (p) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return { cx, rx, top: pts(top), cliff: pts(cliff), under: pts(under), shards: shards.map(pts) }
}

function PenguinFigure () {
  return (
    <g className='pc-penguin'>
      <ellipse cx='0' cy='1' rx='16' ry='3.5' fill='rgba(10,40,70,.22)' />
      <ellipse className='pc-foot' cx='-6' cy='0' rx='6.5' ry='2.6' fill='#f59e2b' />
      <ellipse className='pc-foot' cx='6' cy='0' rx='6.5' ry='2.6' fill='#f59e2b' />
      <ellipse cx='0' cy='-23' rx='15' ry='22' fill='#1d2433' />
      <ellipse cx='3' cy='-20' rx='10' ry='16.5' fill='#f8f7f1' />
      <g transform='translate(-9 -35)'>
        <path className='pc-flip' d='M-3 -1 C-10 4 -12 17 -8 27 C-4 24 2 12 3 1 C1 -2 -1 -2 -3 -1 Z' fill='#121722' />
      </g>
      <circle cx='2' cy='-44' r='11.5' fill='#1d2433' />
      <ellipse cx='6.5' cy='-43' rx='6' ry='6.5' fill='#fff' />
      <circle cx='8.5' cy='-45' r='2' fill='#151515' />
      <circle cx='9.2' cy='-45.8' r='.7' fill='#fff' />
      <path d='M12 -44 L22 -40.5 L12 -37.5 Z' fill='#f59e2b' />
      <ellipse cx='5' cy='-37' rx='2.4' ry='1.3' fill='#ff9eb0' opacity='.7' />
    </g>
  )
}

export default function Penguin ({ coins, hold, toast, settings }) {
  const [g, setG] = useState(null)
  const [stats, setStats] = useState(null)
  const [stake, setStake] = useState('100')
  const [level, setLevel] = useState(() => { try { const l = localStorage.getItem('pc-level'); return PC_LEVELS[l] ? l : 'medium' } catch { return 'medium' } })
  const [busy, setBusy] = useState(false)
  const [fall, setFall] = useState(null) // { i, stage: 'land' | 'crack' | 'sink' }: an island giving way
  const [jumps, setJumps] = useState(0) // replays the jump animation
  useEffect(() => { api('tables').then((t) => { setG(t.pc); setStats(t.penguin) }).catch(() => {}) }, [])
  useEffect(() => { try { localStorage.setItem('pc-level', level) } catch {} }, [level])
  const sound = (kind) => playPenguin(kind, settings)

  const act = async (action, ...args) => {
    try {
      const res = await api('tablesAction', action, ...args)
      setStats(res.tables.penguin)
      return res.out
    } catch (err) { toast({ error: true, title: 'Can’t do that', text: err.message }); return null }
  }
  const n = Math.floor(Number(stake) || 0)
  const live = g && !g.done
  const lanes = g?.lanes || 6
  const lv = g ? g.level : level
  const islands = useMemo(() => Array.from({ length: lanes }, (_, i) => islandShape(i)), [lanes])

  const start = async () => {
    hold(400)
    const o = await act('pcStart', n, level)
    if (o) { setFall(null); setG(o) }
  }
  const hop = async () => {
    if (busy || !live) return
    setBusy(true)
    hold(HOP_MS + CRACK_MS + SINK_MS + 300)
    const o = await act('pcHop')
    if (!o) { setBusy(false); hold(0); return }
    sound('hop')
    setJumps((j) => j + 1)
    if (o.hit !== null) {
      // It lands, the ice shudders, and down it all goes.
      setFall({ i: o.hit, stage: 'land' })
      setTimeout(() => { setFall({ i: o.hit, stage: 'crack' }); sound('crack') }, HOP_MS)
      setTimeout(() => { setFall({ i: o.hit, stage: 'sink' }); sound('splash') }, HOP_MS + CRACK_MS)
      setTimeout(() => {
        setG(o); setBusy(false)
        toast({ emoji: '🧊', title: `Island ${o.hit + 1} gave way: it was ${o.word.toUpperCase()}`, text: `${signed(-o.stake)}.` })
      }, HOP_MS + CRACK_MS + SINK_MS)
      return
    }
    setG(o)
    setTimeout(() => {
      setBusy(false)
      if (o.crossed) {
        sound('home')
        toast({ emoji: '🐧', title: `Across ${o.word.toUpperCase()}!`, text: `×${pcMult(o.level, o.lanes)}: ${formatCoins(o.paid)} back, ${signed(o.paid - o.stake)}.` })
      } else { sound('land'); hold(0) }
    }, HOP_MS)
  }
  const cash = async () => {
    if (busy) return
    const o = await act('pcCash')
    if (!o) return
    sound('cash')
    setG(o)
    toast({ emoji: '💰', title: `Cashed out at ×${pcMult(o.level, o.at)}: ${formatCoins(o.paid)}`, text: `${signed(o.paid - o.stake)}. The word was ${o.word.toUpperCase()}.` })
  }

  // Keyboard: → or Space hops, Enter cashes out.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || !live) return
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); hop() } else if (e.key === 'Enter' && g.at >= 1) { e.preventDefault(); cash() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const at = g ? g.at : 0
  const gone = fall ? fall.i : g?.done && g.hit !== null ? g.hit : null // the island that crumbled
  // Columns: 0 the near shelf; island i is column i + 1; lanes + 1 the far shore.
  const col = fall ? fall.i + 1 : g?.crossed ? lanes + 1 : at
  const sunk = (fall && fall.stage === 'sink') || (!fall && gone !== null)
  const mults = g?.mults || Array.from({ length: lanes }, (_, i) => pcMult(lv, i + 1))
  const nextMult = live && at < lanes ? mults[at] : null
  const width = (lanes + 2) * W
  const px = (col + 0.5) * W
  const py = col === 0 || col === lanes + 1 ? TOP - 6 : TOP
  const word = g?.letters || []
  return (
    <div className='pc-game'>
      <div className='pc-sign' aria-label={g?.done ? `The word: ${g.word}` : 'The hidden word, a letter for each island crossed'}>
        <span className='pc-tiles'>{Array.from({ length: lanes }, (_, i) => <b key={i} className={word[i] ? 'open' : ''}>{word[i] || ''}</b>)}</span>
        {g?.clue && <span className='pc-clue'>{g.clue}</span>}
      </div>
      <div className={`pc-scene ${lv}`}>
        <svg viewBox={`0 0 ${width} ${H}`} role='img' aria-label={live ? `The penguin is on ${at ? `island ${at}` : 'the shelf'}, ${lanes - at} islands to go` : 'Iceberg islands across the sea'}>
          <defs>
            <linearGradient id='pc-sky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stopColor='#9fd3ef' /><stop offset='1' stopColor='#e6f5fb' /></linearGradient>
            <linearGradient id='pc-sea' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stopColor='#3d9cc8' /><stop offset='1' stopColor='#0f4d78' /></linearGradient>
            <linearGradient id='pc-ice' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stopColor='#ffffff' /><stop offset='1' stopColor='#dcf1fb' /></linearGradient>
            <linearGradient id='pc-cliff' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stopColor='#c4e6f6' /><stop offset='1' stopColor='#7fc4e3' /></linearGradient>
            {islands.map((s, i) => s.shards.map((p, k) => <clipPath key={`${i}-${k}`} id={`pc-shard-${i}-${k}`}><polygon points={p} /></clipPath>))}
          </defs>
          <rect width={width} height={SEA} fill='url(#pc-sky)' />
          <circle cx={width - 70} cy='34' r='16' fill='#fff7d1' opacity='.9' />
          <path d={`M0 ${SEA} L${width * 0.12} ${SEA - 22} L${width * 0.2} ${SEA - 9} L${width * 0.3} ${SEA - 30} L${width * 0.4} ${SEA} Z M${width * 0.55} ${SEA} L${width * 0.66} ${SEA - 16} L${width * 0.74} ${SEA - 6} L${width * 0.85} ${SEA - 25} L${width * 0.97} ${SEA} Z`} fill='#d3ecf7' />
          <rect y={SEA} width={width} height={H - SEA} fill='url(#pc-sea)' />
          <g className='pc-waves far' opacity='.35'>{[0, 1].map((k) => <path key={k} d={wave(width + 200, SEA + 14 + k * 26, 7, 60)} />)}</g>

          {/* The near ice shelf and the far shore. */}
          <polygon points={`0,${TOP - 8} ${W * 0.9},${TOP - 10} ${W * 1.02},${TOP - 2} ${W * 0.98},${WL + 8} 0,${WL + 10}`} fill='url(#pc-cliff)' />
          <polygon points={`0,${TOP - 14} ${W * 0.86},${TOP - 16} ${W * 0.98},${TOP - 8} 0,${TOP - 4}`} fill='url(#pc-ice)' />
          <g transform={`translate(${width - W} 0)`}>
            <polygon points={`${W * 0.02},${TOP - 2} ${W * 0.12},${TOP - 10} ${W},${TOP - 8} ${W},${WL + 10} ${W * 0.04},${WL + 8}`} fill='url(#pc-cliff)' />
            <polygon points={`${W * 0.04},${TOP - 8} ${W * 0.14},${TOP - 16} ${W},${TOP - 14} ${W},${TOP - 4}`} fill='url(#pc-ice)' />
            <path d={`M${W * 0.5} ${TOP - 12} a 26 24 0 0 1 52 0 Z`} fill='#f4fbff' stroke='#b9dcec' strokeWidth='1.5' />
            <path d={`M${W * 0.5 + 18} ${TOP - 12} a 8 9 0 0 1 16 0 Z`} fill='#5d8fa8' />
            <line x1={W * 0.36} y1={TOP - 12} x2={W * 0.36} y2={TOP - 58} stroke='#6b4a23' strokeWidth='2.5' />
            <path d={`M${W * 0.36} ${TOP - 58} l22 7 l-22 7 Z`} fill={g?.crossed ? '#f2b84b' : '#e8665a'} className={g?.crossed ? 'pc-flag won' : 'pc-flag'} />
          </g>

          {islands.map((s, i) => {
            const state = gone === i ? (fall ? fall.stage : 'sink') : ''
            const shards = s.shards.map((_, k) => (
              <g key={k} className={`pc-shard s${k}`} clipPath={`url(#pc-shard-${i}-${k})`}>
                <polygon points={s.under} fill='#9fd6ec' opacity='.55' />
                <polygon points={s.cliff} fill='url(#pc-cliff)' />
                <polygon points={s.top} fill='url(#pc-ice)' />
              </g>
            ))
            return (
              <g key={i} className={`pc-isle ${i < at ? 'safe' : ''} ${state}`} style={{ '--d': `${(jit(i, 9) * 2.4).toFixed(2)}s` }}>
                <g className='pc-bob'>
                  {shards}
                  {word[i] && gone !== i && <text x={s.cx} y={TOP + 8} className='pc-letter'>{word[i]}</text>}
                </g>
                <g className='pc-tag' transform={`translate(${s.cx} 70)`}>
                  <rect x='-27' y='-12' width='54' height='22' rx='11' />
                  <text y='4'>×{mults[i]}</text>
                </g>
                {state === 'sink' && (
                  <g className='pc-splash' transform={`translate(${s.cx} ${WL})`}>
                    <ellipse rx='20' ry='5' /><ellipse rx='20' ry='5' className='b' />
                    {[-14, -6, 4, 12].map((x, k) => <circle key={k} cx={x} cy='0' r='3' className={`drop d${k}`} />)}
                  </g>
                )}
              </g>
            )
          })}

          {g && !(sunk && !fall) && (
            <g className='pc-mover' style={{ transform: `translate(${px}px, ${py}px)`, transitionDuration: `${HOP_MS}ms` }}>
              <g className={`pc-bob ${col > 0 && col <= lanes ? '' : 'still'}`} style={{ '--d': col > 0 && col <= lanes ? `${(jit(col - 1, 9) * 2.4).toFixed(2)}s` : '0s' }}>
                <g key={jumps} className={`pc-jumper ${jumps ? 'jump' : ''} ${sunk ? 'sink' : ''} ${g.crossed ? 'home' : ''}`} style={{ animationDuration: `${HOP_MS}ms` }}>
                  <PenguinFigure />
                </g>
              </g>
            </g>
          )}

          {/* The water in front, so what's below the waterline is under it. */}
          <rect y={WL} width={width} height={H - WL} fill='#155f8f' opacity='.42' />
          <g className='pc-waves near' opacity='.5'>{[0, 1, 2].map((k) => <path key={k} d={wave(width + 200, WL + 2 + k * 28, 5 + k, 46 + k * 12)} />)}</g>
        </svg>
      </div>
      <div className='pc-controls'>
        {live
          ? (
            <div className='tb-actions'>
              <span className='tb-total'>Stake <Coins n={g.stake} /> · {PC_LEVELS[g.level].name}</span>
              <button className='btn' onClick={cash} disabled={busy || at < 1}>{g.cashNow ? <>Cash out <Coins n={g.cashNow} /></> : 'Cash out'}</button>
              <button className='btn primary' onClick={hop} disabled={busy}>Hop{nextMult ? ` to ×${nextMult}` : ''}</button>
            </div>
            )
          : (
            <>
              <div className='seg pc-levels' role='radiogroup' aria-label='How thin the ice is'>
                {Object.entries(PC_LEVELS).map(([id, l]) => <button key={id} className={level === id ? 'on' : ''} aria-pressed={level === id} onClick={() => { setLevel(id); if (g?.done) { setG(null); setFall(null) } }}>{l.name} <small>{Math.round((1 - l.safe) * 100)}% crumble</small></button>)}
              </div>
              <div className='tb-actions'>
                <StakePicker stake={stake} setStake={setStake} coins={coins} min={PC_MIN_STAKE} />
                <button className='btn primary' onClick={start} disabled={!(n >= PC_MIN_STAKE) || n > coins}>{g ? 'Go again' : 'Set off'}</button>
              </div>
            </>
            )}
        <p className='lede pc-help'>{live ? 'Each island the penguin lands on shows a letter of the hidden word and raises the multiplier. Cash out whenever you like; an island that crumbles takes the lot. Reach the far shore to spell the word and take the top multiplier. (→ hop, Enter cash out)' : 'Help a penguin across a chain of iceberg islands, one for each letter of a hidden word. Every island crossed pays more, from your stake. No house edge: whenever you stop, it pays back what you put in, on average.'}</p>
        {stats && <p className='tb-stats'>{stats.runs || 0} trip{stats.runs === 1 ? '' : 's'} · {stats.crossed || 0} all the way · <span className={stats.net >= 0 ? 'up' : 'down'}>{signed(stats.net)}</span></p>}
      </div>
    </div>
  )
}

// A wavy line across the sea, drawn wider than the scene so it can drift.
function wave (width, y, amp, len) {
  let d = `M-200 ${y}`
  for (let x = -200; x < width; x += len) d += ` q ${len / 4} ${-amp} ${len / 2} 0 t ${len / 2} 0`
  return d
}
