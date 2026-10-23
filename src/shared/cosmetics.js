// Everything the shop sells. All of it is for show: nothing here changes a
// score, a rating or what anything pays. Cosmetics are kept forever,
// through every prestige.
//
// Who sees what:
//   table     - the felt in a lobby you host; everyone at the table sees it
//   frame     - around your face, everywhere others see you (seats, friends)
//   cardBack  - your face-down card in lobbies
//   title     - under your name in lobbies and on your profile
//   name      - how your name is drawn at the table and in chat
//   confetti  - your celebrations (just you)
//   coin      - your coin in the coinflip (just you)
//   face      - your face itself: your initial, or a head from Wirdlike
//
// A few things can't be bought: levels bring some (marked `level`), each
// edition you publish (prestige) earns
// its own, marked `edition`, and some titles come with badges, marked
// `badge` (yours the moment you earn the badge).

export const KINDS = [
  { id: 'room', name: 'Rooms', blurb: 'Where the table stands. Everyone sees your room when you host.', seen: 'everyone at your table' },
  { id: 'table', name: 'Tables', blurb: 'The felt everyone sees when you host.', seen: 'everyone at your table' },
  { id: 'face', name: 'Faces', blurb: 'Your face, wherever friends see you: your initial, or a head you’ve unlocked in Wirdlike. Your frame goes around it.', seen: 'everyone' },
  { id: 'frame', name: 'Frames', blurb: 'Around your face, wherever friends see you.', seen: 'everyone' },
  { id: 'cardBack', name: 'Card backs', blurb: 'Your face-down card at the table.', seen: 'everyone at the table' },
  { id: 'title', name: 'Titles', blurb: 'Under your name at the table and on your profile.', seen: 'everyone' },
  { id: 'name', name: 'Name styles', blurb: 'How your name looks at the table and in chat.', seen: 'everyone at the table' },
  { id: 'reactions', name: 'Reactions', blurb: 'Four more reactions on your bar at the table.', seen: 'everyone at the table' },
  { id: 'confetti', name: 'Confetti', blurb: 'What bursts out when a word deserves it.', seen: 'you' },
  { id: 'coin', name: 'Coins', blurb: 'The coin you flip.', seen: 'you' }
]

import { MORE_COSMETICS } from './cosmetics-more.js'
import { VALLEY_COSMETICS } from './cosmetics-valley.js'
import { WIRDLIKE_COSMETICS } from './wirdlike/content.js'

const R = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', edition: 'Edition', badge: 'Badge', level: 'Level', valley: 'Wird Valley', wirdlike: 'Wirdlike' }

const item = (kind, id, name, price, rarity, desc, extra = {}) => ({ kind, id, name, price, rarity, desc, ...extra })
const earned = (id, text, badge, hint) => item('title', id, text, null, 'badge', hint, { badge, text })
// Rewards for reaching a level: yours from that level on.
const atLevel = (level, kind, id, name, desc, extra = {}) => item(kind, id, name, null, 'level', `Reach level ${level}. ${desc}`, { level, ...extra })
export const LEVEL_REWARDS = [
  atLevel(5, 'frame', 'bookmark', 'Bookmark', 'A ribbon marking your place.'),
  atLevel(10, 'title', 'wellread', 'Well read', '', { text: 'Well read' }),
  atLevel(15, 'cardBack', 'librarycard', 'Library card', 'Stamped and dated.'),
  atLevel(20, 'table', 'scholar', 'Scholar’s desk', 'Green leather and brass.'),
  atLevel(25, 'room', 'observatory', 'Observatory', 'A telescope and the night sky.'),
  atLevel(30, 'name', 'calligraphy', 'Calligraphy', 'Your name, beautifully written.'),
  atLevel(35, 'confetti', 'quills', 'Quills and scrolls', 'Writerly confetti.', { emoji: ['🪶', '📜', '✒️'] }),
  atLevel(40, 'frame', 'goldlaurel', 'Golden laurels', 'For a true champion of words.'),
  atLevel(45, 'coin', 'platinum', 'Platinum', 'Heavier than it looks.'),
  atLevel(50, 'title', 'sage', 'Wird Sage', '', { text: 'Wird Sage' }),
  atLevel(75, 'frame', 'aurora', 'Aurora', 'Northern lights around you.'),
  atLevel(100, 'title', 'centenarian', 'Centenarian', '', { text: 'Centenarian' })
]

// Only in card packs (see packs.js): titles and confetti with a card-table air.
const inPack = (kind, id, name, rarity, desc, extra = {}) => item(kind, id, name, null, rarity, `Only in card packs. ${desc}`, { pack: true, ...extra })
export const PACK_ONLY = [
  inPack('title', 'shuffler', 'Card shuffler', 'common', '', { text: 'Card shuffler' }),
  inPack('title', 'mint', 'Mint condition', 'common', '', { text: 'Mint condition' }),
  inPack('title', 'pulls', 'Lucky pulls', 'rare', '', { text: 'Lucky pulls' }),
  inPack('title', 'holo', 'Holo hunter', 'rare', '', { text: 'Holo hunter' }),
  inPack('title', 'sealed', 'Still sealed', 'epic', '', { text: 'Still sealed' }),
  inPack('title', 'shark', 'Card shark', 'epic', '', { text: 'Card shark' }),
  inPack('title', 'grail', 'Pulled the grail', 'legendary', '', { text: 'Pulled the grail' }),
  inPack('confetti', 'cards', 'Fifty-two pickup', 'rare', 'Playing cards everywhere.', { emoji: ['🃏', '♠️', '♥️', '♦️', '♣️'] }),
  inPack('confetti', 'foil', 'Foil shards', 'epic', 'Glittering scraps of foil.', { emoji: ['✨', '💠', '🔷'] }),
  inPack('confetti', 'gems', 'Gem rain', 'legendary', 'Precious stones, falling.', { emoji: ['💎', '💍', '👑'] })
]

export const COSMETICS = [
  ...LEVEL_REWARDS,
  ...PACK_ONLY,
  // Rooms
  item('room', 'plain', 'Plain', 0, 'common', 'Just your theme.', { free: true }),
  item('room', 'study', 'Cozy study', 8000, 'common', 'Warm wood and a reading lamp.'),
  item('room', 'cafe', 'Corner café', 30000, 'common', 'Checkered floor, espresso smell.'),
  item('room', 'garden', 'Garden party', 120000, 'rare', 'Grass, flowers and fairy lights.'),
  item('room', 'beach', 'Beach day', 400000, 'rare', 'Sand, sea and a sunny sky.'),
  item('room', 'library', 'Grand library', 1.5e6, 'rare', 'Shelves to the ceiling.'),
  item('room', 'snow', 'Snowed in', 6e6, 'epic', 'A cabin with snow falling outside.'),
  item('room', 'sea', 'Under the sea', 2.5e7, 'epic', 'Bubbles drifting up.'),
  item('room', 'arcade', 'Synthwave', 1e8, 'epic', 'A neon grid to the horizon.'),
  item('room', 'space', 'Space station', 8e8, 'legendary', 'Stars rushing past the windows.'),
  item('room', 'throne', 'Throne room', 7e9, 'legendary', 'Velvet, gold, and you.'),
  item('room', 'press', 'The press room', null, 'edition', 'Earned by publishing twice.', { edition: 2 }),

  // Tables
  item('table', 'classic', 'House felt', 0, 'common', 'Matches your theme.', { free: true }),
  item('table', 'casino', 'Casino green', 5000, 'common', 'Deep green baize with a brass rail.'),
  item('table', 'velvet', 'Crimson velvet', 40000, 'rare', 'Soft red velvet for serious debates.'),
  item('table', 'ocean', 'Deep end', 150000, 'rare', 'Teal water with slow waves.'),
  item('table', 'oak', 'Old oak', 600000, 'rare', 'A library table with rings and grain.'),
  item('table', 'marble', 'Marble hall', 3e6, 'epic', 'Cold white stone with grey veins.'),
  item('table', 'candy', 'Candy shop', 1.2e7, 'epic', 'Pastel stripes and sprinkles.'),
  item('table', 'neon', 'Arcade', 6e7, 'epic', 'Dark glass with a glowing neon rim.'),
  item('table', 'night', 'Night sky', 4e8, 'legendary', 'Twinkling stars across the felt.'),
  item('table', 'gilded', 'Gilded', 3e9, 'legendary', 'Gold leaf that catches the light.'),
  item('table', 'cosmos', 'Word-cosmos', 5e10, 'legendary', 'A slowly turning galaxy.'),
  item('table', 'archive', 'The Archive', null, 'edition', 'Earned by publishing three times.', { edition: 3 }),
  item('table', 'chalk', 'Chalkboard', 20000, 'common', 'Dusty green slate with doodles.'),
  item('table', 'denim', 'Denim', 90000, 'rare', 'Stitched blue jeans.'),
  item('table', 'blueprint', 'Blueprint', 350000, 'rare', 'Grid paper for planners.'),
  item('table', 'comic', 'Comic book', 1.8e6, 'epic', 'Halftone dots, bold ink.'),
  item('table', 'ice', 'Frozen lake', 8e6, 'epic', 'Cracked blue ice.'),
  item('table', 'sunset', 'Sunset', 2e8, 'legendary', 'Warm gradient skies.'),
  item('table', 'lava', 'Molten', 1.2e10, 'legendary', 'Glowing, slowly moving lava.'),

  // Frames
  item('frame', 'none', 'No frame', 0, 'common', 'Just you.', { free: true }),
  item('frame', 'silver', 'Silver ring', 2000, 'common', 'A clean silver band.'),
  item('frame', 'gold', 'Gold ring', 20000, 'rare', 'A thick gold band.'),
  item('frame', 'laurel', 'Laurels', 80000, 'rare', 'For champions of the dictionary.'),
  item('frame', 'pixel', 'Pixel', 250000, 'rare', 'Eight bits of glory.'),
  item('frame', 'bubbles', 'Bubbles', 900000, 'epic', 'Little bubbles floating round.'),
  item('frame', 'flame', 'On fire', 5e6, 'epic', 'A ring of moving flame.'),
  item('frame', 'crown', 'Crowned', 3e7, 'epic', 'A crown on top. Obviously.'),
  item('frame', 'rainbow', 'Rainbow', 2e8, 'legendary', 'A spinning rainbow ring.'),
  item('frame', 'orbit', 'Orbit', 1.5e9, 'legendary', 'Stars circling your head.'),
  item('frame', 'galaxy', 'Galaxy', 2e10, 'legendary', 'A swirling galaxy halo.'),
  item('frame', 'first-edition', 'First edition', null, 'edition', 'Earned the first time you publish.', { edition: 1 }),
  item('frame', 'legend', 'Legend', null, 'edition', 'Earned by publishing five times.', { edition: 5 }),
  item('frame', 'halo', 'Halo', 12000, 'common', 'Angelic. Allegedly.'),
  item('frame', 'hearts', 'Hearts', 60000, 'rare', 'Little hearts around you.'),
  item('frame', 'neon', 'Neon', 400000, 'rare', 'A buzzing neon tube.'),
  item('frame', 'ice', 'Frost', 2e6, 'epic', 'Icy crystals.'),
  item('frame', 'sakura', 'Sakura', 1e7, 'epic', 'Cherry blossom petals.'),
  item('frame', 'gears', 'Clockwork', 6e7, 'epic', 'Turning brass gears.'),
  item('frame', 'sparkle', 'Sparkle', 7e8, 'legendary', 'Glints that come and go.'),
  item('frame', 'eclipse', 'Eclipse', 8e10, 'legendary', 'A dark sun with a burning corona.'),

  // Card backs
  item('cardBack', 'stripes', 'Stripes', 0, 'common', 'The house pattern.', { free: true }),
  item('cardBack', 'dots', 'Polka dots', 1500, 'common', 'Cheerful dots.'),
  item('cardBack', 'checker', 'Checkers', 8000, 'common', 'A tidy checkerboard.'),
  item('cardBack', 'waves', 'Waves', 40000, 'rare', 'Rolling lines.'),
  item('cardBack', 'hearts', 'Hearts', 120000, 'rare', 'Love for every word.'),
  item('cardBack', 'stars', 'Starfield', 600000, 'epic', 'Tiny stars in the dark.'),
  item('cardBack', 'plaid', 'Plaid', 2.5e6, 'epic', 'Cozy tartan.'),
  item('cardBack', 'foil', 'Gold foil', 4e7, 'legendary', 'Shimmers when it flips.'),
  item('cardBack', 'void', 'The void', 6e8, 'legendary', 'Stares back.'),
  item('cardBack', 'zigzag', 'Zigzag', 20000, 'common', 'Sharp and snappy.'),
  item('cardBack', 'grid', 'Graph paper', 70000, 'rare', 'For the mathematically inclined.'),
  item('cardBack', 'sunset', 'Sunset', 300000, 'rare', 'Orange into purple.'),
  item('cardBack', 'circuit', 'Circuit board', 4e6, 'epic', 'Beep boop.'),
  item('cardBack', 'marble', 'Marble', 1.5e7, 'epic', 'Swirled stone.'),
  item('cardBack', 'aurora', 'Aurora', 3e9, 'legendary', 'Northern lights that move.'),

  // Titles
  item('title', 'none', 'No title', 0, 'common', 'Your level shows instead.', { free: true, text: '' }),
  item('title', 'nerd', 'Word nerd', 1000, 'common', '', { text: 'Word nerd' }),
  item('title', 'vowel', 'Vowel enjoyer', 5000, 'common', '', { text: 'Vowel enjoyer' }),
  item('title', 'critic', 'The Critic', 25000, 'rare', '', { text: 'The Critic' }),
  item('title', 'gremlin', 'Grammar gremlin', 75000, 'rare', '', { text: 'Grammar gremlin' }),
  item('title', 'sommelier', 'Synonym sommelier', 300000, 'rare', '', { text: 'Synonym sommelier' }),
  item('title', 'wordsmith', 'Certified wordsmith', 1.5e6, 'epic', '', { text: 'Certified wordsmith' }),
  item('title', 'menace', 'Coinflip menace', 8e6, 'epic', '', { text: 'Coinflip menace' }),
  item('title', 'baron', 'Leximon baron', 6e7, 'epic', '', { text: 'Leximon baron' }),
  item('title', 'oracle', 'The Oracle', 5e8, 'legendary', '', { text: 'The Oracle' }),
  item('title', 'babel', 'Resident of Babel', 1e10, 'legendary', '', { text: 'Resident of Babel' }),
  item('title', 'author', 'Published author', null, 'edition', 'Earned the first time you publish.', { edition: 1, text: 'Published author' }),
  item('title', 'goblin', 'Vocab goblin', 2000, 'common', '', { text: 'Vocab goblin' }),
  item('title', 'verb', 'Verb enjoyer', 4000, 'common', '', { text: 'Verb enjoyer' }),
  item('title', 'noun', 'Noun hoarder', 6000, 'common', '', { text: 'Noun hoarder' }),
  item('title', 'pun', 'Pun criminal', 12000, 'common', '', { text: 'Pun criminal' }),
  item('title', 'silent', 'Silent letter', 20000, 'common', '', { text: 'Silent letter' }),
  item('title', 'comma', 'Oxford comma defender', 40000, 'rare', '', { text: 'Oxford comma defender' }),
  item('title', 'yapper', 'Certified yapper', 90000, 'rare', '', { text: 'Certified yapper' }),
  item('title', 'opinion', 'Professional opinion haver', 150000, 'rare', '', { text: 'Professional opinion haver' }),
  item('title', 'spelling', 'Spelling bee dropout', 400000, 'rare', '', { text: 'Spelling bee dropout' }),
  item('title', 'rex', 'Thesaurus rex', 900000, 'epic', '', { text: 'Thesaurus rex' }),
  item('title', 'syllable', 'Syllable sorcerer', 3e6, 'epic', '', { text: 'Syllable sorcerer' }),
  item('title', 'bigword', 'Big word energy', 1.2e7, 'epic', '', { text: 'Big word energy' }),
  item('title', 'notabot', 'Definitely not a bot', 3e7, 'epic', '', { text: 'Definitely not a bot' }),
  item('title', 'fivebust', '5.0 or bust', 2e8, 'legendary', '', { text: '5.0 or bust' }),
  item('title', 'lexical', 'Lexical legend', 2e9, 'legendary', '', { text: 'Lexical legend' }),
  item('title', 'onlyword', 'The last word', 5e11, 'legendary', '', { text: 'The last word' }),
  earned('centurion', 'Centurion', 'hundred', 'Comes with the Centurion badge (rate 100 words).'),
  earned('bookworm', 'Bookworm', 'thousand', 'Comes with the Bookworm badge (rate 1,000 words).'),
  earned('walking', 'Walking dictionary', 'tenk', 'Comes with the Living dictionary badge (rate 10,000 words).'),
  earned('owl', 'Night owl', 'owl', 'Comes with the Night owl badge.'),
  earned('earlybird', 'Early bird', 'early', 'Comes with the Early bird badge.'),
  earned('optimist', 'Eternal optimist', 'optimist', 'Comes with the Optimist badge.'),
  earned('curmudgeon', 'Curmudgeon', 'curmudgeon', 'Comes with the Curmudgeon badge.'),
  earned('fence', 'Fence sitter', 'fence', 'Comes with the Fence sitter badge.'),
  earned('perfectionist', 'Perfectionist', 'perfect10', 'Comes with the Perfectionist badge.'),
  earned('abyss', 'Abyss gazer', 'zero10', 'Comes with the Abyss gazer badge.'),
  earned('unstoppable', 'Unstoppable', 'streak30', 'Comes with the Unstoppable badge (a 30-day streak).'),
  earned('mindreader', 'Mind reader', 'mindreader', 'Comes with the Mind reader badge.'),
  earned('telepath', 'Telepath', 'telepath', 'Comes with the Telepath badge.'),
  earned('contrarian', 'Contrarian', 'hottake5', 'Comes with the Contrarian badge.'),
  earned('socialite', 'Socialite', 'friends10', 'Comes with the Full house badge (10 friends).'),
  earned('regular', 'Regular', 'regular', 'Comes with the Regular badge.'),
  earned('millionaire', 'Millionaire', 'coin1m', 'Comes with the Millionaire badge.'),
  earned('tycoon', 'Tycoon', 'tycoon', 'Comes with the Tycoon badge.'),
  earned('lucky', 'Lucky', 'flip10', 'Comes with the Unlikely badge (10 flips in a row).'),
  earned('flowstate', 'In the flow', 'pace100', 'Comes with the Unbroken badge.'),
  earned('stylish', 'Fashionista', 'wardrobe', 'Comes with the Wardrobe badge.'),

  // Name styles
  item('name', 'plain', 'Plain', 0, 'common', 'Your name, nicely.', { free: true }),
  item('name', 'bold', 'Heavy', 3000, 'common', 'Thick and confident.'),
  item('name', 'serif', 'Distinguished', 15000, 'rare', 'A classy serif.'),
  item('name', 'shadow', 'Drop shadow', 60000, 'rare', 'A little depth.'),
  item('name', 'gold', 'Gold', 500000, 'epic', 'Your name in gold.'),
  item('name', 'glitch', 'Glitch', 4e6, 'epic', 'Flickers now and then.'),
  item('name', 'rainbow', 'Rainbow', 5e7, 'legendary', 'Every color, moving.'),
  item('name', 'outline', 'Outline', 25000, 'common', 'Hollow letters.'),
  item('name', 'mono', 'Typewriter', 80000, 'rare', 'Clack clack.'),
  item('name', 'neon', 'Neon', 1.2e6, 'epic', 'Glows in the dark.'),
  item('name', 'fire', 'Fire', 9e6, 'epic', 'Hot hot hot.'),
  item('name', 'ice', 'Ice', 9e6, 'epic', 'Cool as anything.'),
  item('name', 'shimmer', 'Shimmer', 6e8, 'legendary', 'A glint runs across it.'),

  // Confetti
  item('confetti', 'classic', 'Classic', 0, 'common', 'Your theme’s colors.', { free: true }),
  item('confetti', 'coins', 'Coin shower', 10000, 'common', 'Gold coins everywhere.', { emoji: ['🪙'] }),
  item('confetti', 'hearts', 'Hearts', 50000, 'rare', 'Lots of love.', { emoji: ['💖', '💗', '💕'] }),
  item('confetti', 'letters', 'Alphabet soup', 200000, 'rare', 'Letters flying everywhere.', { letters: true }),
  item('confetti', 'stars', 'Stardust', 1e6, 'epic', 'Shooting stars.', { emoji: ['⭐', '✨', '🌟'] }),
  item('confetti', 'leaves', 'Autumn', 5e6, 'epic', 'Falling leaves.', { emoji: ['🍂', '🍁', '🍃'] }),
  item('confetti', 'money', 'Make it rain', 1e8, 'legendary', 'Pure excess.', { emoji: ['💸', '💵', '💰'] }),
  item('confetti', 'snow', 'Snowfall', 30000, 'common', 'Soft flakes.', { emoji: ['❄️', '❅', '❆'] }),
  item('confetti', 'food', 'Snack attack', 150000, 'rare', 'Lunch, everywhere.', { emoji: ['🍕', '🍩', '🍓', '🌮'] }),
  item('confetti', 'critters', 'Critters', 600000, 'rare', 'A small zoo.', { emoji: ['🐸', '🦊', '🐼', '🐙'] }),
  item('confetti', 'books', 'Library', 3e6, 'epic', 'Books and pencils.', { emoji: ['📚', '📖', '✏️', '🔖'] }),
  item('confetti', 'bubbles', 'Bubbles', 2e7, 'epic', 'Floaty.', { emoji: ['🫧', '🫧', '💧'] }),
  item('confetti', 'cosmic', 'Cosmic', 4e9, 'legendary', 'Planets and comets.', { emoji: ['🪐', '☄️', '🌙', '⭐'] }),

  // Coins (for the coinflip)
  item('coin', 'gold', 'Gold', 0, 'common', 'The classic.', { free: true }),
  item('coin', 'silver', 'Silver', 2500, 'common', 'Shiny and cool.'),
  item('coin', 'bronze', 'Ancient bronze', 30000, 'rare', 'Dug up somewhere.'),
  item('coin', 'rose', 'Rose gold', 200000, 'rare', 'Pretty in pink.'),
  item('coin', 'obsidian', 'Obsidian', 3e6, 'epic', 'Black glass with a purple glint.'),
  item('coin', 'rainbow', 'Prism', 8e7, 'legendary', 'Every color at once.'),
  item('coin', 'pearl', 'Pearl', 600000, 'rare', 'Soft and luminous.'),
  item('coin', 'emerald', 'Emerald', 5e6, 'epic', 'Deep green.'),
  item('coin', 'sapphire', 'Sapphire', 5e6, 'epic', 'Deep blue.'),
  item('coin', 'ruby', 'Ruby', 5e6, 'epic', 'Deep red.'),
  item('coin', 'ink', 'Inkwell', 1e9, 'legendary', 'Dark as fresh ink.'),

  // Reactions
  item('reactions', 'none', 'Just the basics', 0, 'common', 'The eight everyone has.', { free: true, emoji: [] }),
  item('reactions', 'snacks', 'Snacks', 10000, 'common', '', { emoji: ['🍿', '🍕', '🧃', '🍩'] }),
  item('reactions', 'critters', 'Critters', 50000, 'rare', '', { emoji: ['🐸', '🦆', '🐌', '🦖'] }),
  item('reactions', 'drama', 'Drama', 200000, 'rare', '', { emoji: ['😱', '🫠', '🤯', '😤'] }),
  item('reactions', 'love', 'Love', 800000, 'epic', '', { emoji: ['💖', '🥰', '😘', '💐'] }),
  item('reactions', 'spooky', 'Spooky', 3e6, 'epic', '', { emoji: ['👻', '🎃', '🦇', '🕸️'] }),
  item('reactions', 'royal', 'Royal', 5e8, 'legendary', '', { emoji: ['👑', '💎', '🏆', '🎩'] }),

  // The bigger wardrobe: drawn from data (see cosmetics-more.js).
  ...MORE_COSMETICS,
  // Only from Wird Valley.
  ...VALLEY_COSMETICS,
  // Faces: your initial, or a head from Wirdlike (and only from there).
  item('face', 'letter', 'Your initial', 0, 'common', 'The first letter of your name, in your colour.', { free: true }),
  // Only from Wirdlike.
  ...WIRDLIKE_COSMETICS
]

export const DEFAULT_LOOK = Object.fromEntries(KINDS.map((k) => [k.id, COSMETICS.find((c) => c.kind === k.id && c.free).id]))
export const cosmetic = (kind, id) => COSMETICS.find((c) => c.kind === kind && c.id === id) || null
export const RARITY = R

// A look that came from someone else (a lobby, a friend): only known items,
// and only the kinds others are meant to see.
export const PUBLIC_KINDS = ['room', 'table', 'face', 'frame', 'cardBack', 'title', 'name', 'reactions']
export function cleanLook (look) {
  const out = {}
  for (const k of PUBLIC_KINDS) {
    const id = look && typeof look[k] === 'string' ? look[k] : null
    out[k] = id && cosmetic(k, id) ? id : DEFAULT_LOOK[k]
  }
  return out
}
export const titleText = (id) => cosmetic('title', id)?.text || ''

// Every reaction anyone can send at a table: the basic eight plus every pack.
export const BASE_REACTIONS = ['😂', '😮', '🔥', '💀', '🤔', '❤️', '👏', '🙈']
export const ALL_REACTIONS = [...BASE_REACTIONS, ...COSMETICS.filter((c) => c.kind === 'reactions').flatMap((c) => c.emoji)]
export const packEmoji = (id) => cosmetic('reactions', id)?.emoji || []
