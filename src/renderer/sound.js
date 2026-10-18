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
