// Words become items. Every word you've rated can turn up in a run, and
// what it does comes from the word itself:
//
//   part of speech   nouns are things you carry, verbs are actives you use
//                    (Space, charged by clearing rooms), adjectives change
//                    your shots, adverbs raise a stat
//   meaning          its definitions are read for a theme: fire burns, ice
//                    slows, "double" splits your shots, money brings glyphs
//   topic            three items from one topic transform you
//   length, letters  how strong it is (quality 0–4)
//   your rating      flavour, never power: words you love are blessed (a
//                    little margin heart on top), words you hate are cursed
//                    (stronger, with a catch). So nothing here rewards
//                    rating a word any way but honestly.

import { hash01, Rng } from './rng.js'

export const STAT_UNIT = { dmg: 0.7, tears: 0.45, speed: 0.12, range: 0.22, shotSpeed: 0.15, luck: 1, size: -0.08 }
const QMUL = [0.6, 0.85, 1.1, 1.4, 1.8]
const r1 = (x) => Math.round(x * 100) / 100

// --- actives -------------------------------------------------------------------------
// What a verb does when you press Space, and how many cleared rooms it
// takes to charge. `p` (power) scales with the word's quality.
export const ACTIVES = {
  nuke: { charge: 4, text: 'Hits everything in the room hard' },
  heal: { charge: 4, text: 'Heals a heart' },
  freeze: { charge: 3, text: 'Freezes every enemy for a few seconds' },
  shield: { charge: 3, text: 'Nothing can touch you for a few seconds' },
  dash: { charge: 1, text: 'Dash where you’re going, hitting what’s in the way' },
  bombs: { charge: 3, text: 'Drops a bang that doesn’t cost one' },
  summon: { charge: 4, text: 'Two little helpers for this room' },
  reroll: { charge: 6, text: 'Rerolls the words on pedestals in the room' },
  charm: { charge: 3, text: 'Charms every enemy for a while' },
  fear: { charge: 2, text: 'Frightens every enemy away' },
  teleport: { charge: 2, text: 'Takes you to a random room' },
  reveal: { charge: 6, text: 'Shows the whole floor, secrets too' },
  haste: { charge: 3, text: 'Damage and fire rate up for the room' },
  glyphs: { charge: 4, text: 'A handful of glyphs' },
  flood: { charge: 3, text: 'A wave that knocks everything back' },
  lightning: { charge: 3, text: 'Lightning strikes every enemy' },
  shout: { charge: 2, text: 'A ring of piercing shots' },
  copy: { charge: 6, text: 'Copies every pickup in the room' },
  slowtime: { charge: 4, text: 'Slows everything but you for a while' },
  flame: { charge: 3, text: 'A ring of fire' },
  cloud: { charge: 3, text: 'A cloud of poison around you' },
  holy: { charge: 4, text: 'A margin heart and a moment of grace' },
  random: { charge: 2, text: 'Something different every time' }
}

// --- themes --------------------------------------------------------------------------
// Each theme: the words that call it up (matched in the word and its
// definitions), a colour, what an adjective adds to your shots, what an
// adverb raises, what a noun gives you and what a verb does.
const S = (s, k = 1) => ({ t: 'stat', s, k })
const shot = (f) => ({ t: 'shot', f })
const THEMES = [
  { id: 'fire', keys: 'fire flame burn blaze heat hot ember ash scorch smoke torch inferno lava molten spark candle', color: '#ff7a2a', shot: ['burn'], stat: ['dmg'], noun: [shot('burn'), S('dmg', 0.4)], act: 'flame' },
  { id: 'ice', keys: 'ice cold frost freeze froze frozen snow chill winter glacier sleet arctic polar hail', color: '#7ad8ff', shot: ['slow'], stat: ['shotSpeed'], noun: [shot('slow'), S('range', 0.6)], act: 'freeze' },
  { id: 'storm', keys: 'electric electricity lightning thunder storm shock volt current static spark tempest', color: '#ffe14a', shot: ['chain'], stat: ['tears'], noun: [shot('chain'), S('tears', 0.5)], act: 'lightning' },
  { id: 'poison', keys: 'poison toxic venom rot decay disease sick illness infect plague rotten foul germ', color: '#7acb4a', shot: ['poison'], stat: ['dmg'], noun: [shot('poison'), { t: 'trail', f: 'poison' }], act: 'cloud' },
  { id: 'water', keys: 'water sea ocean rain wet river wave flood liquid lake stream tide splash pour swim drown', color: '#3aa0e8', shot: ['wavy', 'knock'], stat: ['range'], noun: [S('range', 1), S('tears', 0.4)], act: 'flood' },
  { id: 'light', keys: 'light bright sun shine holy angel heaven divine glow radiant lamp gleam saint pure', color: '#fff0a0', shot: ['pierce'], stat: ['luck'], noun: [{ t: 'soul', v: 2 }, shot('pierce')], act: 'holy' },
  { id: 'dark', keys: 'dark shadow night black evil demon devil death dead hell sin doom grim gloom wicked', color: '#6a4aa8', shot: ['fear'], stat: ['dmg'], noun: [S('dmg', 1), shot('fear')], act: 'fear' },
  { id: 'ghost', keys: 'ghost spirit soul phantom spectre specter haunt invisible vanish ethereal', color: '#cfd6ff', shot: ['spectral'], stat: ['range'], noun: [shot('spectral'), { t: 'flight' }], act: 'shield' },
  { id: 'speed', keys: 'fast quick rapid swift run race hurry speed haste rush sprint dash brisk', color: '#ff9ac8', shot: ['fast'], stat: ['speed'], noun: [S('speed', 1.2), S('tears', 0.4)], act: 'dash' },
  { id: 'slow', keys: 'slow lazy sluggish sleep rest tired calm idle drowsy dull leisurely', color: '#9ab0c8', shot: ['slow'], stat: ['range'], noun: [S('range', 1), { t: 'hp', v: 2 }], act: 'slowtime' },
  { id: 'big', keys: 'big large huge giant great enormous heavy fat massive vast immense colossal grand', color: '#c08040', shot: ['big'], stat: ['dmg'], noun: [{ t: 'hp', v: 2 }, S('dmg', 0.6), S('speed', -0.5)], act: 'haste' },
  { id: 'small', keys: 'small tiny little mini short minute petite slight wee miniature', color: '#a0e0c0', shot: ['tiny'], stat: ['tears'], noun: [S('size', 2), S('speed', 0.8)], act: 'shout' },
  { id: 'sharp', keys: 'sharp knife blade cut sword point needle spike pierce stab thorn dagger edge razor arrow spear', color: '#d0d8e8', shot: ['pierce'], stat: ['dmg'], noun: [shot('pierce'), S('dmg', 0.5)], act: 'shout' },
  { id: 'boom', keys: 'bomb explode explosion blast burst gun shoot cannon war weapon rocket missile grenade dynamite', color: '#ff5050', shot: ['explode'], stat: ['dmg'], noun: [{ t: 'give', k: 'bangs', v: 5 }, { t: 'blast' }], act: 'bombs' },
  { id: 'bounce', keys: 'ball bounce spring rubber jump hop leap elastic', color: '#f08ad0', shot: ['bounce'], stat: ['shotSpeed'], noun: [shot('bounce'), S('range', 0.5)], act: 'dash' },
  { id: 'seek', keys: 'seek search find hunt follow aim target track guide chase pursue detect scout', color: '#c070ff', shot: ['homing'], stat: ['luck'], noun: [shot('homing')], act: 'reveal' },
  { id: 'split', keys: 'split divide double two pair twin multiply break dual both half separate', color: '#70d0a0', shot: ['split'], stat: ['tears'], noun: [{ t: 'shot', f: 'multi' }, { t: 'mul', s: 'tears', v: 0.82 }], act: 'summon' },
  { id: 'many', keys: 'many several crowd swarm multiple three triple numerous lot plenty heap', color: '#e0a040', shot: ['multi'], stat: ['tears'], noun: [{ t: 'fam', f: 'shooter' }], act: 'summon' },
  { id: 'love', keys: 'love heart kiss friend sweet kind care hug darling affection fond tender adore dear', color: '#ff6a9a', shot: ['charm'], stat: ['luck'], noun: [{ t: 'hp', v: 2 }, { t: 'heal', v: 4 }], act: 'charm' },
  { id: 'fear', keys: 'fear scare afraid terror horror panic dread fright nightmare creepy', color: '#8a5aaa', shot: ['fear'], stat: ['speed'], noun: [shot('fear'), S('speed', 0.5)], act: 'fear' },
  { id: 'money', keys: 'money gold coin rich pay buy sell cash price trade bank wealth treasure fortune profit cost', color: '#f2c23e', shot: ['mark'], stat: ['luck'], noun: [{ t: 'give', k: 'glyphs', v: 15 }, { t: 'greed' }], act: 'glyphs' },
  { id: 'key', keys: 'key lock door open gate unlock latch vault', color: '#c8a060', shot: ['pierce'], stat: ['luck'], noun: [{ t: 'give', k: 'marks', v: 4 }, { t: 'compass' }], act: 'reveal' },
  { id: 'health', keys: 'heal health cure medicine doctor life live alive breath nurse remedy healthy vital well recover', color: '#ff4a5a', shot: ['leech'], stat: ['luck'], noun: [{ t: 'hp', v: 2 }, { t: 'heal', v: 6 }], act: 'heal' },
  { id: 'shield', keys: 'shield armor armour protect guard defend safe wall cover shelter fort helmet barrier', color: '#8ab4e8', shot: ['knock'], stat: ['range'], noun: [{ t: 'aegis' }], act: 'shield' },
  { id: 'wind', keys: 'wind air fly flight wing bird feather sky cloud breeze float soar glide', color: '#c0f0ff', shot: ['wavy'], stat: ['speed'], noun: [{ t: 'flight' }, S('speed', 0.4)], act: 'dash' },
  { id: 'earth', keys: 'stone rock earth ground iron metal hard solid steel mountain clay brick boulder', color: '#9a7a5a', shot: ['knock', 'big'], stat: ['dmg'], noun: [S('dmg', 0.7), { t: 'hp', v: 2 }], act: 'nuke' },
  { id: 'music', keys: 'music song sing sound loud noise drum melody tune chord voice choir rhythm bell', color: '#ffb0f0', shot: ['pierce', 'wavy'], stat: ['tears'], noun: [S('tears', 0.8)], act: 'shout' },
  { id: 'luck', keys: 'luck chance fortune random gamble dice game lucky fate bet lottery odds', color: '#50e0a0', shot: ['mark'], stat: ['luck'], noun: [S('luck', 2)], act: 'reroll' },
  { id: 'time', keys: 'time clock hour moment wait age old ancient past future year minute day history era', color: '#d0c0a0', shot: ['echo'], stat: ['tears'], noun: [S('tears', 0.7), shot('echo')], act: 'slowtime' },
  { id: 'magic', keys: 'magic spell wizard witch charm curse mystic wonder enchant sorcery mystery miracle', color: '#b070ff', shot: ['random'], stat: ['luck'], noun: [shot('random'), S('luck', 1)], act: 'random' },
  { id: 'mirror', keys: 'mirror reflect copy echo repeat image duplicate imitate twin reverse back', color: '#e0f0ff', shot: ['back'], stat: ['range'], noun: [{ t: 'fam', f: 'orbital' }], act: 'copy' },
  { id: 'spin', keys: 'circle round spin turn wheel orbit ring rotate whirl roll revolve loop', color: '#ffd080', shot: ['wavy'], stat: ['shotSpeed'], noun: [{ t: 'fam', f: 'orbital' }], act: 'shout' },
  { id: 'grow', keys: 'grow rise increase more expand swell gain develop bloom spread', color: '#80c060', shot: ['grow'], stat: ['range'], noun: [S('range', 0.6), S('dmg', 0.4)], act: 'haste' },
  { id: 'see', keys: 'see look eye watch view sight vision observe notice spot glance stare', color: '#ffffff', shot: ['homing'], stat: ['range'], noun: [{ t: 'map' }, S('range', 0.5)], act: 'reveal' },
  { id: 'travel', keys: 'travel journey road path way trip voyage map walk wander move go leave arrive', color: '#60b0e0', shot: ['fast'], stat: ['speed'], noun: [{ t: 'map' }, S('speed', 0.6)], act: 'teleport' },
  { id: 'ink', keys: 'book word letter write read page ink pen paper story language text print poem verse spelling', color: '#3a3f8b', shot: ['pierce'], stat: ['tears'], noun: [{ t: 'trail', f: 'ink' }, S('tears', 0.4)], act: 'random' },
  { id: 'anger', keys: 'anger angry rage fury mad hate furious wrath annoy temper hostile', color: '#e04040', shot: ['burn'], stat: ['dmg'], noun: [{ t: 'rage' }, S('dmg', 0.4)], act: 'haste' },
  { id: 'sad', keys: 'sad cry tear sorrow grief weep mourn gloomy unhappy misery lonely', color: '#7090ff', shot: ['big'], stat: ['tears'], noun: [S('tears', 1.4)], act: 'flood' },
  { id: 'joy', keys: 'joy happy glad cheer delight laugh smile fun merry play party celebrate', color: '#ffd040', shot: ['charm'], stat: ['luck'], noun: [S('luck', 1), S('speed', 0.5)], act: 'charm' },
  { id: 'fight', keys: 'fight battle attack strike hit punch kick blow beat combat struggle army soldier', color: '#c04040', shot: ['knock'], stat: ['dmg'], noun: [S('dmg', 1)], act: 'nuke' },
  { id: 'beast', keys: 'animal beast creature dog cat wolf bear lion tiger snake insect fish horse', color: '#b08a50', shot: ['leech'], stat: ['speed'], noun: [{ t: 'fam', f: 'chaser' }], act: 'summon' },
  { id: 'feast', keys: 'food eat meal bread fruit cake meat soup drink dinner sugar taste cook', color: '#f0a060', shot: ['leech'], stat: ['luck'], noun: [{ t: 'hp', v: 2 }, { t: 'heal', v: 2 }], act: 'heal' },
  { id: 'plant', keys: 'plant tree flower seed leaf root garden grass forest vine bush herb wood', color: '#5ab04a', shot: ['grow'], stat: ['range'], noun: [{ t: 'regen' }, S('range', 0.4)], act: 'haste' },
  { id: 'thorny', keys: 'thorn bramble cactus nettle barb prickly', color: '#6a8a3a', shot: ['pierce'], stat: ['dmg'], noun: [{ t: 'thorns' }], act: 'shout' },
  { id: 'company', keys: 'person people man woman child family group team crew member partner companion', color: '#e8b890', shot: ['multi'], stat: ['luck'], noun: [{ t: 'fam', f: 'shooter' }], act: 'summon' }
]
export const THEME = Object.fromEntries(THEMES.map((t) => [t.id, t]))

// Fallbacks when a word's meaning doesn't call up a theme: by topic, then by
// the word's own hash.
const TOPIC_THEMES = {
  animals: ['beast'], food: ['feast'], plants: ['plant'], body: ['fight', 'health', 'big', 'speed', 'sharp'],
  feelings: ['joy', 'sad', 'anger', 'love', 'fear'], nature: ['storm', 'water', 'wind', 'earth', 'ice', 'fire'],
  people: ['company'], things: ['shield', 'boom', 'key', 'sharp', 'money', 'spin', 'mirror'], places: ['travel', 'see', 'key'],
  motion: ['speed', 'bounce', 'travel', 'wind'], talk: ['music', 'ink', 'magic'], mind: ['seek', 'luck', 'see', 'magic', 'time'],
  describing: ['big', 'small', 'sharp', 'grow', 'magic', 'split', 'speed'], adverbs: ['speed', 'time', 'luck', 'music', 'grow']
}
const STRONG_TOPICS = new Set(['animals', 'food', 'plants', 'people'])
const ANY = ['fight', 'speed', 'luck', 'grow', 'sharp', 'split', 'magic', 'ink', 'spin', 'see', 'shield', 'time']

// The words of every theme, by stem, for matching.
const KEYMAP = new Map()
for (const t of THEMES) for (const k of t.keys.split(' ')) if (!KEYMAP.has(k)) KEYMAP.set(k, t.id)
const stems = (w) => {
  const out = [w]
  for (const suf of ['s', 'es', 'ed', 'd', 'ing', 'ly', 'er', 'est', 'y', 'ness', 'ful', 'ous', 'en', 'ish']) if (w.length > suf.length + 2 && w.endsWith(suf)) out.push(w.slice(0, -suf.length))
  if (w.endsWith('ied') || w.endsWith('ies')) out.push(w.slice(0, -3) + 'y')
  return out
}
const themeOf = (token) => { for (const s of stems(token)) { const t = KEYMAP.get(s); if (t) return t } return null }

// Which theme a word belongs to: what its own letters say counts most, then
// its definitions; nothing found, its topic.
export function pickTheme (word, info) {
  const score = {}
  const add = (tok, w) => { const t = themeOf(tok); if (t) score[t] = (score[t] || 0) + w }
  for (const part of word.toLowerCase().split(/[^a-z]+/)) add(part, 5)
  ;(info?.senses || []).slice(0, 3).forEach((s, i) => {
    for (const tok of String(s.def || '').toLowerCase().split(/[^a-z]+/)) if (tok.length > 2) add(tok, i === 0 ? 1.4 : 0.8)
  })
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0]
  const topic = info?.topics?.[0]
  // Animals, food, plants and people are what they are, unless the word
  // itself says otherwise ("firefly").
  if (STRONG_TOPICS.has(topic) && !(best && best[1] >= 5)) return TOPIC_THEMES[topic][0]
  if (best && best[1] >= 1.4) return best[0]
  const list = TOPIC_THEMES[topic] || ANY
  return list[Math.floor(hash01(`${word}:fallback`) * list.length)]
}

// Scrabble points, for a word's weight.
const PTS = { a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10 }
export const letterPoints = (w) => [...w.toLowerCase()].reduce((a, c) => a + (PTS[c] || 0), 0)

// Quality 0–4: mostly luck of the letters, nudged up by long and heavy words.
export function qualityOf (word) {
  const h = hash01(`${word}:q`)
  let q = h < 0.3 ? 0 : h < 0.6 ? 1 : h < 0.82 ? 2 : h < 0.95 ? 3 : 4
  if (word.length >= 10 || letterPoints(word) >= 22) q = Math.min(4, q + 1)
  return q
}

const DRAWBACKS = [
  { t: 'stat', s: 'speed', v: -0.12 }, { t: 'stat', s: 'luck', v: -1 }, { t: 'mul', s: 'tears', v: 0.88 },
  { t: 'stat', s: 'range', v: -0.2 }, { t: 'stat', s: 'shotSpeed', v: -0.15 }
]

// One word, as an item. info: what the dictionary says (senses, topics);
// r: your rating of it.
export function itemFor (word, info, r) {
  const pos = info?.senses?.[0]?.pos || 'n'
  const theme = THEME[pickTheme(word, info)]
  const q = qualityOf(word)
  const m = QMUL[q]
  const kind = pos === 'v' ? 'active' : 'passive'
  const flavor = r == null ? null : r >= 4 ? 'blessed' : r <= 1 ? 'cursed' : null
  const second = THEMES[Math.floor(hash01(`${word}:2`) * THEMES.length)]
  let fx = []
  let active = null
  const stat = (s, k = 1) => ({ t: 'stat', s, v: r1(STAT_UNIT[s] * m * k) })
  const resolve = (f) => (f.t === 'stat' && f.k !== undefined ? stat(f.s, f.k) : { ...f })
  if (pos === 'a' || pos === 's') {
    fx = theme.shot.map(shot)
    if (q >= 2) fx.push(stat(theme.stat[0], 0.5))
    if (q >= 4) fx.push(shot(second.shot[0]))
  } else if (pos === 'r') {
    fx = [stat(theme.stat[0], 1.2)]
    if (q >= 3) fx.push(stat(second.stat[0], 0.6))
  } else if (pos === 'v') {
    const a = theme.act
    active = { a, charge: Math.max(1, ACTIVES[a].charge - (q >= 3 ? 1 : 0)), p: r1(m) }
  } else {
    fx = theme.noun.map(resolve)
    if (q >= 3) fx.push(stat(theme.stat[0], 0.5))
  }
  if (flavor === 'blessed') fx.push({ t: 'soul', v: 1 })
  if (flavor === 'cursed') {
    fx = fx.map((f) => (typeof f.v === 'number' && f.v > 0 && f.t !== 'mul' ? { ...f, v: r1(f.v * 1.6) } : f))
    if (active) active = { ...active, p: r1(active.p * 1.5), cost: 1 }
    else fx.push(DRAWBACKS[Math.floor(hash01(`${word}:curse`) * DRAWBACKS.length)])
  }
  const def = String(info?.senses?.[0]?.def || '').replace(/\s*\(.*?\)\s*/g, ' ').trim()
  return {
    id: word, word, pos, kind, q, flavor, r: r ?? null, theme: theme.id, color: theme.color,
    topic: info?.topics?.[0] || null, def: def.length > 70 ? `${def.slice(0, 67).replace(/\s+\S*$/, '')}…` : def,
    fx, active
  }
}

// --- describing an item ------------------------------------------------------------
const STAT_NAMES = { dmg: 'Damage', tears: 'Fire rate', speed: 'Speed', range: 'Range', shotSpeed: 'Shot speed', luck: 'Luck', size: 'Size' }
const SHOT_NAMES = {
  burn: 'Burning shots', slow: 'Slowing shots', poison: 'Poison shots', chain: 'Shots arc lightning', wavy: 'Wavy shots', pierce: 'Piercing shots',
  spectral: 'Shots pass through walls of books', fear: 'Frightening shots', charm: 'Charming shots', big: 'Bigger shots', tiny: 'Tiny, quick shots',
  explode: 'Exploding shots', bounce: 'Bouncing shots', homing: 'Homing shots', split: 'Shots split on impact', multi: 'One more shot at a time',
  back: 'A shot out the back too', knock: 'Shots knock back', leech: 'Shots can heal you', mark: 'Critical hits', grow: 'Shots grow as they fly',
  echo: 'Every shot echoes', random: 'A random effect on every shot', fast: 'Fast shots'
}
export function describeFx (f) {
  switch (f.t) {
    case 'stat': return `${STAT_NAMES[f.s]} ${f.s === 'size' ? (f.v < 0 ? 'down' : 'up') : f.v >= 0 ? 'up' : 'down'}`
    case 'mul': return `${STAT_NAMES[f.s]} ${f.v >= 1 ? 'up' : 'down'}`
    case 'shot': return SHOT_NAMES[f.f] || 'Strange shots'
    case 'hp': return f.v > 0 ? 'Heart up' : 'Heart down'
    case 'soul': return 'A margin heart'
    case 'heal': return 'Heals'
    case 'give': return { bangs: `${f.v} bangs`, marks: `${f.v} bookmarks`, glyphs: `${f.v} glyphs` }[f.k]
    case 'flight': return 'Flight'
    case 'fam': return { shooter: 'A little helper who shoots', orbital: 'Something circles you, blocking shots', chaser: 'A pet that chases enemies', u: 'u follows you and shoots' }[f.f]
    case 'aegis': return 'A shield that takes one hit a room'
    case 'trail': return f.f === 'poison' ? 'You leave a poison trail' : 'You leave a trail of ink that hurts'
    case 'regen': return 'Heals a little every few rooms'
    case 'rage': return 'Getting hit makes you angry (damage up for the room)'
    case 'greed': return 'More glyphs'
    case 'map': return 'Shows the floor'
    case 'compass': return 'Shows the special rooms'
    case 'thorns': return 'Enemies that touch you get hurt'
    case 'blast': return 'Bigger bangs'
    default: return ''
  }
}
export function describe (item) {
  const parts = item.active ? [ACTIVES[item.active.a].text, `${item.active.charge} room${item.active.charge === 1 ? '' : 's'} to charge`] : []
  if (item.active?.cost) parts.push('Costs half a heart to use')
  const seen = new Set()
  for (const f of item.fx) { const d = describeFx(f); if (d && !seen.has(d)) { seen.add(d); parts.push(d) } }
  return parts
}
// The short line under the name when you pick it up.
export const tagline = (item) => describe(item).slice(0, 2).join(' · ')

// --- transformations ---------------------------------------------------------------
// Three items from one topic and you become something else (five for
// describing words and adverbs, which are everywhere).
export const TRANSFORMS = {
  animals: { name: 'Bestiary', text: 'A pack of pets hunts with you', fx: [{ t: 'fam', f: 'chaser' }, { t: 'fam', f: 'chaser' }, { t: 'stat', s: 'speed', v: 0.15 }] },
  food: { name: 'Cookbook', text: 'Two hearts up and a full belly', fx: [{ t: 'hp', v: 4 }, { t: 'heal', v: 99 }] },
  plants: { name: 'Herbarium', text: 'You heal as you go, and bristle with thorns', fx: [{ t: 'regen' }, { t: 'regen' }, { t: 'thorns' }] },
  body: { name: 'Anatomy', text: 'Damage up, and enemies that touch you get hurt', fx: [{ t: 'stat', s: 'dmg', v: 1.2 }, { t: 'thorns' }] },
  feelings: { name: 'Diary', text: 'Your shots charm or frighten, and come faster', fx: [{ t: 'shot', f: 'charm' }, { t: 'shot', f: 'fear' }, { t: 'stat', s: 'tears', v: 0.6 }] },
  nature: { name: 'Almanac', text: 'Lightning strikes your enemies', fx: [{ t: 'lightning' }, { t: 'shot', f: 'chain' }] },
  people: { name: 'Who’s Who', text: 'Friends join you', fx: [{ t: 'fam', f: 'shooter' }, { t: 'fam', f: 'shooter' }] },
  things: { name: 'Catalogue', text: 'Pickups come to you, and a shield circles', fx: [{ t: 'magnet' }, { t: 'fam', f: 'orbital' }, { t: 'aegis' }] },
  places: { name: 'Atlas', text: 'You know every floor by heart', fx: [{ t: 'map' }, { t: 'compass' }, { t: 'stat', s: 'speed', v: 0.2 }] },
  motion: { name: 'Flipbook', text: 'You fly, and fast', fx: [{ t: 'flight' }, { t: 'stat', s: 'speed', v: 0.3 }] },
  talk: { name: 'Phrasebook', text: 'Your shots pierce and spread', fx: [{ t: 'shot', f: 'pierce' }, { t: 'shot', f: 'multi' }] },
  mind: { name: 'Encyclopedia', text: 'Luck up, and every shot homes in', fx: [{ t: 'stat', s: 'luck', v: 3 }, { t: 'shot', f: 'homing' }] },
  describing: { name: 'Style Guide', need: 5, text: 'Your shots burn, slow and poison', fx: [{ t: 'shot', f: 'burn' }, { t: 'shot', f: 'slow' }, { t: 'shot', f: 'poison' }] },
  adverbs: { name: 'Usage Notes', need: 5, text: 'Everything up', fx: ['dmg', 'tears', 'speed', 'range', 'shotSpeed'].map((s) => ({ t: 'stat', s, v: STAT_UNIT[s] })) }
}

// --- a run's pool ------------------------------------------------------------------
// A run draws from a sample of the words you've rated (as many as a big
// roguelike has items), the same sample from the same seed.
export function sampleWords (words, seed, n) {
  return new Rng(`${seed}:pool`).shuffle(words).slice(0, n)
}

// A plain item for when a pool runs dry: a blank page, a heart up.
export const BLANK_PAGE = { id: '_blank', word: 'blank page', pos: 'n', kind: 'passive', q: 0, flavor: null, r: null, theme: 'ink', color: '#f6f1e4', topic: null, def: 'Nothing written here yet.', fx: [{ t: 'hp', v: 2 }, { t: 'heal', v: 2 }], active: null }
