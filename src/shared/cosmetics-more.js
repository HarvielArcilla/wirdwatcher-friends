// The bigger wardrobe (2.3.1): hundreds more looks, mostly for card packs and
// the shop. Each is described by data (colors, gradients, emoji) rather than
// hand-written CSS: src/renderer/lookStyles.js turns these into the same
// classes the hand-made items use (cb-*, frame-*, felt-*, nm-*), and coin
// skins join the coin art's colors.
//
// Prices are spread evenly (on a log scale) inside each rarity's band, from
// a hash of the id, so every item has a fixed price forever.

const BANDS = { common: [1e3, 3e4], rare: [3e4, 1.5e6], epic: [1.5e6, 1e8], legendary: [1e8, 1e12] }
function h (s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) } return (x >>> 0) / 4294967296 }
// A round-looking price in the band: 2 significant figures.
export function bandPrice (kind, id, rarity) {
  const [lo, hi] = BANDS[rarity]
  const v = lo * (hi / lo) ** h(`${kind}:${id}`)
  const p = 10 ** Math.floor(Math.log10(v) - 1)
  return Math.round(v / p) * p
}
const it = (kind, id, name, rarity, desc, extra = {}) => ({ kind, id, name, price: bandPrice(kind, id, rarity), rarity, desc, ...extra })
const C = 'common'
const R = 'rare'
const E = 'epic'
const L = 'legendary'

// --- titles ---------------------------------------------------------------------------
const TITLES = [
  [C, 'Lowercase only'], [C, 'Comma splicer'], [C, 'Typo tyrant'], [C, 'Rhyme time'], [C, 'Word of mouth'], [C, 'Spellcheck survivor'],
  [C, 'Letter opener'], [C, 'Fine print reader'], [C, 'Dictionary diver'], [C, 'Run-on sentence'], [C, 'Ampersand fan'], [C, 'Hyphen-ated'],
  [C, 'Small talker'], [C, 'Loose vowels'], [C, 'Ellipsis enthusiast…'], [C, 'Crossword casual'], [C, 'Page turner'], [C, 'Bookmark collector'],
  [C, 'Footnote fan'], [C, 'Plural problem'], [C, 'Apostrophe’s friend'], [C, 'Consonant cluster'], [C, 'Word salad chef'], [C, 'Font of knowledge'],
  [R, 'Adjective addict'], [R, 'Metaphor mixer'], [R, 'Alliteration artist'], [R, 'Paragraph wrangler'], [R, 'Etymology nerd'], [R, 'Spoonerism specialist'],
  [R, 'Pangram prodigy'], [R, 'Palindrome pal'], [R, 'Anagram athlete'], [R, 'Dangling modifier'], [R, 'Semicolon sympathizer'], [R, 'Haiku hustler'],
  [R, 'Idiom importer'], [R, 'Prefix professional'], [R, 'Suffix specialist'], [R, 'Onomatopoeia, boom'], [R, 'Sesquipedalian'], [R, 'Malapropism maven'],
  [R, 'Word Exchange whale'], [R, 'Options trader'], [R, 'Short seller'], [R, 'Diamond hands'],
  [E, 'Keeper of the lexicon'], [E, 'Grandmaster of grammar'], [E, 'The Thesaurus'], [E, 'Speaker of tongues'], [E, 'Lord of the letters'], [E, 'Archduke of adverbs'],
  [E, 'Count of syllables'], [E, 'Duchess of dialect'], [E, 'Proper noun'], [E, 'Living footnote'], [E, 'Leximon master'], [E, 'Wall Street wordsmith'],
  [E, 'House always wins'], [E, 'Jackpot jinx'], [E, 'Margin called'],
  [L, 'Author of everything'], [L, 'The Final Draft'], [L, 'Lexicographer royal'], [L, 'Word made flesh'], [L, 'Etymon'], [L, 'The Unabridged'],
  [L, 'Mother tongue'], [L, 'Word of god'], [L, 'Ink in the veins'], [L, 'Every word ever']
].map(([r, text]) => it('title', `t-${text.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}`, text, r, '', { text }))

// --- confetti -------------------------------------------------------------------------
const CONFETTI = [
  [C, 'fruit', 'Fruit bowl', ['🍎', '🍋', '🍇', '🍑']], [C, 'balloons', 'Balloons', ['🎈', '🎈', '🎉']], [C, 'flowers', 'Bouquet', ['🌸', '🌼', '🌷']],
  [C, 'music', 'Sheet music', ['🎵', '🎶', '🎼']], [C, 'sports', 'Ball game', ['⚽', '🏀', '🏈', '⚾']], [C, 'weather', 'Four seasons', ['☀️', '🌧️', '⛄', '🌈']],
  [C, 'sea', 'Rock pool', ['🐚', '🦀', '🐠', '🌊']], [C, 'garden', 'Kitchen garden', ['🥕', '🌽', '🍅', '🥦']], [C, 'punct', 'Punctuation', ['!', '?', ';', '&']],
  [R, 'dice', 'Rolling dice', ['🎲', '🎲', '🃏']], [R, 'candy', 'Sweet shop', ['🍬', '🍭', '🍫', '🧁']], [R, 'bugs', 'Garden bugs', ['🐞', '🦋', '🐝', '🐛']],
  [R, 'tea', 'Tea party', ['🫖', '☕', '🍰', '🫐']], [R, 'rockets', 'Liftoff', ['🚀', '🛸', '🌠']], [R, 'magic', 'Hocus pocus', ['🪄', '🔮', '✨', '🎩']],
  [R, 'stocks', 'Bull run', ['📈', '🐂', '💹']], [R, 'farm', 'Barnyard', ['🐔', '🐄', '🐖', '🐑']],
  [E, 'dragons', 'Dragon hoard', ['🐉', '💰', '🔥']], [E, 'crystals', 'Geode', ['💎', '🔷', '🔶', '💠']], [E, 'royalty', 'Coronation', ['👑', '🎺', '🏰']],
  [E, 'ghosts', 'Haunted', ['👻', '🕯️', '🕸️', '🦇']], [E, 'aurora', 'Northern lights', ['🌌', '✨', '💚', '💜']],
  [L, 'phoenix', 'Phoenix', ['🔥', '🪶', '🌅', '✨']], [L, 'gods', 'Olympus', ['⚡', '🏛️', '🍇', '🪽']], [L, 'void', 'Event horizon', ['🕳️', '🌑', '✴️', '🪐']]
].map(([r, id, name, emoji]) => it('confetti', `c-${id}`, name, r, '', { emoji }))

// --- reactions ------------------------------------------------------------------------
const REACTIONS = [
  [C, 'weather', 'Forecast', ['☀️', '🌧️', '🌪️', '❄️']], [C, 'hands', 'Hands', ['🙌', '🤌', '👌', '🫶']], [C, 'faces', 'Faces', ['😬', '🥲', '😏', '🫡']],
  [C, 'food2', 'Dessert', ['🍰', '🍦', '🍪', '🍮']], [R, 'books', 'Bookish', ['📚', '🤓', '✍️', '🧐']], [R, 'sports', 'Sideline', ['🏆', '📣', '🥇', '🏟️']],
  [R, 'cats', 'Cats', ['😹', '😼', '🙀', '😿']], [R, 'money', 'Money', ['💸', '🤑', '📉', '📈']], [R, 'space', 'Space', ['🛸', '👽', '🪐', '🌠']],
  [E, 'party', 'Party', ['🥳', '🪩', '🍾', '🎊']], [E, 'judges', 'Judges', ['🔟', '9️⃣', '🙅', '🧑‍⚖️']], [E, 'mythic', 'Mythic', ['🦄', '🐉', '🧜', '🧚']],
  [L, 'cosmic', 'Cosmic', ['🌌', '☄️', '🌞', '🌝']], [L, 'treasure', 'Treasure', ['🏴‍☠️', '🗝️', '💰', '🗺️']]
].map(([r, id, name, emoji]) => it('reactions', `r-${id}`, name, r, '', { emoji }))

// --- coins ----------------------------------------------------------------------------
// coin: [highlight, face, shade, ink]
const COINS = [
  [C, 'copper', 'Copper', ['#ffd9b8', '#d07a3e', '#8a4418', '#4a2008']], [C, 'nickel', 'Nickel', ['#f4f5f7', '#b9bec6', '#6d747e', '#2e333a']],
  [C, 'brass', 'Brass', ['#fff1c2', '#d4b04a', '#8a6a16', '#4a3808']], [C, 'tin', 'Tin', ['#eef0f2', '#a7adb4', '#5d646c', '#2a2f34']],
  [C, 'mint', 'Mint', ['#e6fff4', '#7fdcb4', '#2f8a66', '#134a34']], [C, 'peach', 'Peach', ['#fff0e6', '#f5b28c', '#b8683f', '#6a3416']],
  [R, 'jade', 'Jade', ['#e4fff0', '#58b88a', '#1f6b48', '#0c3a24']], [R, 'amethyst', 'Amethyst', ['#f4e6ff', '#a66bd8', '#5c2a8a', '#2e104a']],
  [R, 'topaz', 'Topaz', ['#fff6d8', '#f0b43c', '#a8701a', '#5a3a08']], [R, 'garnet', 'Garnet', ['#ffe4e8', '#b8324a', '#6b1424', '#3a0812']],
  [R, 'turquoise', 'Turquoise', ['#e0fffb', '#3cc8bc', '#16786e', '#083a36']], [R, 'lapis', 'Lapis', ['#e4ecff', '#3a5ab8', '#18286b', '#f4c542']],
  [R, 'coral', 'Coral', ['#ffece6', '#ff7f6b', '#b83f2e', '#5a1a10']],
  [E, 'onyx', 'Onyx', ['#8a8f9a', '#1c1e24', '#08090c', '#f2f4f8']], [E, 'moonstone', 'Moonstone', ['#ffffff', '#cfe0f0', '#7a9ab8', '#2e4a6b']],
  [E, 'opal', 'Opal', ['#ffffff', '#d8f0ec', '#a8b8e8', '#6a4a8a']], [E, 'citrine', 'Citrine', ['#fffbe0', '#f4d23a', '#b88a0c', '#5a4204']],
  [E, 'bloodstone', 'Bloodstone', ['#c8e8c8', '#2a5a3a', '#0c2414', '#d83a3a']],
  [L, 'sunstone', 'Sunstone', ['#fff8e0', '#ff9a3a', '#c84a0c', '#fff3b8']], [L, 'meteorite', 'Meteorite', ['#d8d0c8', '#5a524a', '#1c1814', '#ffb86b']],
  [L, 'starmetal', 'Star metal', ['#ffffff', '#b8c8ff', '#4a5ab8', '#ffe9a0']], [L, 'nebula', 'Nebula', ['#ffd8f8', '#8a4ad8', '#2a0c5a', '#7fe8ff']]
].map(([r, id, name, coin]) => it('coin', `k-${id}`, name, r, '', { coin }))

// --- card backs -----------------------------------------------------------------------
const stripes = (a, b, w = 6, deg = 45) => `repeating-linear-gradient(${deg}deg, ${a} 0 ${w}px, ${b} ${w}px ${w * 2}px)`
const dots = (dot, bg, size = 10, r = 2) => `radial-gradient(circle, ${dot} ${r}px, transparent ${r + 0.5}px) 0 0 / ${size}px ${size}px, ${bg}`
const BACKS = [
  [C, 'mint-stripe', 'Mint stripes', stripes('#9fe3c4', '#5fbf98')], [C, 'navy-dot', 'Navy dots', dots('#cfe0ff', '#1c2e5a')], [C, 'lemon', 'Lemonade', stripes('#fff3a0', '#ffd23a', 8, 90)],
  [C, 'brick', 'Brickwork', 'linear-gradient(#b8582e 0 0) 0 0 / 0 0, repeating-linear-gradient(0deg, #8a3a1c 0 2px, transparent 2px 10px), repeating-linear-gradient(90deg, #8a3a1c 0 2px, #c8643a 2px 18px)'],
  [C, 'kraft', 'Kraft paper', 'radial-gradient(circle at 30% 30%, #d8b88a, #b8915e)'], [C, 'pink-dot', 'Bubblegum', dots('#fff', '#ff8fc0', 9, 2)],
  [C, 'denim', 'Denim', 'repeating-linear-gradient(45deg, #3a5a8a 0 2px, #2e4a75 2px 4px)'], [C, 'grass', 'Lawn', stripes('#6bbf4a', '#58a83a', 7, 0)],
  [R, 'argyle', 'Argyle', 'linear-gradient(45deg, rgba(255,255,255,.25) 25%, transparent 25% 75%, rgba(255,255,255,.25) 75%) 0 0 / 16px 16px, linear-gradient(45deg, #7a2a4a 25%, #a8406a 25% 75%, #7a2a4a 75%) 0 0 / 16px 16px'],
  [R, 'houndstooth', 'Houndstooth', 'conic-gradient(#222 25%, #ddd 0 50%, #222 0 75%, #ddd 0) 0 0 / 8px 8px'], [R, 'sunburst', 'Sunburst', 'repeating-conic-gradient(#ffb23a 0 10deg, #ff7a2a 10deg 20deg)'],
  [R, 'blueprint', 'Blueprint', 'linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px) 0 0 / 10px 10px, linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px) 0 0 / 10px 10px, #1f4a8a'],
  [R, 'lavender', 'Lavender field', stripes('#c8a8f0', '#9a78d8', 5, 135)], [R, 'teal-wave', 'Tidepool', 'radial-gradient(circle at 50% 100%, transparent 5px, #3cc8bc 6px 8px, transparent 9px) 0 0 / 12px 8px, #136a64'],
  [R, 'cherry', 'Cherry', dots('#ff3a5a', '#ffe0e6', 12, 3)],
  [E, 'chrome', 'Chrome', 'linear-gradient(160deg, #f4f6f8, #9aa3b0 35%, #f4f6f8 50%, #6d747e 75%, #e4e7ec)'],
  [E, 'galaxy', 'Galaxy swirl', 'conic-gradient(from 30deg, #2a1a5e, #8a6ad8, #4ab1f0, #2a1a5e, #d65f8f, #2a1a5e)'],
  [E, 'lava', 'Lava lamp', 'radial-gradient(circle at 30% 30%, #ffcf3a 0 18%, transparent 19%), radial-gradient(circle at 70% 70%, #ff6a2a 0 22%, transparent 23%), #b81a4a'],
  [E, 'emerald', 'Emerald cut', 'conic-gradient(from 45deg, #0c5a3a, #3fbf74, #0c5a3a, #a8f0c8, #0c5a3a)'],
  [E, 'sakura', 'Sakura', 'radial-gradient(circle at 20% 30%, #fff 0 2px, transparent 3px), radial-gradient(circle at 70% 60%, #fff 0 2px, transparent 3px), linear-gradient(160deg, #ffc8dc, #ff8fb8)'],
  [L, 'prism', 'Prism', 'conic-gradient(#ff6b6b, #f4c542, #6bd68a, #4ab1f0, #a66bd8, #ff6b6b)'],
  [L, 'obsidian', 'Obsidian glass', 'linear-gradient(135deg, #0c0a12, #2c2340 40%, #9a7ae8 50%, #2c2340 60%, #0c0a12)'],
  [L, 'royal', 'Royal flush', 'radial-gradient(circle, #f4c542 0 3px, transparent 3.5px) 0 0 / 14px 14px, linear-gradient(160deg, #5c0d1c, #a32638)']
].map(([r, id, name, back]) => it('cardBack', `b-${id}`, name, r, '', { back }))

// --- frames ---------------------------------------------------------------------------
// ring: a conic gradient drawn as a ring; spin: it turns.
const FRAMES = [
  [C, 'copper', 'Copper ring', ['#d07a3e', '#ffd9b8', '#d07a3e']], [C, 'mint', 'Mint ring', ['#7fdcb4', '#e6fff4', '#7fdcb4']], [C, 'sky', 'Sky ring', ['#8ab4e8', '#e4efff', '#8ab4e8']],
  [C, 'rose', 'Rose ring', ['#e9a9a2', '#ffe7e3', '#e9a9a2']], [C, 'lilac', 'Lilac ring', ['#c49ae8', '#f4e6ff', '#c49ae8']], [C, 'sunny', 'Sunny ring', ['#ffd23a', '#fff3a0', '#ffd23a']],
  [R, 'tiger', 'Tiger', ['#ff8a1a', '#1c1208', '#ff8a1a', '#1c1208', '#ff8a1a']], [R, 'ocean', 'Ocean', ['#1f8a9a', '#7fe8ff', '#0b4a5c', '#1f8a9a']], [R, 'forest', 'Forest', ['#2e6b3a', '#a8d46f', '#2e6b3a']],
  [R, 'candy', 'Candy cane', ['#ff3a5a', '#fff', '#ff3a5a', '#fff', '#ff3a5a', '#fff', '#ff3a5a']], [R, 'peacock', 'Peacock', ['#136a64', '#3a5ab8', '#58b88a', '#136a64']],
  [R, 'sunset', 'Sunset ring', ['#ff7a2a', '#d6336c', '#7a2a8a', '#ff7a2a']],
  [E, 'storm', 'Thunderstorm', ['#2a2f4a', '#9ab8ff', '#2a2f4a', '#fff', '#2a2f4a'], true], [E, 'jade', 'Jade dragon', ['#0c5a3a', '#a8f0c8', '#f4c542', '#0c5a3a'], true],
  [E, 'ember', 'Embers', ['#5a0c0c', '#ff6a2a', '#ffd23a', '#5a0c0c'], true], [E, 'tide', 'Riptide', ['#0b2a5e', '#4ab1f0', '#e0fffb', '#0b2a5e'], true],
  [L, 'aurora', 'Aurora borealis', ['#3cc8bc', '#a66bd8', '#6bd68a', '#4ab1f0', '#3cc8bc'], true], [L, 'sol', 'Solar flare', ['#fff3b8', '#ff9a3a', '#c84a0c', '#fff3b8'], true],
  [L, 'void', 'Void ring', ['#000', '#8a6ad8', '#000', '#d65f8f', '#000'], true]
].map(([r, id, name, ring, spin]) => it('frame', `f-${id}`, name, r, '', { ring, spin: Boolean(spin) }))

// --- name styles ----------------------------------------------------------------------
const NAMES = [
  [C, 'mint', 'Mint', ['#2f8a66', '#58b88a']], [C, 'berry', 'Berry', ['#8a1a4a', '#d6336c']], [C, 'ocean', 'Ocean', ['#136a64', '#3a5ab8']], [C, 'sunny', 'Sunny', ['#c8901e', '#ff7a2a']],
  [R, 'sunset', 'Sunset', ['#ff7a2a', '#d6336c', '#7a2a8a']], [R, 'forest', 'Forest', ['#1f6b48', '#a8d46f']], [R, 'peach', 'Peach fuzz', ['#ff8f6b', '#ffc8a8', '#ff8f6b']],
  [R, 'royal', 'Royal purple', ['#5c2a8a', '#a66bd8']], [R, 'steel', 'Steel', ['#4a5260', '#9aa3b0', '#4a5260']],
  [E, 'aurora', 'Aurora', ['#3cc8bc', '#a66bd8', '#6bd68a'], true], [E, 'lava', 'Lava', ['#c84a0c', '#ffd23a', '#c84a0c'], true], [E, 'toxic', 'Toxic', ['#4ad82a', '#d8ff3a', '#4ad82a'], true],
  [L, 'prism', 'Prism', ['#ff6b6b', '#f4c542', '#6bd68a', '#4ab1f0', '#a66bd8', '#ff6b6b'], true], [L, 'starlight', 'Starlight', ['#fff3b8', '#b8c8ff', '#fff', '#b8c8ff', '#fff3b8'], true]
].map(([r, id, name, grad, move]) => it('name', `n-${id}`, name, r, '', { grad, move: Boolean(move) }))

// --- tables ---------------------------------------------------------------------------
// felt: the surface; rim: the edge; dark: light text on it.
const TABLES = [
  [C, 'cork', 'Corkboard', 'radial-gradient(circle at 30% 30%, #d8a86b, #b8823e 80%)', '#6b4418', false], [C, 'sky', 'Blue sky', 'radial-gradient(ellipse at 50% 30%, #e4f2ff, #8ab4e8 85%)', '#fff', false],
  [C, 'mint', 'Mint chip', 'radial-gradient(ellipse at 50% 40%, #d8f8e8, #8adcb4 85%)', '#4a8a6b', false], [C, 'linen', 'Picnic', 'repeating-linear-gradient(0deg, rgba(214,51,51,.35) 0 14px, transparent 14px 28px), repeating-linear-gradient(90deg, rgba(214,51,51,.35) 0 14px, #fff 14px 28px)', '#b82a2a', false],
  [C, 'slate', 'Slate', 'radial-gradient(ellipse at 50% 40%, #5a6472, #2e343c 85%)', '#1c2026', true],
  [R, 'billiard', 'Billiard blue', 'radial-gradient(ellipse at 50% 40%, #2a6bb8, #0c3a7a 80%)', '#3b2412', true], [R, 'plum', 'Plum velvet', 'radial-gradient(ellipse at 50% 35%, #7a2a8a, #3a0c4a 80%)', '#c9a45c', true],
  [R, 'terrazzo', 'Terrazzo', 'radial-gradient(circle at 20% 30%, #ff8f6b 0 4px, transparent 5px), radial-gradient(circle at 70% 60%, #3cc8bc 0 3px, transparent 4px), radial-gradient(circle at 40% 80%, #f4c542 0 3px, transparent 4px), #f4efe6', '#c8bba8', false],
  [R, 'bamboo', 'Bamboo', 'repeating-linear-gradient(90deg, #c8b45a 0 22px, #a89440 22px 24px)', '#6b5a1c', false],
  [E, 'aurora', 'Aurora', 'linear-gradient(160deg, #0b2a5e, #136a64 40%, #6bd68a 60%, #5c2a8a)', '#3cc8bc', true], [E, 'jade', 'Jade', 'radial-gradient(ellipse at 40% 30%, #a8f0c8, #3fbf74 45%, #0c5a3a 90%)', '#f4c542', true],
  [E, 'rosegold', 'Rose gold', 'radial-gradient(ellipse at 40% 30%, #ffe7e3, #e9a9a2 45%, #a65f5c 90%)', '#fff', false],
  [L, 'obsidian', 'Obsidian', 'linear-gradient(135deg, #0c0a12, #2c2340 45%, #9a7ae8 50%, #2c2340 55%, #0c0a12)', '#9a7ae8', true],
  [L, 'sunfire', 'Sunfire', 'radial-gradient(circle at 50% 50%, #fff3b8, #ffb23a 30%, #c84a0c 75%, #5a0c0c)', '#ffd23a', true]
].map(([r, id, name, felt, rim, dark]) => it('table', `tb-${id}`, name, r, '', { felt, rim, dark }))

export const MORE_COSMETICS = [...TITLES, ...CONFETTI, ...REACTIONS, ...COINS, ...BACKS, ...FRAMES, ...NAMES, ...TABLES]
