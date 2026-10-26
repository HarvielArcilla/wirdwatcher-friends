// Wird Tycoon: what a dictionary publisher works with, from a garage in
// 1985 to whatever comes after the AI assistants.
//
//   subjects   what a book is about (slang, cooking, pirates…)
//   formats    what kind of book it is (thesaurus, phrasebook…), each with
//              the parts of the work that matter most to it and its ideal
//              balance of scholarship and charm
//   media      what it's published on, each with its years, its readers,
//              a licence to pay and the formats that suit it
//   areas      the nine parts of making a book, three in each stage
//
// Fits are great (1), fine (0.8) or poor (0.55). Players learn them by
// publishing; the game never shows a fit before it's been tried.

export const START_YEAR = 1985
export const END_YEAR = 2030
export const WEEKS = 52
export const START_CASH = 60000

// --- the work -----------------------------------------------------------------------------
// s: how much an hour here adds to scholarship (the rest is charm).
export const STAGES = [
  { id: 'gather', name: 'Gathering', blurb: 'Deciding what goes in.', areas: ['headwords', 'etymology', 'fieldwork'] },
  { id: 'write', name: 'Writing', blurb: 'Saying what it all means.', areas: ['definitions', 'examples', 'illustrations'] },
  { id: 'finish', name: 'Finishing', blurb: 'Making it a book people want.', areas: ['typesetting', 'proofing', 'cover'] }
]
export const AREAS = {
  headwords: { name: 'Headwords', s: 0.7, blurb: 'Choosing which words get an entry.' },
  etymology: { name: 'Etymology', s: 0.9, blurb: 'Where each word came from.' },
  fieldwork: { name: 'Fieldwork', s: 0.45, blurb: 'Listening to how people really talk.' },
  definitions: { name: 'Definitions', s: 0.8, blurb: 'Clear, careful meanings.' },
  examples: { name: 'Example sentences', s: 0.3, blurb: 'Showing words in use.' },
  illustrations: { name: 'Illustrations', s: 0.1, blurb: 'Pictures, diagrams, little drawings.' },
  typesetting: { name: 'Typesetting', s: 0.5, blurb: 'Columns, fonts, guide words.' },
  proofing: { name: 'Proofreading', s: 0.6, blurb: 'Catching typos before readers do.' },
  cover: { name: 'Cover & marketing', s: 0.1, blurb: 'Making people pick it up.' }
}

// --- formats ------------------------------------------------------------------------------
// w: how much each area matters (0–1). ratio: the share of scholarship in
// the ideal book. research: what it costs to unlock (0: known from the start).
const f = (id, name, ratio, w, research, blurb) => ({ id, name, ratio, w, research, blurb })
export const FORMATS = [
  f('pocket', 'Pocket dictionary', 0.6, { headwords: 1, etymology: 0.2, fieldwork: 0.5, definitions: 1, examples: 0.5, illustrations: 0.1, typesetting: 1, proofing: 0.7, cover: 0.4 }, 0, 'Small, cheap, everywhere.'),
  f('thesaurus', 'Thesaurus', 0.55, { headwords: 1, etymology: 0.2, fieldwork: 0.7, definitions: 0.4, examples: 1, illustrations: 0.1, typesetting: 0.6, proofing: 0.6, cover: 0.5 }, 0, 'Words like it, words unlike it.'),
  f('phrasebook', 'Phrasebook', 0.35, { headwords: 0.4, etymology: 0.1, fieldwork: 1, definitions: 0.4, examples: 1, illustrations: 0.5, typesetting: 0.4, proofing: 0.5, cover: 0.8 }, 0, 'What to say, and when.'),
  f('picture', 'Picture dictionary', 0.25, { headwords: 0.6, etymology: 0.1, fieldwork: 0.4, definitions: 0.4, examples: 0.6, illustrations: 1, typesetting: 0.6, proofing: 0.4, cover: 1 }, 0, 'Every word, drawn.'),
  f('rhyming', 'Rhyming dictionary', 0.45, { headwords: 1, etymology: 0.2, fieldwork: 0.9, definitions: 0.3, examples: 0.7, illustrations: 0.2, typesetting: 0.7, proofing: 0.5, cover: 0.6 }, 6, 'For poets, rappers and greeting cards.'),
  f('glossary', 'Glossary', 0.72, { headwords: 0.8, etymology: 0.3, fieldwork: 0.4, definitions: 1, examples: 0.4, illustrations: 0.3, typesetting: 0.5, proofing: 1, cover: 0.3 }, 8, 'The terms of one trade, explained.'),
  f('style', 'Style guide', 0.65, { headwords: 0.3, etymology: 0.3, fieldwork: 0.5, definitions: 0.7, examples: 1, illustrations: 0.2, typesetting: 0.6, proofing: 1, cover: 0.4 }, 12, 'How it should be said.'),
  f('crossword', 'Crossword compendium', 0.4, { headwords: 1, etymology: 0.4, fieldwork: 0.3, definitions: 0.6, examples: 0.3, illustrations: 0.2, typesetting: 1, proofing: 0.8, cover: 0.6 }, 12, 'Clues, answers and fifty puzzles.'),
  f('encyclopedia', 'Encyclopedia', 0.75, { headwords: 0.7, etymology: 0.5, fieldwork: 1, definitions: 1, examples: 0.3, illustrations: 0.7, typesetting: 0.6, proofing: 0.6, cover: 0.4 }, 20, 'Everything about everything.'),
  f('etym', 'Etymological dictionary', 0.88, { headwords: 0.6, etymology: 1, fieldwork: 0.3, definitions: 0.7, examples: 0.3, illustrations: 0.1, typesetting: 0.5, proofing: 0.7, cover: 0.2 }, 20, 'Where every word came from.')
]
export const FORMAT = Object.fromEntries(FORMATS.map((x) => [x.id, x]))

// --- subjects -----------------------------------------------------------------------------
const s = (id, name, great, poor, research, blurb, from = START_YEAR) => ({ id, name, great, poor, research, blurb, from })
export const SUBJECTS = [
  s('everyday', 'Everyday English', ['pocket', 'thesaurus', 'crossword'], ['etym'], 0, 'The words everyone uses.'),
  s('slang', 'Slang', ['pocket', 'phrasebook'], ['style', 'glossary', 'encyclopedia'], 0, 'What the kids are saying.'),
  s('cooking', 'Cooking', ['picture', 'glossary'], ['rhyming', 'etym'], 0, 'Roux, julienne, al dente.'),
  s('sports', 'Sports', ['glossary', 'crossword'], ['etym', 'style'], 0, 'Offside, explained.'),
  s('children', 'Children’s', ['picture', 'rhyming'], ['etym', 'style', 'glossary'], 0, 'A is for apple.'),
  s('music', 'Music', ['rhyming', 'encyclopedia'], ['style'], 0, 'From allegro to zydeco.'),
  s('insults', 'Insults', ['thesaurus', 'phrasebook'], ['encyclopedia', 'picture', 'glossary'], 4, 'Every way to say it, politely or not.'),
  s('love', 'Love letters', ['rhyming', 'phrasebook'], ['glossary', 'crossword', 'encyclopedia'], 4, 'Sweet nothings, catalogued.'),
  s('medicine', 'Medicine', ['glossary', 'encyclopedia'], ['picture', 'rhyming', 'crossword'], 6, 'Where it hurts, in Latin.'),
  s('law', 'Law', ['glossary', 'style'], ['picture', 'rhyming', 'phrasebook'], 6, 'Heretofore, notwithstanding.'),
  s('pirates', 'Pirates', ['phrasebook', 'picture'], ['style', 'glossary'], 4, 'Arr.'),
  s('fantasy', 'Fantasy worlds', ['encyclopedia', 'phrasebook'], ['style', 'pocket'], 6, 'How to order a drink in Elvish.'),
  s('science', 'Science', ['encyclopedia', 'glossary'], ['rhyming', 'phrasebook'], 6, 'Mitochondria, and so on.'),
  s('space', 'Space', ['encyclopedia', 'picture'], ['rhyming', 'pocket'], 6, 'Nebulae to quasars.'),
  s('oldwords', 'Forgotten words', ['etym', 'crossword'], ['phrasebook', 'picture'], 8, 'Words nobody has said since 1700.'),
  s('business', 'Business jargon', ['glossary', 'style'], ['rhyming', 'picture'], 8, 'Synergy, leverage, circle back.'),
  s('gardening', 'Gardening', ['picture', 'encyclopedia'], ['rhyming', 'phrasebook'], 6, 'Every plant by its proper name.'),
  s('tech', 'Computing', ['glossary', 'pocket'], ['etym', 'rhyming'], 8, 'Bits, bytes and the cloud.', 1990),
  s('gaming', 'Video games', ['glossary', 'encyclopedia'], ['etym', 'style'], 8, 'Respawn, nerf, GG.', 1995),
  s('memes', 'Memes', ['picture', 'pocket'], ['etym', 'style', 'encyclopedia'], 8, 'Explaining the joke, forever.', 2008)
]
export const SUBJECT = Object.fromEntries(SUBJECTS.map((x) => [x.id, x]))

export function subjectFit (subject, format) {
  const x = SUBJECT[subject]
  return x.great.includes(format) ? 'great' : x.poor.includes(format) ? 'poor' : 'fine'
}

// --- media --------------------------------------------------------------------------------
// market: readers (millions) by year, between points. licence: paid once
// per book. price: what one copy brings in. great/poor: formats it suits.
const m = (id, name, from, to, market, licence, price, great, poor, digital, blurb) => ({ id, name, from, to, market, licence, price, great, poor, digital, blurb })
export const MEDIA = [
  m('paperback', 'Paperback', 1985, null, [[1985, 6], [1998, 7], [2010, 5], [2030, 2.5]], 0, 7, ['pocket', 'crossword', 'phrasebook'], ['encyclopedia'], false, 'Cheap and cheerful.'),
  m('hardcover', 'Hardcover', 1985, null, [[1985, 3], [2000, 3.5], [2015, 2], [2030, 1.2]], 0, 22, ['encyclopedia', 'etym', 'picture', 'style'], ['pocket', 'phrasebook'], false, 'Built to last a century.'),
  m('cdrom', 'CD-ROM', 1993, 2008, [[1993, 1.5], [1998, 7], [2003, 4], [2008, 0.5]], 25000, 30, ['encyclopedia', 'picture'], ['pocket', 'crossword'], true, 'It even plays the pronunciations.'),
  m('website', 'Website', 1997, null, [[1997, 2], [2005, 14], [2015, 12], [2030, 5]], 15000, 2, ['glossary', 'thesaurus', 'encyclopedia'], ['crossword', 'picture'], true, 'Paid for by banner ads.'),
  m('ereader', 'E-reader', 2008, null, [[2008, 1], [2013, 6], [2020, 4], [2030, 2]], 20000, 6, ['pocket', 'style', 'etym'], ['picture', 'crossword'], true, 'Tap a word to look it up.'),
  m('app', 'Mobile app', 2009, null, [[2009, 3], [2014, 22], [2022, 30], [2030, 24]], 50000, 3, ['phrasebook', 'thesaurus', 'crossword', 'rhyming'], ['etym', 'encyclopedia'], true, 'In every pocket.'),
  m('speaker', 'Smart speaker', 2015, null, [[2015, 2], [2020, 14], [2030, 8]], 120000, 2, ['rhyming', 'phrasebook', 'thesaurus'], ['picture', 'crossword', 'encyclopedia'], true, '“What rhymes with orange?”'),
  m('ai', 'AI assistant', 2023, null, [[2023, 6], [2026, 30], [2030, 45]], 400000, 2, ['glossary', 'encyclopedia', 'thesaurus', 'style'], ['picture', 'crossword'], true, 'It reads your dictionary so nobody else has to.')
]
export const MEDIUM = Object.fromEntries(MEDIA.map((x) => [x.id, x]))

export function mediumFit (medium, format) {
  const x = MEDIUM[medium]
  return x.great.includes(format) ? 'great' : x.poor.includes(format) ? 'poor' : 'fine'
}
export const FIT = { great: 1, fine: 0.8, poor: 0.55 }

export function marketSize (medium, year) {
  const pts = MEDIUM[medium].market
  if (year <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    const [y1, v1] = pts[i]
    const [y0, v0] = pts[i - 1]
    if (year <= y1) return v0 + (v1 - v0) * (year - y0) / (y1 - y0)
  }
  return pts[pts.length - 1][1]
}
export const mediumOpen = (medium, year) => { const x = MEDIUM[medium]; return year >= x.from && (x.to === null || year <= x.to) }

// --- sizes and offices --------------------------------------------------------------------
export const SIZES = [
  { id: 'small', name: 'Pamphlet', weeks: 6, cost: 6000, team: 1, price: 1, office: 0, blurb: 'A few hundred words. Quick and cheap.' },
  { id: 'medium', name: 'Volume', weeks: 12, cost: 40000, team: 2.6, price: 2.2, office: 1, blurb: 'A proper book. Needs an office.' },
  { id: 'large', name: 'Multi-volume', weeks: 20, cost: 220000, team: 5.2, price: 4, office: 2, blurb: 'A set for the shelf. Needs a publishing house.' },
  { id: 'complete', name: 'The Complete', weeks: 30, cost: 1500000, team: 9, price: 7, office: 3, blurb: 'Every word there is. Needs the tower.' }
]
export const SIZE = Object.fromEntries(SIZES.map((x) => [x.id, x]))

export const OFFICES = [
  { id: 'garage', name: 'The garage', staff: 1, rent: 0, cost: 0, blurb: 'Just you, a typewriter and a lot of index cards.' },
  { id: 'office', name: 'A little office', staff: 4, rent: 1500, cost: 120000, blurb: 'Room for three more, and Volumes.' },
  { id: 'house', name: 'A publishing house', staff: 8, rent: 6000, cost: 1500000, blurb: 'Room for eight, and Multi-volume sets.' },
  { id: 'tower', name: 'Wird Tower', staff: 12, rent: 25000, cost: 15000000, blurb: 'Twelve desks, a view, and The Complete.' }
]

// --- features (researched once, chosen per book) ------------------------------------------
// add: extra scholarship/charm (a share of the book's points). hype: more
// readers at launch. digital/print: only on those media; need: from a year.
export const FEATURES = [
  { id: 'pron', name: 'Pronunciation guide', research: 6, cost: 0.08, add: { s: 0.06 }, blurb: 'How to say every word.' },
  { id: 'thumb', name: 'Thumb index', research: 6, cost: 0.1, add: { c: 0.05 }, print: true, blurb: 'Little notches for each letter.' },
  { id: 'plates', name: 'Colour plates', research: 10, cost: 0.2, add: { c: 0.1 }, hype: 0.05, blurb: 'Glossy pages of pictures.' },
  { id: 'hyperlinks', name: 'Cross-links', research: 10, cost: 0.1, add: { s: 0.05, c: 0.04 }, digital: true, from: 1993, expected: 2000, blurb: 'Click a word to go there. Expected online after 2000.' },
  { id: 'audio', name: 'Spoken pronunciations', research: 12, cost: 0.12, add: { c: 0.08 }, digital: true, from: 1993, blurb: 'Hear every word.' },
  { id: 'search', name: 'Instant search', research: 14, cost: 0.12, add: { s: 0.08 }, digital: true, from: 1997, expected: 2005, blurb: 'Find a word as you type. Expected after 2005.' },
  { id: 'wotd', name: 'Word of the day', research: 10, cost: 0.08, add: { c: 0.04 }, hype: 0.12, digital: true, from: 1999, blurb: 'A little visit every morning.' },
  { id: 'voice', name: 'Voice answers', research: 20, cost: 0.15, add: { c: 0.1 }, digital: true, from: 2014, blurb: 'Answers out loud.' },
  { id: 'neural', name: 'Machine-written definitions', research: 30, cost: 0.1, add: { s: 0.18 }, typos: 2.2, digital: true, from: 2022, blurb: 'Lots of definitions, fast. Some of them are made up.' }
]
export const FEATURE = Object.fromEntries(FEATURES.map((x) => [x.id, x]))
export function featureFits (id, medium, year) {
  const x = FEATURE[id]
  const md = MEDIUM[medium]
  if (x.digital && !md.digital) return false
  if (x.print && md.digital) return false
  return year >= (x.from || 0)
}

// --- staff --------------------------------------------------------------------------------
export const FIRST = ['Ada', 'Basil', 'Clem', 'Dot', 'Edwin', 'Fern', 'Gus', 'Hattie', 'Ivo', 'June', 'Kit', 'Lottie', 'Mo', 'Nell', 'Otto', 'Pearl', 'Quinn', 'Rosa', 'Sol', 'Tess', 'Uma', 'Vic', 'Wren', 'Xan', 'Yves', 'Zelda', 'Priya', 'Kenji', 'Amara', 'Lars', 'Inés', 'Tomasz', 'Mei', 'Dara', 'Femi', 'Noor']
export const LAST = ['Webster', 'Murray', 'Roget', 'Fowler', 'Johnson', 'Partridge', 'Skeat', 'Bailey', 'Cawdrey', 'Garner', 'Quill', 'Inkwell', 'Margin', 'Serif', 'Folio', 'Vellum', 'Glossop', 'Lexington', 'Wordsworth', 'Pagewood', 'Spellman', 'Index', 'Proof', 'Galley']
export const ROLES = [
  { id: 'scholar', name: 'Scholar', s: 1.25, c: 0.75, blurb: 'Lives in the archives.' },
  { id: 'writer', name: 'Writer', s: 0.95, c: 1.05, blurb: 'Good with a sentence.' },
  { id: 'artist', name: 'Illustrator', s: 0.6, c: 1.4, blurb: 'Draws what words mean.' },
  { id: 'editor', name: 'Editor', s: 1.05, c: 0.95, proof: 1.6, blurb: 'Finds typos in their sleep.' }
]

// --- freelance work (between books, for cash) ---------------------------------------------
export const GIGS = [
  { name: 'Proofread a restaurant menu', weeks: 2, pay: 3000, rp: 1 },
  { name: 'Write crossword clues for the local paper', weeks: 3, pay: 5000, rp: 1 },
  { name: 'Name a new breakfast cereal', weeks: 2, pay: 4500, rp: 1 },
  { name: 'Translate a washing-machine manual', weeks: 4, pay: 8000, rp: 2 },
  { name: 'Check the spelling on a shop sign', weeks: 1, pay: 1500, rp: 0 },
  { name: 'Write definitions for a board game', weeks: 4, pay: 9000, rp: 2 },
  { name: 'Coin a word for a marketing agency', weeks: 3, pay: 7000, rp: 2 },
  { name: 'Ghost-write a thesaurus for a rival', weeks: 6, pay: 16000, rp: 3 },
  { name: 'Settle a family Scrabble dispute', weeks: 1, pay: 2500, rp: 1 },
  { name: 'Index a cookbook', weeks: 3, pay: 6000, rp: 1 }
]

// --- reviewers ----------------------------------------------------------------------------
export const REVIEWERS = ['The Daily Pedant', 'Lexicon Weekly', 'The Grammar Gazette', 'Readers’ Corner']
// {t}: the title, {s}: subject, {f}: format, {w}: a word from it.
export const REVIEW_LINES = {
  10: ['A masterpiece. I slept with it under my pillow.', 'Definitive. Other {f}s should simply give up.', 'Its entry for “{w}” made me weep.'],
  9: ['Superb. The {s} section alone is worth the price.', 'Precise, generous and very nearly perfect.', 'I looked up “{w}” and stayed for an hour.'],
  8: ['A fine {f}, and a joy to browse.', 'Confident, careful work.', 'Their “{w}” is the best I’ve read.'],
  7: ['Solid. Does what a {f} should.', 'Good, if not quite essential.', 'Worth it for “{w}” alone.'],
  6: ['Perfectly adequate.', 'Fine. Some entries are thin.', 'Decent, but I’ve seen better {s} books.'],
  5: ['Middling. I kept checking other dictionaries.', 'A {f}, technically.', 'Their definition of “{w}” is merely there.'],
  4: ['Disappointing. The {s} content feels rushed.', 'Typos on the cover. On the cover!', 'Who asked for a {s} {f}?'],
  3: ['Poor. I’d rather guess what words mean.', 'They spelled “{w}” three different ways.', 'An odd pairing, oddly done.'],
  2: ['A doorstop, at best.', 'Hard to believe anyone proofread this.', '“{w}” is defined as “see {w}.”'],
  1: ['Not a dictionary. A cry for help.', 'I want those trees back.', 'Recycled immediately.']
}

// --- goals, looks, badges -----------------------------------------------------------------
export const blankProgress = () => ({ companies: 0, books: 0, best: 0, tens: 0, office: 0, cashPeak: 0, revenue: 0, media: {}, retired: 0, bestseller: 0, history: [] })

export const LX_GOALS = {
  firstBook: { text: 'Publish your first book.', test: (p) => p.books >= 1 },
  score9: { text: 'Get an average review of 9 or better.', test: (p) => p.best >= 9 },
  perfect: { text: 'Get a perfect 10.', test: (p) => p.tens >= 1 },
  office: { text: 'Move out of the garage.', test: (p) => p.office >= 1 },
  tower: { text: 'Move into Wird Tower.', test: (p) => p.office >= 3 },
  million: { text: 'Have a million in the bank.', test: (p) => p.cashPeak >= 1e6 },
  media5: { text: 'Publish on five different media.', test: (p) => Object.keys(p.media).length >= 5 },
  bestseller: { text: 'Sell 250,000 copies of one book.', test: (p) => p.bestseller >= 250000 },
  retire: { text: 'Run a company all the way to 2030.', test: (p) => p.retired >= 1 }
}

const look = (kind, id, name, goal, desc, extra = {}) => ({ kind, id, name, price: null, rarity: 'tycoon', lx: goal, desc, ...extra })
export const TYCOON_COSMETICS = [
  look('title', 'lx-publisher', 'Publisher', 'firstBook', 'From Wird Tycoon.', { text: 'Publisher' }),
  look('cardBack', 'lx-marbled', 'Marbled endpaper', 'office', 'From Wird Tycoon. The inside of a good book.', { back: 'radial-gradient(ellipse at 20% 30%, #c84a3a 0 18%, transparent 19%), radial-gradient(ellipse at 70% 60%, #2a5a8a 0 22%, transparent 23%), radial-gradient(ellipse at 40% 80%, #e8b84a 0 14%, transparent 15%), radial-gradient(ellipse at 85% 15%, #3a7a5a 0 16%, transparent 17%), repeating-radial-gradient(circle at 50% 50%, #f2e8d0 0 4px, #e0d0b0 4px 7px)' }),
  look('frame', 'lx-gilt', 'Gilt spine', 'score9', 'From Wird Tycoon. Gold on leather.', { ring: ['#5a2a1a', '#f2c23e', '#5a2a1a', '#f2c23e', '#5a2a1a'], spin: true }),
  look('name', 'lx-firsted', 'First edition', 'perfect', 'From Wird Tycoon. A perfect review, in gold leaf.', { grad: ['#f2c23e', '#fff4c2', '#b07a12', '#f2c23e'], move: true }),
  look('confetti', 'lx-paper', 'Paper & ink', 'million', 'From Wird Tycoon. Books, pens and loose pages.', { emoji: ['📚', '📖', '✒️', '📜'] }),
  look('frame', 'lx-ribbon', 'Bookmark ribbon', 'media5', 'From Wird Tycoon. Every way to read.', { ring: ['#c23a3a', '#e85a5a', '#c23a3a', '#f2d58b', '#c23a3a'] }),
  look('title', 'lx-bestseller', 'Bestselling author', 'bestseller', 'From Wird Tycoon.', { text: 'Bestselling author' }),
  look('table', 'lx-desk', 'Leather desk', 'tower', 'From Wird Tycoon. Green leather, brass edges.', { felt: 'linear-gradient(rgba(255,255,255,.04), rgba(0,0,0,.12)), radial-gradient(ellipse at 50% 40%, #2e6a4a, #143826 75%)', rim: '#b08a3a' }),
  look('title', 'lx-emeritus', 'Lexicographer emeritus', 'retire', 'From Wird Tycoon.', { text: 'Lexicographer emeritus' })
]

export const TYCOON_BADGES = [
  { id: 'lx-book', emoji: '📕', name: 'Published', hint: 'Publish a book in Wird Tycoon.', test: (s) => s.lxBooks >= 1 },
  { id: 'lx-nine', emoji: '🌟', name: 'Critically acclaimed', hint: 'Get a 9 or better in Wird Tycoon.', test: (s) => s.lxBest >= 9 },
  { id: 'lx-office', emoji: '🏢', name: 'Out of the garage', hint: 'Move into an office in Wird Tycoon.', test: (s) => s.lxOffice >= 1 },
  { id: 'lx-million', emoji: '💰', name: 'Seven figures', hint: 'Have a million in the bank in Wird Tycoon.', test: (s) => s.lxCash >= 1e6 },
  { id: 'lx-bestseller', emoji: '📈', name: 'Bestseller', hint: 'Sell 250,000 copies of one book in Wird Tycoon.', test: (s) => s.lxBestseller >= 250000 },
  { id: 'lx-retire', emoji: '🏆', name: 'Emeritus', hint: 'Run Wird Tycoon all the way to 2030.', test: (s) => s.lxRetired >= 1 }
]
