// Wirdlike's sounds, all synthesized: soft ink plops for your shots, squelches
// and splats, chimes for pickups, a fanfare for a new word, and a quiet
// soundtrack that changes with each chapter (and gets serious for bosses).

import { synth } from '../sound.js'

let bus = null
let musicBus = null
let volume = 0.7
let musicOn = true
const last = {}

function out () {
  const c = synth.audio()
  if (!bus) { bus = c.createGain(); bus.connect(c.destination); musicBus = c.createGain(); musicBus.connect(c.destination) }
  bus.gain.value = volume * 0.8
  musicBus.gain.value = musicOn ? volume * 0.28 : 0
  return c
}

export function setVolume (v) { volume = Math.max(0, Math.min(1, v)); if (bus) { bus.gain.value = volume * 0.8; musicBus.gain.value = musicOn ? volume * 0.28 : 0 } }
export function setMusic (on) { musicOn = on; if (musicBus) musicBus.gain.value = on ? volume * 0.28 : 0 }
export const musicEnabled = () => musicOn

const { voice, noise, bell, wash } = synth
const R = (a, b) => a + Math.random() * (b - a)

const SOUNDS = {
  shoot: (c, o) => voice(c, o, { type: 'sine', freq: R(520, 640), glide: R(260, 320), decay: 0.07, gain: 0.12 }),
  splash: (c, o) => noise(c, o, { decay: 0.04, gain: 0.12, freq: R(900, 1400) }),
  hit: (c, o) => { noise(c, o, { decay: 0.05, gain: 0.25, freq: 600 }); voice(c, o, { type: 'triangle', freq: R(180, 220), glide: 90, decay: 0.08, gain: 0.18 }) },
  die: (c, o) => { wash(c, o, { decay: 0.25, gain: 0.35, freq: 500 }); voice(c, o, { type: 'sine', freq: 300, glide: 70, decay: 0.2, gain: 0.25 }) },
  hurt: (c, o) => { voice(c, o, { type: 'sawtooth', freq: 260, glide: 120, decay: 0.22, gain: 0.18, filter: [1800, 400] }); noise(c, o, { decay: 0.08, gain: 0.3, freq: 400 }) },
  heart: (c, o) => { voice(c, o, { type: 'sine', freq: 660, decay: 0.12, gain: 0.2 }); voice(c, o, { type: 'sine', freq: 990, start: 0.07, decay: 0.2, gain: 0.2 }) },
  coin: (c, o) => { bell(c, o, { freq: 1567, decay: 0.25, gain: 0.16 }); bell(c, o, { freq: 2093, start: 0.05, decay: 0.35, gain: 0.14 }) },
  bang: (c, o) => voice(c, o, { type: 'square', freq: 220, glide: 330, decay: 0.08, gain: 0.08 }),
  key: (c, o) => { bell(c, o, { freq: 1046, decay: 0.3, gain: 0.15, ratio: 2 }); bell(c, o, { freq: 1318, start: 0.08, decay: 0.4, gain: 0.12, ratio: 2 }) },
  charge: (c, o) => voice(c, o, { type: 'triangle', freq: 300, glide: 1200, decay: 0.3, gain: 0.18 }),
  door: (c, o) => { voice(c, o, { type: 'sine', freq: 90, glide: 55, decay: 0.25, gain: 0.3 }); noise(c, o, { decay: 0.1, gain: 0.15, freq: 300 }) },
  open: (c, o) => { voice(c, o, { type: 'triangle', freq: 392, decay: 0.15, gain: 0.14 }); voice(c, o, { type: 'triangle', freq: 523, start: 0.08, decay: 0.25, gain: 0.14 }) },
  unlock: (c, o) => { noise(c, o, { decay: 0.03, gain: 0.3, freq: 3000 }); bell(c, o, { freq: 880, start: 0.05, decay: 0.4, gain: 0.15 }) },
  boom: (c, o) => { wash(c, o, { decay: 0.9, gain: 0.9, freq: 260 }); voice(c, o, { type: 'sine', freq: 110, glide: 30, decay: 0.5, gain: 0.5 }) },
  bangDown: (c, o) => noise(c, o, { decay: 0.06, gain: 0.2, freq: 2000 }),
  tile: (c, o) => { noise(c, o, { decay: 0.12, gain: 0.35, freq: 700 }); noise(c, o, { start: 0.05, decay: 0.08, gain: 0.2, freq: 1400 }) },
  item: (c, o) => { [523, 659, 784, 1046].forEach((f, i) => bell(c, o, { freq: f, start: i * 0.09, decay: 0.8, gain: 0.16 })); voice(c, o, { type: 'triangle', freq: 261, start: 0.3, decay: 0.8, gain: 0.12 }) },
  transform: (c, o) => { [392, 494, 587, 784, 988].forEach((f, i) => bell(c, o, { freq: f, start: i * 0.07, decay: 1.2, gain: 0.15 })); voice(c, o, { type: 'sawtooth', freq: 196, decay: 1.4, gain: 0.08, filter: [2400, 600] }) },
  clear: (c, o) => { voice(c, o, { type: 'triangle', freq: 523, decay: 0.12, gain: 0.12 }); voice(c, o, { type: 'triangle', freq: 784, start: 0.1, decay: 0.3, gain: 0.12 }) },
  secret: (c, o) => [784, 740, 622, 440, 415, 659, 831, 1046].forEach((f, i) => bell(c, o, { freq: f, start: i * 0.08, decay: 0.4, gain: 0.12, ratio: 2 })),
  bossIntro: (c, o) => { voice(c, o, { type: 'sawtooth', freq: 110, decay: 1.2, gain: 0.2, filter: [600, 200] }); voice(c, o, { type: 'sawtooth', freq: 116.5, decay: 1.2, gain: 0.18, filter: [600, 200] }); noise(c, o, { decay: 0.3, gain: 0.4, freq: 200 }) },
  bossDie: (c, o) => { wash(c, o, { decay: 1.4, gain: 0.8, freq: 400 }); [262, 330, 392, 523].forEach((f, i) => bell(c, o, { freq: f * 2, start: 0.4 + i * 0.12, decay: 1, gain: 0.15 })) },
  use: (c, o) => { voice(c, o, { type: 'square', freq: 440, glide: 880, decay: 0.2, gain: 0.08 }); bell(c, o, { freq: 1760, start: 0.1, decay: 0.4, gain: 0.12 }) },
  eshoot: (c, o) => voice(c, o, { type: 'sine', freq: R(300, 360), glide: 200, decay: 0.06, gain: 0.07 }),
  descend: (c, o) => { voice(c, o, { type: 'triangle', freq: 523, glide: 130, decay: 0.8, gain: 0.2 }); wash(c, o, { decay: 0.8, gain: 0.3, freq: 300 }) },
  dead: (c, o) => [392, 370, 349, 330].forEach((f, i) => voice(c, o, { type: 'triangle', freq: f, start: i * 0.25, decay: 0.4, gain: 0.18 })),
  won: (c, o) => [523, 659, 784, 1046, 1318].forEach((f, i) => bell(c, o, { freq: f, start: i * 0.12, decay: 1.4, gain: 0.16 })),
  aegis: (c, o) => bell(c, o, { freq: 1200, decay: 0.5, gain: 0.2, ratio: 1.5 }),
  swap: (c, o) => voice(c, o, { type: 'square', freq: 300, glide: 600, decay: 0.15, gain: 0.06 }),
  poof: (c, o) => noise(c, o, { decay: 0.15, gain: 0.15, freq: 1200 }),
  lightning: (c, o) => { noise(c, o, { decay: 0.2, gain: 0.4, freq: 3500 }); voice(c, o, { type: 'sawtooth', freq: 80, decay: 0.3, gain: 0.15 }) }
}

export function play (kind) {
  try {
    if (!volume || !SOUNDS[kind]) return
    const now = performance.now()
    const gap = kind === 'shoot' || kind === 'splash' || kind === 'eshoot' ? 45 : 70
    if (now - (last[kind] || 0) < gap) return
    last[kind] = now
    const c = out()
    SOUNDS[kind](c, synth.chain(c, bus))
  } catch {}
}

// Which sound goes with which event.
export function eventSounds (evs) {
  for (const e of evs) {
    const k = { shoot: 'shoot', splash: e.enemy ? null : 'splash', hit: 'hit', die: e.boss ? null : 'die', hurt: 'hurt', door: 'door', unlock: 'unlock', boom: 'boom', bangDown: 'bangDown', tile: 'tile', item: 'item', transform: 'transform', clear: 'open', secret: 'secret', bossIntro: 'bossIntro', bossDie: 'bossDie', use: 'use', eshoot: 'eshoot', descend: 'descend', dead: 'dead', won: 'won', aegis: 'aegis', swapControls: 'swap', poof: 'poof', lightning: 'lightning', heal: 'heart' }[e.k]
    if (e.k === 'pickup') play({ heart: 'heart', half: 'heart', soul: 'heart', glyph: 'coin', glyph5: 'coin', bang: 'bang', bang2: 'bang', mark: 'key', charge: 'charge' }[e.kind])
    else if (k) play(k)
  }
}

// --- music -------------------------------------------------------------------------
// A loop built from each chapter's scale: a bass line, a soft pad and a
// plucked arpeggio, scheduled a little ahead. Bosses bring drums.
const KEYS = {
  margins: { root: 220, scale: [0, 2, 4, 7, 9], bpm: 92, mood: 'calm' },
  index: { root: 196, scale: [0, 2, 3, 7, 8], bpm: 96, mood: 'calm' },
  stacks: { root: 174.6, scale: [0, 3, 5, 7, 10], bpm: 88, mood: 'dark' },
  archive: { root: 164.8, scale: [0, 2, 3, 7, 10], bpm: 84, mood: 'dark' },
  press: { root: 146.8, scale: [0, 1, 5, 7, 8], bpm: 110, mood: 'tense' },
  unwritten: { root: 130.8, scale: [0, 3, 6, 7, 10], bpm: 76, mood: 'void' }
}
const PROG = [0, 3, 4, 2]
let timer = null
let state = null

export function music (chapter, boss = false) {
  const want = chapter ? `${chapter}:${boss}` : null
  if (state?.key === want) return
  stopMusic()
  if (!want) return
  const k = KEYS[chapter] || KEYS.margins
  state = { key: want, k, boss, beat: 0, next: 0 }
  try {
    const c = out()
    state.next = c.currentTime + 0.1
    timer = setInterval(() => schedule(c), 60)
  } catch {}
}

export function stopMusic () { if (timer) clearInterval(timer); timer = null; state = null }

function note (k, deg, oct = 0) {
  const n = k.scale.length
  const o = Math.floor(deg / n)
  const semi = k.scale[((deg % n) + n) % n] + 12 * (o + oct)
  return k.root * Math.pow(2, semi / 12)
}

function schedule (c) {
  if (!state || !musicOn) { if (state) state.next = c.currentTime + 0.1; return }
  const { k, boss } = state
  const bpm = k.bpm * (boss ? 1.25 : 1)
  const spb = 60 / bpm / 2 // eighth notes
  while (state.next < c.currentTime + 0.25) {
    const t = state.next - c.currentTime
    const b = state.beat
    const bar = Math.floor(b / 8) % PROG.length
    const chord = PROG[bar]
    const o = synth.chain(c, musicBus)
    if (b % 8 === 0) {
      voice(c, o, { type: 'triangle', freq: note(k, chord, -2), start: t, attack: 0.02, decay: spb * 7, gain: 0.35 })
      for (const d of [0, 2, 4]) voice(c, o, { type: 'sine', freq: note(k, chord + d, 0), start: t, attack: 0.4, decay: spb * 8, gain: 0.06 })
    }
    if (b % 8 === 4 && !boss) voice(c, o, { type: 'triangle', freq: note(k, chord + 4, -2), start: t, decay: spb * 3, gain: 0.2 })
    // The arpeggio: sparse when calm, busy for bosses.
    const density = boss ? 0.95 : k.mood === 'calm' ? 0.55 : k.mood === 'void' ? 0.3 : 0.65
    const seed = Math.sin(b * 12.9898 + bar * 78.233) * 43758.5453
    if (seed - Math.floor(seed) < density) {
      const deg = chord + [0, 2, 4, 2, 5, 4, 2, 0][b % 8] + (b % 16 >= 8 ? 1 : 0)
      voice(c, o, { type: k.mood === 'void' ? 'sine' : 'triangle', freq: note(k, deg, 1), start: t, attack: 0.005, decay: spb * 1.6, gain: k.mood === 'void' ? 0.07 : 0.09 })
    }
    if (boss) {
      if (b % 4 === 0) voice(c, o, { type: 'sine', freq: 120, glide: 45, start: t, decay: 0.18, gain: 0.5 })
      if (b % 4 === 2) noise(c, o, { start: t, decay: 0.08, gain: 0.25, freq: 1800 })
      noise(c, o, { start: t, decay: 0.02, gain: 0.08, freq: 7000 })
    } else if (k.mood === 'tense' && b % 2 === 0) noise(c, o, { start: t, decay: 0.02, gain: 0.05, freq: 6000 })
    state.beat++
    state.next += spb
  }
}
