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
//
// A few things can't be bought: each edition you publish (prestige) earns
// its own, marked `edition`.

export const KINDS = [
  { id: 'table', name: 'Tables', blurb: 'The felt everyone sees when you host.', seen: 'everyone at your table' },
  { id: 'frame', name: 'Frames', blurb: 'Around your face, wherever friends see you.', seen: 'everyone' },
  { id: 'cardBack', name: 'Card backs', blurb: 'Your face-down card at the table.', seen: 'everyone at the table' },
  { id: 'title', name: 'Titles', blurb: 'Under your name at the table and on your profile.', seen: 'everyone' },
  { id: 'name', name: 'Name styles', blurb: 'How your name looks at the table and in chat.', seen: 'everyone at the table' },
  { id: 'confetti', name: 'Confetti', blurb: 'What bursts out when a word deserves it.', seen: 'you' },
  { id: 'coin', name: 'Coins', blurb: 'The coin you flip.', seen: 'you' }
]

const R = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', edition: 'Edition' }

const item = (kind, id, name, price, rarity, desc, extra = {}) => ({ kind, id, name, price, rarity, desc, ...extra })

export const COSMETICS = [
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

  // Titles
  item('title', 'none', 'No title', 0, 'common', 'Your level shows instead.', { free: true, text: '' }),
  item('title', 'nerd', 'Word nerd', 1000, 'common', '', { text: 'Word nerd' }),
  item('title', 'vowel', 'Vowel enjoyer', 5000, 'common', '', { text: 'Vowel enjoyer' }),
  item('title', 'critic', 'The Critic', 25000, 'rare', '', { text: 'The Critic' }),
  item('title', 'gremlin', 'Grammar gremlin', 75000, 'rare', '', { text: 'Grammar gremlin' }),
  item('title', 'sommelier', 'Synonym sommelier', 300000, 'rare', '', { text: 'Synonym sommelier' }),
  item('title', 'wordsmith', 'Certified wordsmith', 1.5e6, 'epic', '', { text: 'Certified wordsmith' }),
  item('title', 'menace', 'Coinflip menace', 8e6, 'epic', '', { text: 'Coinflip menace' }),
  item('title', 'baron', 'Lexicon baron', 6e7, 'epic', '', { text: 'Lexicon baron' }),
  item('title', 'oracle', 'The Oracle', 5e8, 'legendary', '', { text: 'The Oracle' }),
  item('title', 'babel', 'Resident of Babel', 1e10, 'legendary', '', { text: 'Resident of Babel' }),
  item('title', 'author', 'Published author', null, 'edition', 'Earned the first time you publish.', { edition: 1, text: 'Published author' }),

  // Name styles
  item('name', 'plain', 'Plain', 0, 'common', 'Your name, nicely.', { free: true }),
  item('name', 'bold', 'Heavy', 3000, 'common', 'Thick and confident.'),
  item('name', 'serif', 'Distinguished', 15000, 'rare', 'A classy serif.'),
  item('name', 'shadow', 'Drop shadow', 60000, 'rare', 'A little depth.'),
  item('name', 'gold', 'Gold', 500000, 'epic', 'Your name in gold.'),
  item('name', 'glitch', 'Glitch', 4e6, 'epic', 'Flickers now and then.'),
  item('name', 'rainbow', 'Rainbow', 5e7, 'legendary', 'Every color, moving.'),

  // Confetti
  item('confetti', 'classic', 'Classic', 0, 'common', 'Your theme’s colors.', { free: true }),
  item('confetti', 'coins', 'Coin shower', 10000, 'common', 'Gold coins everywhere.', { emoji: ['🪙'] }),
  item('confetti', 'hearts', 'Hearts', 50000, 'rare', 'Lots of love.', { emoji: ['💖', '💗', '💕'] }),
  item('confetti', 'letters', 'Alphabet soup', 200000, 'rare', 'Letters flying everywhere.', { letters: true }),
  item('confetti', 'stars', 'Stardust', 1e6, 'epic', 'Shooting stars.', { emoji: ['⭐', '✨', '🌟'] }),
  item('confetti', 'leaves', 'Autumn', 5e6, 'epic', 'Falling leaves.', { emoji: ['🍂', '🍁', '🍃'] }),
  item('confetti', 'money', 'Make it rain', 1e8, 'legendary', 'Pure excess.', { emoji: ['💸', '💵', '💰'] }),

  // Coins (for the coinflip)
  item('coin', 'gold', 'Gold', 0, 'common', 'The classic.', { free: true }),
  item('coin', 'silver', 'Silver', 2500, 'common', 'Shiny and cool.'),
  item('coin', 'bronze', 'Ancient bronze', 30000, 'rare', 'Dug up somewhere.'),
  item('coin', 'rose', 'Rose gold', 200000, 'rare', 'Pretty in pink.'),
  item('coin', 'obsidian', 'Obsidian', 3e6, 'epic', 'Black glass with a purple glint.'),
  item('coin', 'rainbow', 'Prism', 8e7, 'legendary', 'Every color at once.')
]

export const DEFAULT_LOOK = Object.fromEntries(KINDS.map((k) => [k.id, COSMETICS.find((c) => c.kind === k.id && c.free).id]))
export const cosmetic = (kind, id) => COSMETICS.find((c) => c.kind === kind && c.id === id) || null
export const RARITY = R

// A look that came from someone else (a lobby, a friend): only known items,
// and only the kinds others are meant to see.
export const PUBLIC_KINDS = ['table', 'frame', 'cardBack', 'title', 'name']
export function cleanLook (look) {
  const out = {}
  for (const k of PUBLIC_KINDS) {
    const id = look && typeof look[k] === 'string' ? look[k] : null
    out[k] = id && cosmetic(k, id) ? id : DEFAULT_LOOK[k]
  }
  return out
}
export const titleText = (id) => cosmetic('title', id)?.text || ''
