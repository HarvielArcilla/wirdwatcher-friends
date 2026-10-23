// Wirdlike: what the game is made of, apart from the words themselves.
// The room size, the chapters you go down through, the characters (and the
// heads they lend your profile), and what progress unlocks: characters,
// badges and looks.

// --- the room ---------------------------------------------------------------------
// A room is 13 × 7 tiles inside a wall one tile thick. Everything in the
// game is measured in these units; the screen scales it to fit.
export const TILE = 40
export const COLS = 13
export const ROWS = 7
export const WALL = 40
export const ROOM_W = COLS * TILE + WALL * 2 // 600
export const ROOM_H = ROWS * TILE + WALL * 2 // 360

// Tiles inside a room.
export const T = { FLOOR: 0, BLOCK: 1, PIT: 2, SPIKE: 3, POT: 4, TINTED: 5, FIRE: 6, METAL: 7 }

// --- chapters and floors ------------------------------------------------------------
// Down through the book: the margins, the index, the stacks, the archive,
// the press where it's all printed, and what was never written at all.
export const CHAPTERS = [
  { id: 'margins', name: 'The Margins', floor: '#f6f1e4', line: '#a9c6e8', accent: '#e06a6a', wall: '#d9cdb0', wallDark: '#b8a888', ink: '#2b3050', dark: false },
  { id: 'index', name: 'The Index', floor: '#ead8b8', line: '#c8a878', accent: '#8a5a2a', wall: '#8a5a32', wallDark: '#5a3a1e', ink: '#3a2414', dark: false },
  { id: 'stacks', name: 'The Stacks', floor: '#5a4030', line: '#4a3426', accent: '#d8a050', wall: '#3a2618', wallDark: '#24160c', ink: '#f2e6cc', dark: true },
  { id: 'archive', name: 'The Archive', floor: '#3a4256', line: '#323a4c', accent: '#8ab4e8', wall: '#262c3c', wallDark: '#161a26', ink: '#dfe6f4', dark: true },
  { id: 'press', name: 'The Printing Press', floor: '#4a4a4e', line: '#3a3a3e', accent: '#e04848', wall: '#2a2a2e', wallDark: '#18181a', ink: '#f0f0f0', dark: true },
  { id: 'unwritten', name: 'The Unwritten', floor: '#121216', line: '#1c1c24', accent: '#b8a8ff', wall: '#060608', wallDark: '#000', ink: '#e8e4ff', dark: true }
]

export const FLOORS = [
  { ch: 0, name: 'The Margins I' }, { ch: 0, name: 'The Margins II' },
  { ch: 1, name: 'The Index I' }, { ch: 1, name: 'The Index II' },
  { ch: 2, name: 'The Stacks I' }, { ch: 2, name: 'The Stacks II' },
  { ch: 3, name: 'The Archive I' }, { ch: 3, name: 'The Archive II' },
  { ch: 4, name: 'The Printing Press', final: 'redpen' },
  { ch: 5, name: 'The Unwritten', final: 'autocorrect' }
]

// The bosses each chapter can send, all word trouble. The two finals stand
// alone. Grammar sins turn up as minibosses.
export const CHAPTER_BOSSES = [
  ['runon', 'typo', 'ellipsis', 'lorem'],
  ['palindrome', 'homophones', 'anagram', 'widow'],
  ['rex', 'silent', 'oxymoron', 'spoonerism'],
  ['passive', 'longest', 'redundancy', 'malaprop'],
  ['redpen'],
  ['autocorrect']
]
export const SINS = ['sinRunon', 'sinFragment', 'sinSplice', 'sinDouble', 'sinDangling', 'sinSplit', 'sinApostrophe']
export const NAMED_BOSSES = CHAPTER_BOSSES.flat()

// --- characters --------------------------------------------------------------------
// Each is a letter (or a mark) with a body and a head. `stats` are added to
// the base: damage 3.5, 2.7 shots a second, speed 1, range 1, shot speed 1.
// `unlock` names a goal below (none: there from the start).
export const BASE_STATS = { dmg: 3.5, tears: 2.7, speed: 1, range: 1, shotSpeed: 1, luck: 0, size: 1 }

export const CHARACTERS = [
  { id: 'wirdo', name: 'Wirdo', glyph: 'i', color: '#2c3160', blurb: 'A lowercase i who fell into the margins. Cries ink.', hp: 6, soul: 0, stats: {}, start: {}, unlock: null },
  { id: 'q', name: 'Q', glyph: 'q', color: '#e8904a', blurb: 'Never goes anywhere without u. u shoots too.', hp: 6, soul: 0, stats: { dmg: -0.3 }, start: { fam: ['u'] }, unlock: 'firstBoss' },
  { id: 'x', name: 'X', glyph: 'x', color: '#d84a4a', blurb: 'Marks the spot. Starts with five bangs; its own blasts don’t hurt it.', hp: 4, soul: 2, stats: { dmg: 0.7, tears: -0.4 }, start: { bangs: 5, blastproof: true }, unlock: 'bangs25' },
  { id: 'o', name: 'O', glyph: 'o', color: '#e8b830', blurb: 'Round, slow and hard to knock over. Big round shots.', hp: 10, soul: 0, stats: { speed: -0.15, tears: -0.35, size: 0.25 }, start: { shot: ['big'] }, unlock: 'reachStacks' },
  { id: 'z', name: 'Z', glyph: 'z', color: '#8a72d8', blurb: 'Last in the alphabet, first out the door. Fast and fragile.', hp: 4, soul: 0, stats: { speed: 0.3, tears: 0.9, dmg: -0.7 }, start: {}, unlock: 'beatArchive' },
  { id: 'query', name: '?', glyph: '?', color: '#4aae80', blurb: 'Nobody knows what it brings. A random active and a random word to start.', hp: 6, soul: 0, stats: { luck: 1 }, start: { randomActive: true, randomItem: true }, unlock: 'beatRedpen' }
]
export const character = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0]

// Heads, drawn the same way in the game and on your profile (as SVG paths in
// a 64 × 64 box). `$c` is the character's colour.
const EYES = [
  { d: 'M20 32a5 6 0 1 0 10 0a5 6 0 1 0 -10 0Z', fill: '#fff' },
  { d: 'M34 32a5 6 0 1 0 10 0a5 6 0 1 0 -10 0Z', fill: '#fff' },
  { d: 'M23 33a2.6 3.2 0 1 0 5.2 0a2.6 3.2 0 1 0 -5.2 0Z', fill: '#16162a' },
  { d: 'M37 33a2.6 3.2 0 1 0 5.2 0a2.6 3.2 0 1 0 -5.2 0Z', fill: '#16162a' }
]
const SKULL = { d: 'M32 12a22 22 0 1 0 0.01 0Z', fill: '$c' }
const SHINE = { d: 'M17 22a6 4 -30 1 0 8 -5a6 4 -30 1 0 -8 5Z', fill: 'rgba(255,255,255,.28)' }
const SMILE = { d: 'M26 43q6 5 12 0', stroke: '#16162a', w: 2.4 }
export const HEADS = {
  wirdo: [SKULL, SHINE, ...EYES, SMILE, { d: 'M45 39q2 4 0 7q-2 -3 0 -7Z', fill: '#7ab8ff' }],
  q: [SKULL, SHINE, ...EYES, SMILE, { d: 'M44 46q8 4 12 12', stroke: '$c', w: 6 }, { d: 'M44 46q8 4 12 12', stroke: 'rgba(0,0,0,.18)', w: 2 }],
  x: [SKULL, SHINE, ...EYES, { d: 'M27 44h10', stroke: '#16162a', w: 2.4 }, { d: 'M12 18l12 10M24 18l-12 10', stroke: '#f4e6c8', w: 5 }, { d: 'M12 18l12 10M24 18l-12 10', stroke: 'rgba(0,0,0,.15)', w: 1 }],
  o: [{ d: 'M32 9a25 25 0 1 0 0.01 0Z', fill: '$c' }, SHINE, ...EYES, { d: 'M28.5 45a3.5 4.5 0 1 0 7 0a3.5 4.5 0 1 0 -7 0Z', fill: '#16162a' }],
  z: [SKULL, SHINE, { d: 'M20 33q5 -4 10 0', stroke: '#16162a', w: 2.6 }, { d: 'M34 33q5 -4 10 0', stroke: '#16162a', w: 2.6 }, SMILE, { d: 'M22 13l10 -7l-2 7l10 -6', stroke: '$c', w: 5 }, { d: 'M46 10h7l-7 8h7', stroke: '#16162a', w: 2 }],
  query: [SKULL, SHINE, ...EYES, { d: 'M34 25l9 -3', stroke: '#16162a', w: 2.4 }, { d: 'M27 44q6 3 10 -1', stroke: '#16162a', w: 2.4 }, { d: 'M26 9q0 -7 7 -7q7 0 7 6q0 5 -7 6v4', stroke: '$c', w: 5 }]
}
export const FACE_IDS = CHARACTERS.map((c) => `wl-${c.id}`)

// --- progress -----------------------------------------------------------------------
// What you've done across runs (kept on this computer), the goals it meets,
// and what each goal unlocks. `wl` on a look names its goal.
export const blankProgress = () => ({
  runs: 0, deaths: 0, wins: 0, deepWins: 0, bossKills: 0, bosses: {}, sins: {}, deepest: 0,
  bangsUsed: 0, itemsFound: {}, transforms: {}, chars: { wirdo: true }, marks: {}, noHitBosses: 0,
  bestTime: null, winStreak: 0, bestStreak: 0, rooms: 0, kills: 0
})

const count = (o) => Object.keys(o || {}).length
export const WL_GOALS = {
  firstRun: { text: 'Play a run of Wirdlike', test: (p) => p.runs >= 1 },
  firstBoss: { text: 'Beat a boss in Wirdlike', test: (p) => p.bossKills >= 1 },
  bangs25: { text: 'Set off 25 bangs in Wirdlike', test: (p) => p.bangsUsed >= 25 },
  reachStacks: { text: 'Reach The Stacks in Wirdlike', test: (p) => p.deepest >= 4 },
  beatArchive: { text: 'Beat the boss of The Archive II', test: (p) => p.deepest >= 8 },
  beatRedpen: { text: 'Beat The Red Pen', test: (p) => p.wins >= 1 },
  beatAuto: { text: 'Beat Autocorrect in The Unwritten', test: (p) => p.deepWins >= 1 },
  bosses10: { text: 'Beat 10 bosses in Wirdlike', test: (p) => p.bossKills >= 10 },
  allBosses: { text: 'Beat every named boss in Wirdlike', test: (p) => NAMED_BOSSES.every((b) => p.bosses[b]) },
  allSins: { text: 'Beat all seven grammar sins', test: (p) => SINS.every((b) => p.sins[b]) },
  transform: { text: 'Transform in a Wirdlike run', test: (p) => count(p.transforms) >= 1 },
  transform5: { text: 'Transform five different ways', test: (p) => count(p.transforms) >= 5 },
  items100: { text: 'Find 100 different words as items', test: (p) => count(p.itemsFound) >= 100 },
  items500: { text: 'Find 500 different words as items', test: (p) => count(p.itemsFound) >= 500 },
  noHit: { text: 'Beat a Wirdlike boss without being hit', test: (p) => p.noHitBosses >= 1 },
  redpen3: { text: 'Beat The Red Pen with three characters', test: (p) => Object.values(p.marks).filter((m) => m.redpen).length >= 3 },
  allMarks: { text: 'Beat The Red Pen with every character', test: (p) => CHARACTERS.every((c) => p.marks[c.id]?.redpen) },
  streak3: { text: 'Win three Wirdlike runs in a row', test: (p) => p.bestStreak >= 3 },
  // Faces: one per character, the moment you have them.
  ...Object.fromEntries(CHARACTERS.map((c) => [`char-${c.id}`, { text: c.unlock ? `Unlock ${c.name} in Wirdlike` : 'Play a run of Wirdlike', test: c.unlock ? (p) => Boolean(p.chars[c.id]) : (p) => p.runs >= 1 }]))
}

const look = (kind, id, name, goal, desc, extra = {}) => ({ kind, id, name, price: null, rarity: 'wirdlike', wl: goal, desc, ...extra })
export const WIRDLIKE_COSMETICS = [
  ...CHARACTERS.map((c) => look('face', `wl-${c.id}`, `${c.name}’s head`, `char-${c.id}`, `From Wirdlike. ${c.name} wears your frame.`, { head: c.id })),
  look('title', 'wl-cellar', 'Margin dweller', 'firstRun', 'From Wirdlike.', { text: 'Margin dweller' }),
  look('frame', 'wl-ruled', 'Ruled paper', 'firstBoss', 'From Wirdlike. Blue lines and a red margin.', { ring: ['#a9c6e8', '#f6f1e4', '#a9c6e8', '#f6f1e4', '#e06a6a', '#f6f1e4', '#a9c6e8'] }),
  look('cardBack', 'wl-floorplan', 'Floor plan', 'reachStacks', 'From Wirdlike. A map of rooms, one secret.', { back: 'linear-gradient(#24160c 0 0) 50% 50% / 30% 30% no-repeat, linear-gradient(#5a4030 0 0) 50% 15% / 22% 22% no-repeat, linear-gradient(#5a4030 0 0) 15% 50% / 22% 22% no-repeat, linear-gradient(#5a4030 0 0) 85% 50% / 22% 22% no-repeat, linear-gradient(#e8b830 0 0) 50% 85% / 22% 22% no-repeat, #d8a050' }),
  look('title', 'wl-scholar', 'Rogue scholar', 'bosses10', 'From Wirdlike.', { text: 'Rogue scholar' }),
  look('name', 'wl-redink', 'Red ink', 'beatRedpen', 'From Wirdlike. Corrected, in red.', { grad: ['#e04848', '#ff8a7a', '#b81e1e', '#e04848'], move: true }),
  look('title', 'wl-edited', 'Survived the edit', 'beatRedpen', 'From Wirdlike.', { text: 'Survived the edit' }),
  look('frame', 'wl-redpen', 'Red pen', 'redpen3', 'From Wirdlike. A ring of corrections.', { ring: ['#e04848', '#ffd0c8', '#e04848', '#b81e1e', '#e04848'], spin: true }),
  look('title', 'wl-autocorrected', 'Autocorrected', 'beatAuto', 'From Wirdlike.', { text: 'Autocorrected' }),
  look('table', 'wl-unwritten', 'The Unwritten', 'beatAuto', 'From Wirdlike. Black paper with words not yet written.', { felt: 'radial-gradient(circle at 20% 30%, rgba(184,168,255,.18) 0 2px, transparent 3px) 0 0 / 38px 38px, radial-gradient(circle at 70% 60%, rgba(184,168,255,.12) 0 2px, transparent 3px) 0 0 / 52px 52px, radial-gradient(ellipse at 50% 40%, #1c1c26, #060608 70%)', rim: '#2a2440', dark: true }),
  look('confetti', 'wl-ink', 'Ink everywhere', 'items100', 'From Wirdlike. Pens, nibs and splashes.', { emoji: ['✒️', '🖋️', '💧', '📝'] }),
  look('title', 'wl-lexicon', 'Walking arsenal', 'items500', 'From Wirdlike.', { text: 'Walking arsenal' }),
  look('frame', 'wl-bestiary', 'Bestiary', 'allBosses', 'From Wirdlike. Every boss, bested.', { ring: ['#e06a6a', '#8a5a2a', '#d8a050', '#8ab4e8', '#e04848', '#b8a8ff', '#e06a6a'], spin: true }),
  look('title', 'wl-sinless', 'Grammatically pure', 'allSins', 'From Wirdlike.', { text: 'Grammatically pure' }),
  look('cardBack', 'wl-catalog', 'Card catalogue', 'transform', 'From Wirdlike. Drawers of index cards.', { back: 'repeating-linear-gradient(0deg, #8a5a32 0 3px, #ead8b8 3px 22px), #ead8b8' }),
  look('title', 'wl-shifter', 'Shapeshifter', 'transform5', 'From Wirdlike.', { text: 'Shapeshifter' }),
  look('title', 'wl-untouchable', 'Untouchable', 'noHit', 'From Wirdlike.', { text: 'Untouchable' }),
  look('frame', 'wl-gilt', 'Gilt edges', 'allMarks', 'From Wirdlike. Gold-edged pages, every character.', { ring: ['#fff4c2', '#f2c23e', '#b07a12', '#f2c23e', '#fff4c2'], spin: true }),
  look('name', 'wl-streak', 'Bound in leather', 'streak3', 'From Wirdlike. Three wins in a row.', { grad: ['#d8a050', '#8a5a2a', '#f2c23e', '#d8a050'], move: true })
]

// Badges, checked with the rest (see src/shared/progress.js). The numbers
// come from Wirdlike progress via game stats, prefixed wl.
export const WIRDLIKE_BADGES = [
  { id: 'wl-run', emoji: '🕳️', name: 'Down the margin', hint: 'Play a run of Wirdlike.', test: (s) => s.wlRuns >= 1 },
  { id: 'wl-boss', emoji: '✏️', name: 'First edit', hint: 'Beat a boss in Wirdlike.', test: (s) => s.wlBossKills >= 1 },
  { id: 'wl-stacks', emoji: '📚', name: 'Deep reader', hint: 'Reach The Stacks in Wirdlike.', test: (s) => s.wlDeepest >= 4 },
  { id: 'wl-redpen', emoji: '🖍️', name: 'Red-penned', hint: 'Beat The Red Pen.', test: (s) => s.wlWins >= 1 },
  { id: 'wl-auto', emoji: '🤖', name: 'Did you mean…', hint: 'Beat Autocorrect in The Unwritten.', test: (s) => s.wlDeepWins >= 1 },
  { id: 'wl-bosses', emoji: '👹', name: 'Bestiary', hint: 'Beat every named boss in Wirdlike.', test: (s) => s.wlAllBosses >= 1 },
  { id: 'wl-transform', emoji: '🦋', name: 'Metamorphosis', hint: 'Transform in a Wirdlike run.', test: (s) => s.wlTransforms >= 1 },
  { id: 'wl-items', emoji: '🎒', name: 'Lexical arsenal', hint: 'Find 100 different words as items.', test: (s) => s.wlItems >= 100 },
  { id: 'wl-cast', emoji: '🎭', name: 'Full cast', hint: 'Unlock every Wirdlike character.', test: (s) => s.wlChars >= CHARACTERS.length },
  { id: 'wl-nohit', emoji: '🛡️', name: 'Untouchable', hint: 'Beat a Wirdlike boss without being hit.', test: (s) => s.wlNoHit >= 1 }
]

export const MIN_RATED = 25 // words you need to have rated to play
export const POOL_SIZE = 720 // words sampled into a run's item pool
