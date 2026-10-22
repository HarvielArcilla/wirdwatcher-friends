// The sound a rating makes. Everything is synthesized with Web Audio (no
// files needed) except 'custom' (a file you chose) and 'original'
// (wirdwatcher 1's two sounds).
//
// What makes it feel good:
//   - pitch climbs a pentatonic scale with the rating, so any run of
//     ratings sounds like a tune
//   - better ratings get more notes: a 1.0 is one low blip, a 4.7 is a
//     little run up, and a 5.0 or 0.0 gets its own moment (a fanfare with
//     sparkles, or a sad trombone)
//   - everything goes through a short room echo and a compressor, so it
//     sounds full and punchy at any volume

export const SOUND_PRESETS = [
  { id: 'arcade', name: 'Arcade', blurb: 'Coin blips that grow into a run for great words' },
  { id: 'coin', name: 'Coin', blurb: 'The classic pickup' },
  { id: 'gem', name: 'Gem', blurb: 'Glassy bell, with sparkle up top' },
  { id: 'harp', name: 'Harp', blurb: 'A strum that climbs with the rating' },
  { id: 'kalimba', name: 'Kalimba', blurb: 'Soft thumb piano' },
  { id: 'chime', name: 'Chime', blurb: 'A soft bell' },
  { id: 'marimba', name: 'Marimba', blurb: 'Warm wooden knock' },
  { id: 'pop', name: 'Pop', blurb: 'A bubble-wrap pop' },
  { id: 'bubble', name: 'Bubble', blurb: 'A rising bloop' },
  { id: 'typewriter', name: 'Typewriter', blurb: 'Key strike, bell for the best' },
  { id: 'original', name: 'Original', blurb: 'wirdwatcher 1’s two sounds: above 4.0 and at 1.0 or below' },
  { id: 'custom', name: 'Your file', blurb: 'Any short audio file' },
  { id: 'off', name: 'Off', blurb: 'Silence' }
]

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24] // major pentatonic, one step per 0.5
const clamp = (r) => Math.max(0, Math.min(5, r))
const step = (r) => Math.round(clamp(r) * 2)
const semis = (n) => 2 ** (n / 12)

// The note for a rating: 0.0 is the root, 5.0 two octaves up. With pitch
// following off, every rating gets the same pleasant middle note.
const noteFor = (r, base, follow) => base * semis(follow ? SCALE[step(r)] : 9)

// The notes of a little run for a rating: more and higher notes for better
// ratings. Returns semitone offsets from the rating's own note.
function runFor (r) {
  if (r >= 4.5) return [0, 4, 7]
  if (r >= 3.5) return [0, 5]
  if (r < 1.5) return [0, -5]
  return [0]
}

let ctx = null
let bus = null
const audio = () => {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Master chain into a context: input → (dry + short echo) → compressor → out.
// One per context and destination, reused, so echo loops don't pile up.
const chains = new WeakMap()
function chain (c, dest) {
  const known = chains.get(dest)
  if (known) return known
  const made = makeChain(c, dest)
  chains.set(dest, made)
  return made
}

function makeChain (c, dest) {
  const input = c.createGain()
  const comp = c.createDynamicsCompressor()
  comp.threshold.value = -16
  comp.ratio.value = 4
  comp.attack.value = 0.002
  comp.release.value = 0.15
  const delay = c.createDelay(1)
  delay.delayTime.value = 0.085
  const fb = c.createGain()
  fb.gain.value = 0.22
  const wet = c.createGain()
  wet.gain.value = 0.28
  const tone = c.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 3800
  input.connect(comp)
  input.connect(delay)
  delay.connect(tone).connect(fb).connect(delay)
  tone.connect(wet).connect(comp)
  comp.connect(dest)
  return input
}

function voice (c, out, { type = 'sine', freq, start = 0, attack = 0.005, decay = 0.5, gain = 1, glide = null, vibrato = 0, filter = null }) {
  const t = c.currentTime + start
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + Math.min(decay, 0.3))
  if (vibrato) {
    const lfo = c.createOscillator()
    const depth = c.createGain()
    lfo.frequency.value = 6
    depth.gain.value = vibrato
    lfo.connect(depth).connect(o.frequency)
    lfo.start(t)
    lfo.stop(t + attack + decay + 0.05)
  }
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  let node = o
  if (filter) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(filter[0], t)
    f.frequency.exponentialRampToValueAtTime(filter[1], t + attack + decay)
    f.Q.value = filter[2] || 1
    node = o.connect(f)
  }
  node.connect(g).connect(out)
  o.start(t)
  o.stop(t + attack + decay + 0.05)
}

// A bell: a sine whose pitch is wobbled by another sine (FM), bright then mellow.
function bell (c, out, { freq, start = 0, decay = 1.2, gain = 0.5, ratio = 3.5, index = 2.5 }) {
  const t = c.currentTime + start
  const carrier = c.createOscillator()
  const mod = c.createOscillator()
  const modGain = c.createGain()
  const g = c.createGain()
  carrier.frequency.value = freq
  mod.frequency.value = freq * ratio
  modGain.gain.setValueAtTime(freq * index, t)
  modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + decay)
  mod.connect(modGain).connect(carrier.frequency)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  carrier.connect(g).connect(out)
  carrier.start(t)
  mod.start(t)
  carrier.stop(t + decay + 0.05)
  mod.stop(t + decay + 0.05)
}

function noise (c, out, { start = 0, decay = 0.04, gain = 0.6, freq = 2500 }) {
  const t = c.currentTime + start
  const len = Math.ceil(c.sampleRate * (decay + 0.02))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
  const src = c.createBufferSource()
  src.buffer = buf
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  const g = c.createGain()
  g.gain.value = gain
  src.connect(bp).connect(g).connect(out)
  src.start(t)
}

const SYNTHS = {
  arcade (c, out, r, follow) {
    const f = noteFor(r, 494, follow) // from B4
    runFor(r).forEach((n, i) => {
      voice(c, out, { type: 'square', freq: f * semis(n), start: i * 0.065, decay: i === runFor(r).length - 1 ? 0.32 : 0.06, gain: 0.3, attack: 0.001, filter: [6000, 1800] })
      voice(c, out, { type: 'triangle', freq: f * semis(n) / 2, start: i * 0.065, decay: 0.12, gain: 0.38, attack: 0.001 })
    })
  },
  coin (c, out, r, follow) {
    const f = noteFor(r, 660, follow)
    voice(c, out, { type: 'square', freq: f, decay: 0.07, gain: 0.26, attack: 0.001, filter: [7000, 2500] })
    voice(c, out, { type: 'square', freq: f * 4 / 3, start: 0.07, decay: 0.34, gain: 0.26, attack: 0.001, filter: [7000, 2000] })
  },
  gem (c, out, r, follow) {
    const f = noteFor(r, 659, follow)
    runFor(r).forEach((n, i) => bell(c, out, { freq: f * semis(n), start: i * 0.08, decay: 1.1, gain: 0.32 }))
    if (r >= 4) for (let i = 0; i < 4; i++) voice(c, out, { freq: f * 4 * semis([0, 7, 12, 4][i]), start: 0.12 + i * 0.05, decay: 0.15, gain: 0.05 })
  },
  harp (c, out, r, follow) {
    const f = noteFor(r, 262, follow)
    const notes = r >= 4.5 ? [0, 4, 7, 12, 16] : r >= 3.5 ? [0, 4, 7, 12] : r >= 1.5 ? [0, 7, 12] : [12, 7, 0]
    notes.forEach((n, i) => voice(c, out, { type: 'triangle', freq: f * semis(n), start: i * 0.045, decay: 0.9, gain: 0.3, attack: 0.002, filter: [5000, 700] }))
  },
  kalimba (c, out, r, follow) {
    const f = noteFor(r, 392, follow)
    runFor(r).forEach((n, i) => {
      voice(c, out, { freq: f * semis(n), start: i * 0.09, decay: 0.7, gain: 0.4, attack: 0.002 })
      voice(c, out, { freq: f * semis(n) * 5.4, start: i * 0.09, decay: 0.06, gain: 0.1, attack: 0.001 })
    })
  },
  chime (c, out, r, follow) {
    const f = noteFor(r, 523.25, follow)
    voice(c, out, { freq: f, decay: 1.1, gain: 0.5 })
    voice(c, out, { freq: f * 2.76, decay: 0.5, gain: 0.12 })
    voice(c, out, { freq: f * 5.4, decay: 0.2, gain: 0.05 })
  },
  marimba (c, out, r, follow) {
    const f = noteFor(r, 261.63, follow)
    voice(c, out, { freq: f, decay: 0.45, gain: 0.95, attack: 0.002 })
    voice(c, out, { freq: f * 4, decay: 0.08, gain: 0.2, attack: 0.001 })
  },
  pop (c, out, r, follow) {
    const f = noteFor(r, 330, follow)
    voice(c, out, { freq: f * 2.2, glide: f, decay: 0.09, gain: 1, attack: 0.001 })
    noise(c, out, { decay: 0.015, gain: 0.45, freq: 3500 })
  },
  bubble (c, out, r, follow) {
    const f = noteFor(r, 300, follow)
    voice(c, out, { freq: f * 0.6, glide: f * 1.6, decay: 0.18, gain: 1, attack: 0.004 })
  },
  typewriter (c, out, r) {
    noise(c, out, { decay: 0.035, gain: 1.6, freq: 1800 })
    noise(c, out, { start: 0.012, decay: 0.03, gain: 0.8, freq: 600 })
    if (r >= 4.5) voice(c, out, { freq: 1568, start: 0.06, decay: 0.9, gain: 0.25 })
  }
}

// The ends of the scale get their own moment, after the preset's own sound:
// 4.5 and up a fanfare (the full one with sparkles for a 5.0), 0.5 and below
// a sad trombone (the whole slide for a 0.0).
const EXTREMES = {
  perfect (c, out, full, start = 0.18) {
    const root = 523.25
    const notes = full ? [0, 4, 7, 12] : [0, 4, 7]
    notes.forEach((n, i) => {
      const last = i === notes.length - 1
      voice(c, out, { type: 'square', freq: root * semis(n), start: start + i * 0.075, decay: last ? (full ? 0.7 : 0.4) : 0.1, gain: 0.14, attack: 0.002, filter: [7000, 2200] })
      voice(c, out, { type: 'triangle', freq: root * semis(n), start: start + i * 0.075, decay: last ? (full ? 0.8 : 0.45) : 0.12, gain: 0.22, attack: 0.002 })
    })
    if (full) for (let i = 0; i < 9; i++) bell(c, out, { freq: root * 4 * semis([0, 4, 7, 9, 12][i % 5]), start: start + 0.32 + i * 0.045 + Math.random() * 0.02, decay: 0.35, gain: 0.06, ratio: 2, index: 1 })
  },
  zero (c, out, full, start = 0.12) {
    const notes = full ? [0, -1, -2, -3] : [0, -2]
    const base = 233
    notes.forEach((n, i) => {
      const last = i === notes.length - 1
      voice(c, out, { type: 'sawtooth', freq: base * semis(n), start: start + i * 0.28, attack: 0.03, decay: last ? (full ? 0.9 : 0.5) : 0.22, gain: 0.16, vibrato: last ? 5 : 0, filter: [1400, 500, 2] })
    })
    if (full) voice(c, out, { freq: 90, glide: 40, start: start + 1.25, decay: 0.35, gain: 0.6, attack: 0.002 })
  }
}

const original = {}
let custom = null // { url, buffer }

export function setCustomSound (dataUrl) {
  custom = dataUrl ? { url: dataUrl, buffer: null } : null
}

async function playCustom (c, out, r, follow) {
  if (!custom) return
  if (!custom.buffer) {
    const bytes = await (await fetch(custom.url)).arrayBuffer()
    custom.buffer = await c.decodeAudioData(bytes)
  }
  const src = c.createBufferSource()
  src.buffer = custom.buffer
  if (follow) src.playbackRate.value = 0.85 + (clamp(r) / 5) * 0.3
  src.connect(out)
  src.start()
}

// 'perfect' from 4.5 up, 'zero' from 0.5 down; full: the very ends.
export const extremeFor = (r) => (r >= 4.5 ? { kind: 'perfect', full: r === 5 } : r <= 0.5 ? { kind: 'zero', full: r === 0 } : null)

// Plays a rating into any audio context (a live one, or an offline one for
// checking that each preset really makes a sound).
export function renderSound (c, dest, preset, r, { follow = true, celebrate = true } = {}) {
  const out = chain(c, dest)
  if (preset === 'custom') playCustom(c, out, r, follow).catch(() => {})
  else if (SYNTHS[preset]) SYNTHS[preset](c, out, r, follow)
  const ex = celebrate && extremeFor(r)
  if (ex) EXTREMES[ex.kind](c, out, ex.full)
}

// wirdwatcher 1's two sounds, exactly as it played them: one above 4.0, the
// other at 1.0 and below, nothing in between.
function playOriginal (r, volume) {
  const which = r > 4 ? 'good' : r <= 1 ? 'bad' : null
  if (!which) return
  for (const a of Object.values(original)) { a.pause(); a.currentTime = 0 } // never two at once
  const a = original[which] = original[which] || new Audio(`../assets/audio/${which === 'good' ? 'poole_rsvp' : 'poole_cancel'}.m4a`)
  a.volume = volume
  a.currentTime = 0
  a.play().catch(() => {})
}

// settings: { ratingSound, soundVolume, soundPitch, celebrate }
export function playRating (r, settings) {
  try {
    const preset = settings.ratingSound
    if (preset === 'off' || !settings.soundVolume) return
    if (preset === 'original') return playOriginal(r, settings.soundVolume / 100)
    const c = audio()
    if (!bus) { bus = c.createGain(); bus.connect(c.destination) }
    bus.gain.value = (settings.soundVolume / 100) * 0.9
    renderSound(c, bus, preset, r, { follow: settings.soundPitch, celebrate: settings.celebrate })
  } catch {}
}

// Leveling up: a rising run into a held major chord, a bright bell on top,
// and a little sparkle. Its own sound, the same whatever preset you rate with.
export function renderLevelUp (c, dest) {
  const out = chain(c, dest)
  const run = [523.25, 659.25, 783.99, 1046.5, 1318.5] // C5 E5 G5 C6 E6
  run.forEach((f, i) => {
    voice(c, out, { type: 'triangle', freq: f, start: i * 0.075, attack: 0.004, decay: 0.22, gain: 0.32 })
    voice(c, out, { type: 'square', freq: f / 2, start: i * 0.075, attack: 0.004, decay: 0.12, gain: 0.05, filter: 1800 })
  })
  const t = run.length * 0.075 + 0.02
  for (const f of [523.25, 659.25, 783.99, 1046.5]) voice(c, out, { type: 'sawtooth', freq: f, start: t, attack: 0.02, decay: 1.4, gain: 0.07, filter: 2600, vibrato: 4 })
  voice(c, out, { type: 'sine', freq: 261.63, start: t, attack: 0.01, decay: 1.2, gain: 0.35 })
  bell(c, out, { freq: 2093, start: t + 0.05, decay: 1.6, gain: 0.22 })
  bell(c, out, { freq: 2637, start: t + 0.22, decay: 1.3, gain: 0.16 })
  for (let i = 0; i < 6; i++) bell(c, out, { freq: 3000 + Math.random() * 2500, start: t + 0.3 + i * 0.07, decay: 0.35, gain: 0.05 })
}

export function playLevelUp (settings) {
  try {
    if (!settings || settings.ratingSound === 'off' || !settings.soundVolume) return
    const c = audio()
    if (!bus) { bus = c.createGain(); bus.connect(c.destination) }
    bus.gain.value = (settings.soundVolume / 100) * 0.9
    renderLevelUp(c, bus)
  } catch {}
}

// A penguin's honk: a buzzy, nasal call. A sawtooth through two vowel-like
// resonances, its pitch rising then sagging, with a little flutter.
function honk (c, out, { start = 0, freq = 330, dur = 0.2, gain = 0.32, rise = 1.35 }) {
  const t = c.currentTime + start
  const o = c.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(freq * 0.85, t)
  o.frequency.exponentialRampToValueAtTime(freq * rise, t + dur * 0.35)
  o.frequency.exponentialRampToValueAtTime(freq * 0.9, t + dur)
  const lfo = c.createOscillator()
  const depth = c.createGain()
  lfo.frequency.value = 28
  depth.gain.value = freq * 0.06
  lfo.connect(depth).connect(o.frequency)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015)
  g.gain.setValueAtTime(gain, t + dur * 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  for (const [f, q, lvl] of [[950, 5, 1], [2300, 7, 0.5]]) {
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(f * 0.8, t)
    bp.frequency.exponentialRampToValueAtTime(f * 1.15, t + dur * 0.4)
    bp.Q.value = q
    const lg = c.createGain()
    lg.gain.value = lvl
    o.connect(bp).connect(lg).connect(g)
  }
  g.connect(out)
  o.start(t); lfo.start(t)
  o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05)
}

// Water: low filtered noise, a long tail.
function wash (c, out, { start = 0, decay = 0.6, gain = 0.5, freq = 700 }) {
  const t = c.currentTime + start
  const len = Math.ceil(c.sampleRate * (decay + 0.05))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / (c.sampleRate * 0.01)) * (1 - i / len) ** 2
  const src = c.createBufferSource()
  src.buffer = buf
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(freq * 3, t)
  lp.frequency.exponentialRampToValueAtTime(freq * 0.4, t + decay)
  const g = c.createGain()
  g.gain.value = gain
  src.connect(lp).connect(g).connect(out)
  src.start(t)
}

// Penguin Cross: a honk as it jumps (never quite the same twice), a soft
// crunch on landing, ice cracking and a splash, and a happy chorus at the
// far shore.
export const PENGUIN = {
  hop: (c, out) => {
    const f = 300 + Math.random() * 110
    honk(c, out, { freq: f, dur: 0.16 + Math.random() * 0.06 })
    if (Math.random() < 0.4) honk(c, out, { freq: f * 1.12, start: 0.13, dur: 0.1, gain: 0.22 })
  },
  land: (c, out) => { noise(c, out, { decay: 0.05, gain: 0.35, freq: 3200 }); voice(c, out, { type: 'sine', freq: 160, glide: 110, decay: 0.08, gain: 0.25 }) },
  crack: (c, out) => {
    for (let i = 0; i < 5; i++) noise(c, out, { start: i * 0.045 + Math.random() * 0.02, decay: 0.03, gain: 0.5, freq: 2600 + Math.random() * 2400 })
    voice(c, out, { type: 'sine', freq: 120, glide: 60, start: 0.05, decay: 0.25, gain: 0.3 })
  },
  splash: (c, out) => {
    wash(c, out, { decay: 0.7, gain: 0.7, freq: 900 })
    for (let i = 0; i < 6; i++) voice(c, out, { type: 'sine', freq: 500 + Math.random() * 700, glide: 1400 + Math.random() * 900, start: 0.15 + i * 0.07 + Math.random() * 0.04, decay: 0.05, gain: 0.08 })
    honk(c, out, { freq: 260, start: 0.02, dur: 0.28, gain: 0.25, rise: 0.8 })
  },
  home: (c, out) => {
    ;[330, 392, 440, 523].forEach((f, i) => honk(c, out, { freq: f, start: i * 0.13, dur: 0.14, gain: 0.26 }))
    bell(c, out, { freq: 1567.98, start: 0.55, decay: 0.9, gain: 0.2 })
  },
  cash: (c, out) => { bell(c, out, { freq: 1318.5, decay: 0.5, gain: 0.2 }); bell(c, out, { freq: 1760, start: 0.08, decay: 0.7, gain: 0.18 }); honk(c, out, { freq: 380, start: 0.05, dur: 0.12, gain: 0.18 }) }
}

export function playPenguin (kind, settings) {
  try {
    if (!settings || settings.tableSounds === false || !settings.soundVolume || !PENGUIN[kind]) return
    const c = audio()
    if (!bus) { bus = c.createGain(); bus.connect(c.destination) }
    bus.gain.value = (settings.soundVolume / 100) * 0.9
    PENGUIN[kind](c, chain(c, bus))
  } catch {}
}

// --- the lobby table ---------------------------------------------------------------
//
// Little sounds for what happens at a table, so you can be on another tab
// (or another window) and still hear the game: someone sitting down or
// leaving, a card going down, your turn, the reveal, the end of a game, a
// chat message. Each is its own short sound, quieter than rating sounds.
const TABLE = {
  join: (c, out) => { voice(c, out, { type: 'triangle', freq: 523.25, decay: 0.16, gain: 0.22 }); voice(c, out, { type: 'triangle', freq: 783.99, start: 0.09, decay: 0.22, gain: 0.22 }) },
  leave: (c, out) => { voice(c, out, { type: 'triangle', freq: 659.25, decay: 0.16, gain: 0.18 }); voice(c, out, { type: 'triangle', freq: 440, start: 0.1, decay: 0.26, gain: 0.18 }) },
  // A card slapped onto felt: a soft thump and a papery flick.
  card: (c, out) => { noise(c, out, { decay: 0.05, gain: 0.55, freq: 1800 }); voice(c, out, { type: 'sine', freq: 180, glide: 90, decay: 0.09, gain: 0.25 }) },
  // Everyone's in: the cards turn over.
  reveal: (c, out) => {
    for (let i = 0; i < 4; i++) noise(c, out, { start: i * 0.06, decay: 0.035, gain: 0.35, freq: 2200 + i * 300 })
    bell(c, out, { freq: 1046.5, start: 0.26, decay: 0.9, gain: 0.2 })
    bell(c, out, { freq: 1318.5, start: 0.36, decay: 0.9, gain: 0.16 })
  },
  // Your turn: two bright bells, hard to miss.
  turn: (c, out) => { bell(c, out, { freq: 1567.98, decay: 0.7, gain: 0.28 }); bell(c, out, { freq: 2093, start: 0.16, decay: 0.9, gain: 0.26 }) },
  start: (c, out) => { [392, 523.25, 659.25].forEach((f, i) => voice(c, out, { type: 'triangle', freq: f, start: i * 0.08, decay: 0.25, gain: 0.22 })) },
  gameover: (c, out) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => voice(c, out, { type: 'triangle', freq: f, start: i * 0.11, decay: 0.3, gain: 0.24 }))
    for (const f of [523.25, 659.25, 783.99]) voice(c, out, { type: 'sawtooth', freq: f, start: 0.48, attack: 0.02, decay: 1.1, gain: 0.05, filter: [2400, 800] })
    bell(c, out, { freq: 2093, start: 0.5, decay: 1.4, gain: 0.18 })
  },
  chat: (c, out) => voice(c, out, { type: 'sine', freq: 880, glide: 1320, decay: 0.12, gain: 0.16 }),
  react: (c, out) => voice(c, out, { type: 'sine', freq: 1200, glide: 1600, decay: 0.08, gain: 0.1 }),
  solved: (c, out) => { bell(c, out, { freq: 1318.5, decay: 0.6, gain: 0.2 }); bell(c, out, { freq: 1975.5, start: 0.1, decay: 0.8, gain: 0.18 }) }
}
export const TABLE_SOUNDS = Object.keys(TABLE)

let lastTable = {}
export function playTable (kind, settings) {
  try {
    if (!settings || settings.tableSounds === false || !settings.soundVolume || !TABLE[kind]) return
    // The same sound twice in a breath (several cards at once) plays once.
    const now = performance.now()
    if (now - (lastTable[kind] || 0) < 90) return
    lastTable[kind] = now
    const c = audio()
    if (!bus) { bus = c.createGain(); bus.connect(c.destination) }
    bus.gain.value = (settings.soundVolume / 100) * 0.9
    TABLE[kind](c, chain(c, bus))
  } catch {}
}
