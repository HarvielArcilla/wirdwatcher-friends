import { useCallback, useEffect, useRef, useState } from 'react'
import { api, Coins, HeadArt, useToast, celebrate } from './ui.jsx'
import { newRun, step, restore, serialize, DT, enterRoom, startFloor, spawnFoe, giveItem } from '../shared/wirdlike/engine.js'
import { CHAPTERS, FLOORS, ROOM_W, ROOM_H, NAMED_BOSSES, MIN_RATED } from '../shared/wirdlike/content.js'
import { FOES } from '../shared/wirdlike/foes.js'
import { describe, TRANSFORMS } from '../shared/wirdlike/items.js'
import { drawRun, Fx, eventsToFx, itemBanner, transformBanner, clearRoomCache } from './wirdlike/draw.js'
import { eventSounds, music, stopMusic, setVolume, setMusic, play } from './wirdlike/sfx.js'
import { PadEdges, rumble, usePadMenu } from './wirdlike/pad.js'

// Wirdlike: down through the dictionary, room by room, with nothing but the
// words you've rated. The menu, the game itself (a canvas), the pause
// screen and the note left behind when a run ends.
export default function Wirdlike ({ settings }) {
  const toast = useToast()
  const [v, setV] = useState(null)
  const [screen, setScreen] = useState('menu') // 'menu' | 'game' | 'end'
  const [init, setInit] = useState(null) // { start } | { saved }
  const [ending, setEnding] = useState(null) // { summary, reward }
  const [pick, setPick] = useState(() => { try { return localStorage.getItem('wl-char') || 'wirdo' } catch { return 'wirdo' } })
  const [seed, setSeed] = useState('')
  const load = useCallback(() => api('wirdlike').then(setV).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  useEffect(() => { try { localStorage.setItem('wl-char', pick) } catch {} }, [pick])
  useEffect(() => () => stopMusic(), [])

  const start = async () => {
    try {
      const s = await api('wirdlikeStart', pick, seed)
      for (const l of s.looks || []) toast({ emoji: '✨', title: `New look: ${l.name}`, text: l.kind === 'face' ? 'Wear it from the Shop, under Faces.' : 'It’s in the Shop, ready to wear.' })
      setInit({ start: s })
      setScreen('game')
    } catch (err) { toast({ error: true, title: 'Can’t start a run', text: err.message }) }
  }
  const resume = async () => {
    const saved = await api('wirdlikeResume')
    if (!saved) { load(); return }
    setInit({ saved })
    setScreen('game')
  }
  const finish = async (summary) => {
    stopMusic()
    try {
      const reward = await api('wirdlikeEnd', summary)
      setEnding({ summary, reward })
      celebrate(toast, { badges: reward.badges || [] })
    } catch (err) { setEnding({ summary, reward: null }); toast({ error: true, title: 'Couldn’t save that run', text: err.message }) }
    setScreen('end')
    load()
  }
  const quit = () => { stopMusic(); setScreen('menu'); load() }

  // With a controller: left and right choose who goes down, A starts, Y continues.
  const cycle = (d) => {
    const open = (v?.chars || []).filter((c) => c.unlocked)
    if (!open.length) return
    const i = Math.max(0, open.findIndex((c) => c.id === pick))
    setPick(open[(i + d + open.length) % open.length].id)
  }
  const padOn = usePadMenu({ left: () => cycle(-1), right: () => cycle(1), a: () => { if (v?.canPlay) start() }, menu: () => { if (v?.canPlay) start() }, y: () => { if (v?.run) resume() } }, screen === 'menu' && Boolean(v))
  if (!v) return null
  if (screen === 'game' && init) return <Game init={init} settings={settings} onEnd={finish} onQuit={quit} />
  if (screen === 'end' && ending) return <EndNote ending={ending} onAgain={() => { setEnding(null); start() }} onMenu={() => { setEnding(null); setScreen('menu') }} />
  const char = v.chars.find((c) => c.id === pick && c.unlocked) || v.chars[0]
  return (
    <div className='page wl-menu'>
      <div className='wl-hero'>
        <div className='wl-logo' aria-label='Wirdlike'>
          {[...'Wirdlike'].map((ch, i) => <span key={i} style={{ '--i': i }}>{ch}</span>)}
        </div>
        <p className='lede'>Fall into the margins of the dictionary and fight your way down. Every word you find is one you’ve rated: nouns to carry, verbs to use, adjectives for your ink, adverbs to make you better. Words you love come blessed; words you can’t stand come cursed, stronger, with a catch.</p>
      </div>
      {!v.canPlay && <div className='wl-need'>You’ve rated {v.rated} word{v.rated === 1 ? '' : 's'}. Rate at least {MIN_RATED} and they’ll be waiting for you down here.</div>}
      {v.run && (
        <div className='wl-continue'>
          <HeadArtBox id={v.run.char} />
          <div><strong>A run in progress</strong><span>{v.chars.find((c) => c.id === v.run.char)?.name} on {v.run.floor}, {fmtTime(v.run.t)} in</span></div>
          <button className='btn primary' onClick={resume}>Continue</button>
          <button className='btn ghost small' onClick={async () => { await api('wirdlikeAbandon'); load() }}>Abandon</button>
        </div>
      )}
      <h2 className='wl-h'>Who’s going down?</h2>
      <div className='wl-chars' role='radiogroup' aria-label='Character'>
        {v.chars.map((c) => (
          <button key={c.id} className={`wl-char ${c.unlocked ? '' : 'locked'} ${char.id === c.id ? 'on' : ''}`} disabled={!c.unlocked} onClick={() => setPick(c.id)} aria-pressed={char.id === c.id} title={c.unlocked ? c.blurb : `Locked: ${c.unlock}`}>
            <span className='wl-char-head' style={{ '--c': c.color }}>{c.unlocked ? <HeadArt id={c.id} /> : <b>?</b>}</span>
            <strong>{c.unlocked ? c.name : '???'}</strong>
            <span className='wl-hearts'>{c.unlocked ? <>{'♥'.repeat(c.hp / 2)}<i>{'♥'.repeat(c.soul / 2)}</i></> : ''}</span>
            <span className='wl-marks'>{c.marks.redpen && <i title='Beat The Red Pen'>🖍️</i>}{c.marks.autocorrect && <i title='Beat Autocorrect'>🤖</i>}</span>
            {!c.unlocked && <small>{c.unlock}</small>}
          </button>
        ))}
      </div>
      <div className='wl-pickrow'>
        <p className='wl-blurb'><b>{char.name}.</b> {char.blurb}</p>
        <label className='wl-seed'>Seed <input className='field' value={seed} onChange={(e) => setSeed(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))} placeholder='Random' /></label>
        <button className='btn primary big' disabled={!v.canPlay} onClick={start}>{v.run ? 'New run' : 'Start'}</button>
      </div>
      <div className='wl-keys'><span><kbd>W A S D</kbd> move</span><span><kbd>← ↑ → ↓</kbd> shoot ink</span><span><kbd>E</kbd> bang</span><span><kbd>Space</kbd> use a verb</span><span><kbd>Tab</kbd> map</span><span><kbd>Esc</kbd> pause</span><span>🎮 Xbox controllers: left stick moves, right stick or Ⓨ Ⓐ Ⓧ Ⓑ shoot, LB/LT bang, RB/RT use, View map, Menu pause</span></div>
      {padOn && <p className='wl-pad-hint'>🎮 Controller connected: ← → choose a character, Ⓐ start{v.run ? ', Ⓨ continue' : ''}.</p>}
      <div className='wl-grid'>
        <section className='wl-panel'>
          <h3>Progress</h3>
          <dl className='wl-stats'>
            <div><dt>Runs</dt><dd>{v.progress.runs}</dd></div>
            <div><dt>Wins</dt><dd>{v.progress.wins}</dd></div>
            <div><dt>Deepest</dt><dd>{v.progress.runs ? FLOORS[v.progress.deepest].name : '–'}</dd></div>
            <div><dt>Bosses beaten</dt><dd>{v.progress.bossKills}</dd></div>
            <div><dt>Words found</dt><dd>{v.progress.items}</dd></div>
            <div><dt>Best win</dt><dd>{v.progress.bestTime ? fmtTime(v.progress.bestTime) : '–'}</dd></div>
          </dl>
          <h3>Bosses</h3>
          <div className='wl-bosses'>
            {NAMED_BOSSES.map((id) => { const b = v.progress.bosses.find((x) => x.id === id); return <span key={id} className={b?.beaten ? 'beaten' : ''} title={b?.beaten ? `${FOES[id].name}: “${FOES[id].title}” (beaten ${b.beaten}×)` : 'Not met yet'}>{b?.beaten ? FOES[id].name.replace(/^The /, '') : '???'}</span> })}
          </div>
          <h3>Transformations</h3>
          <div className='wl-bosses'>
            {Object.entries(TRANSFORMS).map(([id, t]) => <span key={id} className={v.progress.transforms[id] ? 'beaten' : ''} title={v.progress.transforms[id] ? t.text : 'Carry three words from one topic'}>{v.progress.transforms[id] ? t.name : '???'}</span>)}
          </div>
        </section>
        <section className='wl-panel'>
          <h3>Goals</h3>
          <ul className='wl-goals'>{v.goals.map((g) => <li key={g.id} className={g.done ? 'done' : ''}>{g.done ? '✓' : '○'} {g.text}</li>)}</ul>
          <h3>Looks from down here</h3>
          <ul className='wl-goals'>{v.looks.map((l) => <li key={`${l.kind}:${l.id}`} className={l.have ? 'done' : ''}>{l.have ? '✓' : '🔒'} <b>{l.name}</b> <small>{l.kind === 'face' ? 'face' : l.kind === 'cardBack' ? 'card back' : l.kind === 'name' ? 'name style' : l.kind}</small> · {l.goal}</li>)}</ul>
          <p className='wl-note'>Faces put a character’s head where your initial goes, for everyone to see. Wear one from the Shop, under Faces.</p>
        </section>
      </div>
    </div>
  )
}

const HeadArtBox = ({ id }) => <span className='wl-char-head small'><HeadArt id={id} /></span>
const fmtTime = (t) => { const s = Math.floor(t || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

// --- the game ---------------------------------------------------------------------
const MOVE = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0], W: [0, -1], A: [-1, 0], S: [0, 1], D: [1, 0] }
const SHOOT = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }

function Game ({ init, settings, onEnd, onQuit }) {
  const canvas = useRef(null)
  const runRef = useRef(null)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const [, setTick] = useState(0)
  const [musicOn, setMusicOn] = useState(() => { try { return localStorage.getItem('wl-music') !== 'off' } catch { return true } })
  const [over, setOver] = useState(null)
  const keys = useRef({ held: new Set(), shoot: [], bang: false, use: false, map: false })
  const padMap = useRef(false)
  const pause = useCallback((on) => { pausedRef.current = on; setPaused(on); if (on) play('door') }, [])

  useEffect(() => { setVolume((settings?.soundVolume ?? 70) / 100) }, [settings?.soundVolume])
  useEffect(() => { setMusic(musicOn); try { localStorage.setItem('wl-music', musicOn ? 'on' : 'off') } catch {} }, [musicOn])

  // Keys.
  useEffect(() => {
    const k = keys.current
    const down = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); if (!runRef.current?.over) pause(!pausedRef.current); return }
      if (pausedRef.current) return
      if (MOVE[e.key] || SHOOT[e.key] || e.key === ' ' || e.key === 'Tab') e.preventDefault()
      if (e.repeat) return
      if (MOVE[e.key]) k.held.add(e.key.toLowerCase())
      if (SHOOT[e.key]) { k.shoot = [...k.shoot.filter((x) => x !== e.key), e.key] }
      if (e.key === 'e' || e.key === 'E') k.bang = true
      if (e.key === ' ' || e.key === 'q' || e.key === 'Q') k.use = true
      if (e.key === 'Tab') k.map = true
    }
    const up = (e) => {
      if (MOVE[e.key]) k.held.delete(e.key.toLowerCase())
      if (SHOOT[e.key]) k.shoot = k.shoot.filter((x) => x !== e.key)
      if (e.key === 'Tab') k.map = false
    }
    const blur = () => { k.held.clear(); k.shoot = []; k.map = false; if (!runRef.current?.over) pause(true) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [pause])

  // The run and its loop.
  useEffect(() => {
    clearRoomCache()
    const run = init.saved ? restore(init.saved) : newRun({ seed: init.start.seed, charId: init.start.char, pool: init.start.pool, deep: init.start.deep })
    runRef.current = run
    // For poking at in the console (single-player, so no harm done).
    window.__wirdlike = { run, enterRoom, startFloor, spawnFoe, giveItem }
    const fx = new Fx()
    let saveTimer = null
    const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (!run.over) api('wirdlikeSave', serialize(run)).catch(() => {}) }, 400) }
    save()
    // The controller is read once a frame; its presses go to the first tick.
    const edges = new PadEdges()
    let pad = { s: null, pressed: {} }
    const input = () => {
      const k = keys.current
      let mx = 0; let my = 0
      for (const key of k.held) { mx += MOVE[key][0]; my += MOVE[key][1] }
      let [sx, sy] = k.shoot.length ? SHOOT[k.shoot[k.shoot.length - 1]] : [0, 0]
      let bang = k.bang; let use = k.use
      k.bang = false; k.use = false
      // A controller: left stick moves, right stick or Y/A/X/B shoots.
      const s = pad.s
      if (s) {
        mx += s.lx; my += s.ly
        if (s.rx || s.ry) { sx = s.rx; sy = s.ry } else if (!sx && !sy) { if (s.y) sy = -1; else if (s.a) sy = 1; else if (s.x) sx = -1; else if (s.b) sx = 1 }
        if (pad.pressed.lb || pad.pressed.lt) bang = true
        if (pad.pressed.rb || pad.pressed.rt) use = true
        pad.pressed = {}
      }
      return { mx, my, sx, sy, bang, use }
    }
    const chapterMusic = () => {
      const room = run.floor.rooms[run.room.key]
      const boss = (room.type === 'boss' || room.type === 'miniboss') && !room.cleared
      music(CHAPTERS[FLOORS[run.fi].ch].id, boss)
    }
    chapterMusic()
    let raf = 0
    let last = performance.now()
    let acc = 0
    let ended = false
    const frame = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      // Presses wait for the next game tick (a fast screen can draw several
      // frames between ticks, and a press read in one of those was lost).
      const read = edges.read()
      pad.s = read.s
      if (pausedRef.current) pad.pressed = {}
      else Object.assign(pad.pressed, read.pressed)
      if (read.pressed.menu && !run.over) pause(!pausedRef.current)
      padMap.current = Boolean(pad.s?.view)
      if (!pausedRef.current && !(run.over && ended)) {
        acc += dt
        while (acc >= DT) {
          acc -= DT
          if (run.over) break
          step(run, input())
          const evs = run.ev
          run.ev = []
          if (evs.length) {
            eventsToFx(run, fx, evs)
            eventSounds(evs)
            for (const e of evs) {
              if (e.k === 'item') run.banner = itemBanner(e.item, describe)
              if (e.k === 'transform') run.banner = transformBanner(e.topic)
              if (e.k === 'bossIntro') { run.banner = { title: e.name, sub: e.title ? `“${e.title}”` : null, t: 2.2, max: 2.2 }; chapterMusic() }
              if (e.k === 'enter' || e.k === 'floor') { chapterMusic(); save() }
              if (e.k === 'clear') chapterMusic()
              if (e.k === 'item' || e.k === 'transform' || e.k === 'dealDoor') setTick((t) => t + 1)
              if (e.k === 'hurt') rumble(0.7, 0.4, 180)
              if (e.k === 'boom') rumble(0.9, 0.6, 220)
              if (e.k === 'bossDie') rumble(1, 0.8, 500)
            }
          }
        }
        if (run.over && !ended) {
          ended = true
          clearTimeout(saveTimer)
          const p = run.p
          const summary = {
            won: run.over.won, deep: Boolean(run.over.deep), char: run.char, t: run.t, by: run.over.by, fi: run.fi, deepest: run.stats.deepest,
            kills: run.stats.kills, rooms: run.stats.rooms, bosses: run.stats.bosses, sins: run.stats.sins, found: run.stats.found, transforms: run.stats.transforms,
            bangsUsed: run.stats.bangsUsed, noHitBosses: run.stats.noHitBosses, items: [...p.items.map((i) => ({ word: i.word, flavor: i.flavor })), ...(p.active ? [{ word: p.active.item.word, flavor: p.active.item.flavor, active: true }] : [])], seed: run.seed
          }
          setOver(summary)
          setTimeout(() => onEnd(summary), run.over.won ? 2600 : 2200)
        }
      }
      fx.step(dt)
      const c = canvas.current
      if (c) {
        const ctx = c.getContext('2d')
        const scale = c.width / ROOM_W
        ctx.setTransform(scale, 0, 0, scale, 0, 0)
        drawRun(ctx, run, fx, now / 1000, { bigMap: keys.current.map || padMap.current })
        if (run.over && !run.over.won) { ctx.fillStyle = 'rgba(20,0,0,.35)'; ctx.fillRect(0, 0, ROOM_W, ROOM_H) }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const vis = () => { if (document.hidden && !run.over) pause(true) }
    document.addEventListener('visibilitychange', vis)
    return () => { cancelAnimationFrame(raf); clearTimeout(saveTimer); document.removeEventListener('visibilitychange', vis); if (!run.over) api('wirdlikeSave', serialize(run)).catch(() => {}); stopMusic() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the canvas sharp at any size.
  useEffect(() => {
    const c = canvas.current
    const fit = () => { const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; c.width = Math.round(r.width * dpr); c.height = Math.round(r.width * (ROOM_H / ROOM_W) * dpr) }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(c)
    return () => ro.disconnect()
  }, [])

  const run = runRef.current
  const saveQuit = async () => { await api('wirdlikeSave', serialize(runRef.current)).catch(() => {}); onQuit() }
  const giveUp = () => { const r = runRef.current; r.over = { won: false, by: 'giving up', fi: r.fi, t: r.t }; pause(false) }
  return (
    <div className='wl-game'>
      <div className='wl-stage'>
        <canvas ref={canvas} className='wl-canvas' aria-label='Wirdlike' />
        {paused && run && !over && <Pause run={run} onResume={() => pause(false)} onSave={saveQuit} onGiveUp={giveUp} musicOn={musicOn} setMusicOn={setMusicOn} />}
        {over && <div className={`wl-over ${over.won ? 'won' : ''}`}>{over.won ? (over.deep ? 'The end. For real this time.' : 'The End.') : `Deleted by ${over.by}.`}</div>}
      </div>
    </div>
  )
}

function Pause ({ run, onResume, onSave, onGiveUp, musicOn, setMusicOn }) {
  const p = run.p
  const s = p.stats
  const [sure, setSure] = useState(false)
  // With a controller: left and right choose a button, A presses it, B resumes.
  const box = useRef(null)
  const [focus, setFocus] = useState(0)
  const buttons = () => [...(box.current?.querySelectorAll('.wl-pause-actions button') || [])]
  const pad = usePadMenu({
    left: () => setFocus((f) => Math.max(0, f - 1)),
    up: () => setFocus((f) => Math.max(0, f - 1)),
    right: () => setFocus((f) => Math.min(buttons().length - 1, f + 1)),
    down: () => setFocus((f) => Math.min(buttons().length - 1, f + 1)),
    a: () => buttons()[focus]?.click(),
    b: onResume
  })
  useEffect(() => { buttons().forEach((el, i) => el.classList.toggle('pad-focus', pad && i === focus)) })
  const all = [...(p.active ? [p.active.item] : []), ...p.items]
  return (
    <div className='wl-pause'>
      <div className='wl-pause-card' ref={box}>
        <h2>Paused <small>{FLOORS[run.fi].name} · {fmtTime(run.t)} · seed {run.seed}</small></h2>
        <div className='wl-pause-grid'>
          <dl className='wl-stats small'>
            {[['Damage', s.dmg.toFixed(2)], ['Fire rate', `${s.tears.toFixed(2)}/s`], ['Speed', s.speed.toFixed(2)], ['Range', s.range.toFixed(2)], ['Shot speed', s.shotSpeed.toFixed(2)], ['Luck', s.luck.toFixed(0)]].map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}
          </dl>
          <div>
            <h3>Words you carry</h3>
            {!all.length && <p className='wl-note'>Nothing yet. Find a treasure room (the gold star on the map).</p>}
            <div className='wl-items'>
              {all.map((it, i) => <span key={i} className={`wl-item ${it.flavor || ''} ${it.active ? 'active' : ''}`} title={`${it.word}${it.def ? `: ${it.def}` : ''}\n${describe(it).join(' · ')}`}>{it.word}</span>)}
            </div>
            {p.transforms.length > 0 && <p className='wl-note'>You are: {p.transforms.map((t) => TRANSFORMS[t].name).join(', ')}</p>}
          </div>
        </div>
        {pad && <p className='wl-note'>🎮 Left and right to choose, A to press, B to resume, Menu to pause and unpause.</p>}
        <div className='wl-pause-actions'>
          <button className='btn primary' onClick={onResume}>Resume</button>
          <button className='btn ghost' onClick={() => setMusicOn(!musicOn)}>{musicOn ? 'Music off' : 'Music on'}</button>
          <button className='btn ghost' onClick={onSave}>Save and quit</button>
          {sure ? <button className='btn ghost danger' onClick={onGiveUp}>Really give up?</button> : <button className='btn ghost' onClick={() => setSure(true)}>Give up</button>}
        </div>
      </div>
    </div>
  )
}

// --- the note left behind ---------------------------------------------------------------
function EndNote ({ ending, onAgain, onMenu }) {
  const { summary: s, reward: r } = ending
  const pad = usePadMenu({ a: onAgain, menu: onAgain, b: onMenu })
  const name = { wirdo: 'Wirdo', q: 'Q', x: 'X', o: 'O', z: 'Z', query: '?' }[s.char] || 'Wirdo'
  return (
    <div className='page wl-end'>
      <div className={`wl-note-card ${s.won ? 'won' : ''}`}>
        <div className='wl-note-head'><HeadArtBox id={s.char} /><div><small>{s.won ? 'Found at the end of the book' : 'Found in the margins'}</small><h2>{s.won ? (s.deep ? `${name} unwrote the unwritten.` : `${name} made it to The End.`) : `Here lies ${name}.`}</h2></div></div>
        <p className='wl-note-body'>
          {s.won
            ? <>Beat {s.deep ? 'Autocorrect' : 'The Red Pen'} in {fmtTime(s.t)}, with {s.items.length} word{s.items.length === 1 ? '' : 's'} in hand.</>
            : <>Deleted by <b>{s.by}</b> on {FLOORS[s.fi]?.name}, {fmtTime(s.t)} in.</>}
          {' '}{s.kills} enemies, {s.bosses.length} boss{s.bosses.length === 1 ? '' : 'es'}{s.sins.length ? ` and ${s.sins.length} grammar sin${s.sins.length === 1 ? '' : 's'}` : ''}. Seed {s.seed}.
        </p>
        {s.items.length > 0 && <div className='wl-items'>{s.items.map((it, i) => <span key={i} className={`wl-item ${it.flavor || ''} ${it.active ? 'active' : ''}`}>{it.word}</span>)}</div>}
        {r && (
          <div className='wl-rewards'>
            {r.coins > 0 && <span><Coins n={r.coins} /> for the bosses{s.won ? ' and the win' : ''}</span>}
            {r.xp > 0 && <span>+{r.xp} XP</span>}
            {r.newChars.map((c) => <span key={c} className='new'>🎭 {c} unlocked</span>)}
            {r.looks.map((l) => <span key={l.id} className='new'>✨ New look: {l.name}</span>)}
            {r.badges.map((b) => <span key={b.id} className='new'>{b.emoji} {b.name}</span>)}
          </div>
        )}
        <div className='wl-pause-actions'>
          <button className='btn primary' onClick={onAgain}>{pad ? 'Ⓐ ' : ''}Go again</button>
          <button className='btn ghost' onClick={onMenu}>{pad ? 'Ⓑ ' : ''}Back</button>
        </div>
      </div>
    </div>
  )
}
