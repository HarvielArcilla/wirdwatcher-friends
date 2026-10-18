// The sound a rating makes. Presets are synthesized with Web Audio (no files),
// and their pitch can follow the rating along a pentatonic scale, so any
// run of ratings sounds musical. 'custom' plays a file you chose (copied
// into the app's data folder); 'original' plays wirdwatcher 1's two sounds.

export const SOUND_PRESETS = [
  { id: 'chime', name: 'Chime', blurb: 'A soft bell' },
  { id: 'marimba', name: 'Marimba', blurb: 'Warm wooden knock' },
  { id: 'pop', name: 'Pop', blurb: 'A bubble-wrap pop' },
  { id: 'bubble', name: 'Bubble', blurb: 'A rising bloop' },
  { id: 'coin', name: 'Coin', blurb: 'Arcade pickup' },
  { id: 'typewriter', name: 'Typewriter', blurb: 'Key strike, bell for the best' },
  { id: 'original', name: 'Original', blurb: 'wirdwatcher 1’s sounds, only at the extremes' },
  { id: 'custom', name: 'Your file', blurb: 'Any short audio file' },
  { id: 'off', name: 'Off', blurb: 'Silence' }
]

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24] // major pentatonic, one step per 0.5
let ctx = null
const audio = () => {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// The note for a rating: 0.0 is the root, 5.0 two octaves up.
const noteFor = (r, base, follow) => base * 2 ** ((follow ? SCALE[Math.round(Math.max(0, Math.min(5, r)) * 2)] : 9) / 12)

function voice (c, out, { type = 'sine', freq, start = 0, attack = 0.005, decay = 0.5, gain = 1, glide = null }) {
  const t = c.currentTime + start
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + Math.min(decay, 0.25))
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + attack + decay + 0.05)
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
  chime (c, out, r, follow) {
    const f = noteFor(r, 523.25, follow)
    voice(c, out, { freq: f, decay: 1.1, gain: 0.5 })
    voice(c, out, { freq: f * 2.76, decay: 0.5, gain: 0.12 })
    voice(c, out, { freq: f * 5.4, decay: 0.2, gain: 0.05 })
  },
  marimba (c, out, r, follow) {
    const f = noteFor(r, 261.63, follow)
    voice(c, out, { freq: f, decay: 0.45, gain: 0.7, attack: 0.002 })
    voice(c, out, { freq: f * 4, decay: 0.08, gain: 0.2, attack: 0.001 })
  },
  pop (c, out, r, follow) {
    const f = noteFor(r, 330, follow)
    voice(c, out, { freq: f * 2.2, glide: f, decay: 0.09, gain: 0.8, attack: 0.001 })
    noise(c, out, { decay: 0.015, gain: 0.25, freq: 3500 })
  },
  bubble (c, out, r, follow) {
    const f = noteFor(r, 300, follow)
    voice(c, out, { freq: f * 0.6, glide: f * 1.6, decay: 0.18, gain: 0.6, attack: 0.004 })
  },
  coin (c, out, r, follow) {
    const f = noteFor(r, 660, follow)
    voice(c, out, { type: 'square', freq: f, decay: 0.07, gain: 0.28, attack: 0.001 })
    voice(c, out, { type: 'square', freq: f * 4 / 3, start: 0.07, decay: 0.28, gain: 0.28, attack: 0.001 })
  },
  typewriter (c, out, r) {
    noise(c, out, { decay: 0.035, gain: 0.9, freq: 1800 })
    noise(c, out, { start: 0.012, decay: 0.03, gain: 0.4, freq: 600 })
    if (r >= 4.5) voice(c, out, { freq: 1568, start: 0.06, decay: 0.9, gain: 0.25 })
  }
}

let original = {}
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
  if (follow) src.playbackRate.value = 0.85 + (Math.max(0, Math.min(5, r)) / 5) * 0.3
  src.connect(out)
  src.start()
}

// Plays a preset into any audio context (a live one, or an offline one for
// checking that each preset really makes a sound).
export function renderSound (c, out, preset, r, follow = true) {
  if (preset === 'custom') return playCustom(c, out, r, follow).catch(() => {})
  ;(SYNTHS[preset] || SYNTHS.chime)(c, out, r, follow)
}

// settings: { ratingSound, soundVolume, soundPitch, sounds }
export function playRating (r, settings) {
  try {
    const preset = settings.ratingSound
    const extreme = r > 4 ? 'good' : r <= 1 ? 'bad' : null
    if (preset === 'off' || !settings.soundVolume) return
    if ((settings.sounds || preset === 'original') && extreme) {
      const a = original[extreme] = original[extreme] || new Audio(`../assets/audio/${extreme === 'good' ? 'poole_rsvp' : 'poole_cancel'}.m4a`)
      a.volume = settings.soundVolume / 100
      a.currentTime = 0
      a.play().catch(() => {})
      return
    }
    if (preset === 'original') return
    const c = audio()
    const out = c.createGain()
    out.gain.value = (settings.soundVolume / 100) * 0.9
    out.connect(c.destination)
    renderSound(c, out, preset, r, settings.soundPitch)
  } catch {}
}
