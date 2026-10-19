// The rules of the coin economy: the wirdhouse's buildings and upgrades,
// prestige ("publishing an edition") and its perks, and the formulas that
// turn them into coins. Pure functions over a plain state object, shared by
// the background process (which keeps the real numbers) and the window
// (which previews what a purchase would do).
//
// Two promises shape everything here:
//   - What you rate never changes what you earn. A 0.0 and a 5.0 pay the
//     same; only rating a word for the first time pays at all.
//   - Coins never help you win anything against other people. They buy
//     investments here and cosmetics in the shop, nothing else.

export const BASE_PER_WORD = 5 // coins for rating a word you hadn't rated before
export const BASE_LOBBY_ROUND = 25 // coins for playing a lobby round, win or lose
export const MIN_GAP_MS = 1500 // ratings closer together than this don't grow the pace streak

// --- buildings ------------------------------------------------------------------

export const BUILDINGS = [
  { id: 'pencil', name: 'Pencil', emoji: '✏️', cost: 15, cps: 0.1, blurb: 'Writes one word at a time. Barely.' },
  { id: 'notebook', name: 'Notebook', emoji: '📓', cost: 100, cps: 1, blurb: 'Somewhere to keep the good ones.' },
  { id: 'typewriter', name: 'Typewriter', emoji: '⌨️', cost: 1100, cps: 8, blurb: 'Clack clack ding.' },
  { id: 'press', name: 'Printing press', emoji: '🖨️', cost: 12000, cps: 47, blurb: 'Words by the thousand.' },
  { id: 'scriptorium', name: 'Scriptorium', emoji: '🕯️', cost: 130000, cps: 260, blurb: 'Monks, candles, very nice handwriting.' },
  { id: 'library', name: 'Library', emoji: '🏛️', cost: 1.4e6, cps: 1400, blurb: 'Shh. The coins are working.' },
  { id: 'committee', name: 'Dictionary committee', emoji: '🧐', cost: 2e7, cps: 7800, blurb: 'They argue about commas for coins.' },
  { id: 'babel', name: 'Tower of Babel', emoji: '🗼', cost: 3.3e8, cps: 44000, blurb: 'Every word in every language.' },
  { id: 'cosmos', name: 'Word-cosmos', emoji: '🌌', cost: 5.1e9, cps: 260000, blurb: 'Stars spelling things out.' }
]
export const BUILDING_GROWTH = 1.15

export const buildingCost = (b, owned, count = 1) => {
  // Sum of a geometric series: the next `count` copies.
  const r = BUILDING_GROWTH
  return Math.ceil(b.cost * r ** owned * (r ** count - 1) / (r - 1))
}

// How many more of a building `coins` can buy.
export function maxAffordable (b, owned, coins) {
  const r = BUILDING_GROWTH
  const first = b.cost * r ** owned
  if (coins < first) return 0
  return Math.floor(Math.log(1 + (coins * (r - 1)) / first) / Math.log(r))
}

// --- upgrades -----------------------------------------------------------------------
//
// Each upgrade is bought once. `req(s)` says when it shows up in the shop
// (so the list grows as you play), `apply(fx, s)` adds its effect. Effects
// are collected into one `fx` object by effects(), which everything else reads.
//
// Kinds, so different play styles have different things to chase:
//   building  - one building's output
//   synergy   - one building boosts another
//   word      - coins for each new word you rate
//   streak    - the pace streak: bigger, longer-lasting, more forgiving
//   muse      - rating makes the wirdhouse work faster for a while
//   offline   - what the wirdhouse earns while the app is closed
//   social    - lobbies and friends
//   global    - everything

const ordinal = ['', 'Polished', 'Gilded', 'Enchanted', 'Legendary', 'Mythic']
const TIER_AT = [1, 10, 25, 50, 100]
const TIER_COST = [10, 50, 500, 5000, 50000]

function buildingUpgrades () {
  const out = []
  for (const b of BUILDINGS) {
    TIER_AT.forEach((at, i) => {
      out.push({
        id: `${b.id}-${i + 1}`,
        kind: 'building',
        name: `${ordinal[i + 1]} ${b.name.toLowerCase()}s`,
        emoji: b.emoji,
        cost: b.cost * TIER_COST[i],
        desc: `${b.name}s make twice as much.`,
        req: (s) => (s.buildings[b.id] || 0) >= at,
        hint: `Own ${at} ${b.name.toLowerCase()}${at === 1 ? '' : 's'}`,
        apply: (fx) => { fx.building[b.id] *= 2 }
      })
    })
  }
  return out
}

const SYNERGIES = [
  { id: 'syn-margins', from: 'notebook', to: 'pencil', pct: 0.05, cost: 5000, name: 'Notes in the margins' },
  { id: 'syn-carbon', from: 'typewriter', to: 'notebook', pct: 0.04, cost: 60000, name: 'Carbon copies' },
  { id: 'syn-errata', from: 'press', to: 'typewriter', pct: 0.03, cost: 7e5, name: 'Errata slips' },
  { id: 'syn-illumination', from: 'scriptorium', to: 'press', pct: 0.03, cost: 8e6, name: 'Illuminated type' },
  { id: 'syn-card', from: 'library', to: 'scriptorium', pct: 0.02, cost: 9e7, name: 'Library cards' },
  { id: 'syn-review', from: 'committee', to: 'library', pct: 0.02, cost: 1.2e9, name: 'Peer review' },
  { id: 'syn-translation', from: 'babel', to: 'committee', pct: 0.015, cost: 2e10, name: 'Translation desk' },
  { id: 'syn-starlight', from: 'cosmos', to: 'babel', pct: 0.01, cost: 3e11, name: 'Starlight reading' }
]
const nameOf = (id) => BUILDINGS.find((b) => b.id === id).name.toLowerCase()

function synergyUpgrades () {
  return SYNERGIES.map((x) => ({
    id: x.id,
    kind: 'synergy',
    name: x.name,
    emoji: BUILDINGS.find((b) => b.id === x.to).emoji,
    cost: x.cost,
    desc: `Each ${nameOf(x.from)} makes ${nameOf(x.to)}s ${Math.round(x.pct * 1000) / 10}% better.`,
    req: (s) => (s.buildings[x.from] || 0) >= 5 && (s.buildings[x.to] || 0) >= 10,
    hint: `Own 5 ${nameOf(x.from)}s and 10 ${nameOf(x.to)}s`,
    apply: (fx, s) => { fx.building[x.to] *= 1 + x.pct * (s.buildings[x.from] || 0) }
  }))
}

const words = (n) => (s) => (s.stats?.words || 0) >= n
const lobby = (n) => (s) => (s.stats?.lobbyRounds || 0) >= n
const allTime = (n) => (s) => (s.allCoins || 0) >= n
const owns = (id) => (s) => s.upgrades.includes(id)
const both = (...fs) => (s) => fs.every((f) => f(s))

const SPECIAL = [
  // Words: for people who play.
  { id: 'word-1', kind: 'word', emoji: '✍️', name: 'Sharpened wit', cost: 200, desc: '+3 coins for every new word.', req: words(10), hint: 'Rate 10 words', apply: (fx) => { fx.wordFlat += 3 } },
  { id: 'word-2', kind: 'word', emoji: '📚', name: 'Thesaurus', cost: 4000, desc: '+10 coins for every new word.', req: both(words(50), owns('word-1')), hint: 'Rate 50 words', apply: (fx) => { fx.wordFlat += 10 } },
  { id: 'word-3', kind: 'word', emoji: '🪶', name: 'Etymology', cost: 60000, desc: 'Every new word also pays 5 seconds of the wirdhouse’s output.', req: both(words(150), owns('word-2')), hint: 'Rate 150 words', apply: (fx) => { fx.wordSecs += 5 } },
  { id: 'word-4', kind: 'word', emoji: '🔤', name: 'Lexicographer', cost: 2e6, desc: 'Every new word pays 10 more seconds of output.', req: both(words(400), owns('word-3')), hint: 'Rate 400 words', apply: (fx) => { fx.wordSecs += 10 } },
  { id: 'word-5', kind: 'word', emoji: '🌐', name: 'Polyglot', cost: 9e7, desc: 'Every new word pays 20 more seconds of output.', req: both(words(1000), owns('word-4')), hint: 'Rate 1,000 words', apply: (fx) => { fx.wordSecs += 20 } },
  { id: 'word-6', kind: 'word', emoji: '🗿', name: 'Living dictionary', cost: 6e9, desc: 'Coins per word ×2.', req: both(words(2500), owns('word-5')), hint: 'Rate 2,500 words', apply: (fx) => { fx.wordMult *= 2 } },
  { id: 'long-1', kind: 'word', emoji: '📏', name: 'Big words', cost: 1500, desc: '+2 coins for each letter past the fifth.', req: words(25), hint: 'Rate 25 words', apply: (fx) => { fx.perLetter += 2 } },
  { id: 'long-2', kind: 'word', emoji: '🦕', name: 'Sesquipedalian', cost: 250000, desc: '+10 more coins for each letter past the fifth.', req: both(words(300), owns('long-1')), hint: 'Rate 300 words', apply: (fx) => { fx.perLetter += 10 } },
  { id: 'daily-1', kind: 'word', emoji: '🌅', name: 'Morning pages', cost: 3000, desc: 'Your first new word each day pays ×25.', req: words(20), hint: 'Rate 20 words', apply: (fx) => { fx.firstOfDay = Math.max(fx.firstOfDay, 25) } },
  { id: 'daily-2', kind: 'word', emoji: '☀️', name: 'Daily devotion', cost: 4e6, desc: 'Your first new word each day pays ×200.', req: both(words(200), owns('daily-1')), hint: 'Rate 200 words', apply: (fx) => { fx.firstOfDay = Math.max(fx.firstOfDay, 200) } },

  // The pace streak: ratings within a window of each other.
  { id: 'streak-1', kind: 'streak', emoji: '🔥', name: 'Momentum', cost: 500, desc: 'Each word in a streak adds +3% instead of +2%.', req: words(15), hint: 'Rate 15 words', apply: (fx) => { fx.streakStep = Math.max(fx.streakStep, 0.03) } },
  { id: 'streak-2', kind: 'streak', emoji: '⚡', name: 'Flow state', cost: 8000, desc: 'The streak can climb to ×2 (from ×1.5).', req: both(words(40), owns('streak-1')), hint: 'Rate 40 words', apply: (fx) => { fx.streakCap = Math.max(fx.streakCap, 2) } },
  { id: 'streak-3', kind: 'streak', emoji: '⏳', name: 'Second wind', cost: 30000, desc: 'The streak lasts 90 seconds between words (from 60).', req: both(words(60), owns('streak-1')), hint: 'Rate 60 words', apply: (fx) => { fx.streakWindow = Math.max(fx.streakWindow, 90) } },
  { id: 'streak-4', kind: 'streak', emoji: '🪂', name: 'Safety net', cost: 150000, desc: 'When a streak runs out, keep half of it.', req: both(words(100), owns('streak-3')), hint: 'Rate 100 words', apply: (fx) => { fx.streakKeep = Math.max(fx.streakKeep, 0.5) } },
  { id: 'streak-5', kind: 'streak', emoji: '🌪️', name: 'In the zone', cost: 3e6, desc: 'The streak can climb to ×3, +5% per word.', req: both(words(250), owns('streak-2')), hint: 'Rate 250 words', apply: (fx) => { fx.streakCap = Math.max(fx.streakCap, 3); fx.streakStep = Math.max(fx.streakStep, 0.05) } },
  { id: 'streak-6', kind: 'streak', emoji: '🏎️', name: 'Momentum engine', cost: 4e7, desc: 'While a streak is going, the wirdhouse gets a share of it too (the square root of the streak’s multiplier).', req: both(words(400), owns('streak-5')), hint: 'Rate 400 words', apply: (fx) => { fx.streakToIdle = true } },
  { id: 'streak-7', kind: 'streak', emoji: '🕰️', name: 'Patience of a saint', cost: 6e8, desc: 'The streak lasts 2 minutes between words, and keeps 75% when it runs out.', req: both(words(800), owns('streak-4')), hint: 'Rate 800 words', apply: (fx) => { fx.streakWindow = Math.max(fx.streakWindow, 120); fx.streakKeep = Math.max(fx.streakKeep, 0.75) } },

  // The muse: rating speeds the wirdhouse up for a while.
  { id: 'muse-1', kind: 'muse', emoji: '💡', name: 'A muse', cost: 1000, desc: 'After each new word, the wirdhouse works 20% faster for 20 seconds.', req: (s) => (s.buildings.pencil || 0) >= 5, hint: 'Own 5 pencils', apply: (fx) => { fx.museMult = Math.max(fx.museMult, 1.2); fx.museSecs = Math.max(fx.museSecs, 20) } },
  { id: 'muse-2', kind: 'muse', emoji: '🎨', name: 'Inspired', cost: 25000, desc: 'The muse makes it 40% faster.', req: owns('muse-1'), hint: 'Have A muse', apply: (fx) => { fx.museMult = Math.max(fx.museMult, 1.4) } },
  { id: 'muse-3', kind: 'muse', emoji: '🎭', name: 'Lingering muse', cost: 400000, desc: 'The muse stays a minute.', req: owns('muse-2'), hint: 'Have Inspired', apply: (fx) => { fx.museSecs = Math.max(fx.museSecs, 60) } },
  { id: 'muse-4', kind: 'muse', emoji: '🌠', name: 'Divine inspiration', cost: 2e7, desc: 'The muse makes it twice as fast.', req: owns('muse-3'), hint: 'Have Lingering muse', apply: (fx) => { fx.museMult = Math.max(fx.museMult, 2) } },
  { id: 'muse-5', kind: 'muse', emoji: '🪄', name: 'Muse in residence', cost: 1e9, desc: 'The muse stays 3 minutes.', req: owns('muse-4'), hint: 'Have Divine inspiration', apply: (fx) => { fx.museSecs = Math.max(fx.museSecs, 180) } },

  // Offline: for people who come back later.
  { id: 'off-1', kind: 'offline', emoji: '🌙', name: 'Night shift', cost: 2000, desc: 'While you’re away the wirdhouse runs at 10% (from 5%).', req: (s) => (s.buildings.notebook || 0) >= 1, hint: 'Own a notebook', apply: (fx) => { fx.offlineRate = Math.max(fx.offlineRate, 0.1) } },
  { id: 'off-2', kind: 'offline', emoji: '🛌', name: 'Long nap', cost: 20000, desc: 'Earn for up to 8 hours away (from 2).', req: owns('off-1'), hint: 'Have Night shift', apply: (fx) => { fx.offlineHours = Math.max(fx.offlineHours, 8) } },
  { id: 'off-3', kind: 'offline', emoji: '🦉', name: 'Night owls', cost: 500000, desc: 'While you’re away the wirdhouse runs at 20%.', req: owns('off-2'), hint: 'Have Long nap', apply: (fx) => { fx.offlineRate = Math.max(fx.offlineRate, 0.2) } },
  { id: 'off-4', kind: 'offline', emoji: '🏝️', name: 'Long weekend', cost: 1.5e7, desc: 'Earn for up to 3 days away.', req: owns('off-3'), hint: 'Have Night owls', apply: (fx) => { fx.offlineHours = Math.max(fx.offlineHours, 72) } },
  { id: 'off-5', kind: 'offline', emoji: '🤖', name: 'Automation', cost: 8e8, desc: 'While you’re away the wirdhouse runs at 40%.', req: owns('off-4'), hint: 'Have Long weekend', apply: (fx) => { fx.offlineRate = Math.max(fx.offlineRate, 0.4) } },

  // Social: lobbies and friends.
  { id: 'social-1', kind: 'social', emoji: '🎉', name: 'Party favors', cost: 3000, desc: 'Lobby rounds pay ×3.', req: lobby(3), hint: 'Play 3 lobby rounds', apply: (fx) => { fx.lobbyMult *= 3 } },
  { id: 'social-2', kind: 'social', emoji: '👑', name: 'Host’s privilege', cost: 40000, desc: 'Lobby rounds pay ×2 more when you’re hosting.', req: both(lobby(10), owns('social-1')), hint: 'Play 10 lobby rounds', apply: (fx) => { fx.hostMult *= 2 } },
  { id: 'social-3', kind: 'social', emoji: '📖', name: 'Book club', cost: 120000, desc: 'The wirdhouse makes 10% more for each friend online.', req: (s) => (s.stats?.friendsSeen || 0) >= 1, hint: 'Be online with a friend', apply: (fx) => { fx.friendPct += 0.1 } },
  { id: 'social-4', kind: 'social', emoji: '🗣️', name: 'Table talk', cost: 2e6, desc: 'Each lobby round also pays 2 minutes of the wirdhouse’s output.', req: both(lobby(25), owns('social-1')), hint: 'Play 25 lobby rounds', apply: (fx) => { fx.lobbySecs += 120 } },
  { id: 'social-5', kind: 'social', emoji: '🫂', name: 'Inner circle', cost: 9e7, desc: 'The wirdhouse makes 25% more for each friend online.', req: owns('social-3'), hint: 'Have Book club', apply: (fx) => { fx.friendPct += 0.15 } },

  // Global.
  { id: 'glob-1', kind: 'global', emoji: '📕', name: 'Bookbinding', cost: 50000, desc: 'Everything earns 10% more.', req: allTime(20000), hint: 'Earn 20,000 coins', apply: (fx) => { fx.global *= 1.1 } },
  { id: 'glob-2', kind: 'global', emoji: '📗', name: 'Gold leaf', cost: 5e6, desc: 'Everything earns 25% more.', req: both(allTime(2e6), owns('glob-1')), hint: 'Earn 2 million coins', apply: (fx) => { fx.global *= 1.25 } },
  { id: 'glob-3', kind: 'global', emoji: '📘', name: 'Leather and brass', cost: 5e8, desc: 'Everything earns 50% more.', req: both(allTime(2e8), owns('glob-2')), hint: 'Earn 200 million coins', apply: (fx) => { fx.global *= 1.5 } },
  { id: 'glob-4', kind: 'global', emoji: '📙', name: 'First edition', cost: 5e10, desc: 'Everything earns twice as much.', req: both(allTime(2e10), owns('glob-3')), hint: 'Earn 20 billion coins', apply: (fx) => { fx.global *= 2 } }
]

export const UPGRADES = [...buildingUpgrades(), ...synergyUpgrades(), ...SPECIAL]
export const UPGRADE_KINDS = [
  ['word', 'Words', 'Coins for each new word you rate'],
  ['streak', 'Streak', 'Rating words back to back'],
  ['muse', 'Muse', 'Rating speeds the wirdhouse up'],
  ['building', 'Buildings', 'One building’s output'],
  ['synergy', 'Synergy', 'Buildings that help each other'],
  ['offline', 'Offline', 'Earnings while you’re away'],
  ['social', 'Social', 'Lobbies and friends'],
  ['global', 'Global', 'Everything']
]

// --- prestige ---------------------------------------------------------------------
//
// Publishing your dictionary resets the wirdhouse (coins, buildings and
// upgrades) for ink. Ink is never spent down from the multiplier: every ink
// you've ever earned adds +2% to everything, forever. Ink can also be spent
// on perks, which survive every edition.

export const INK_PER = 1e9 // ink grows with the cube root of all-time coins in billions
export const inkTotalFor = (allCoins) => Math.floor(Math.cbrt(Math.max(0, allCoins) / INK_PER))
export const inkGain = (s) => Math.max(0, inkTotalFor(s.allCoins) - (s.inkTotal || 0))
export const INK_BONUS = 0.02

export const PERKS = [
  { id: 'headstart', emoji: '🏁', name: 'Head start', max: 5, cost: (l) => 2 * (l + 1) ** 2, desc: (l) => `Each edition starts with ${[0, 5, 15, 30, 50, 100][l]} pencils and ${[0, 0, 5, 10, 25, 50][l]} notebooks.` },
  { id: 'seed', emoji: '🌱', name: 'Seed money', max: 5, cost: (l) => 3 * (l + 1) ** 2, desc: (l) => `Each edition starts with ${[0, 1e3, 1e4, 1e5, 1e6, 1e7][l].toLocaleString()} coins.` },
  { id: 'heirloom-streak', emoji: '🔥', name: 'Heirloom streak', max: 3, cost: (l) => 5 * (l + 1) ** 2, desc: (l) => `The streak can climb ${['no', '+0.5', '+1', '+1.5'][l]} higher, in every edition.` },
  { id: 'heirloom-offline', emoji: '🌙', name: 'Well rested', max: 3, cost: (l) => 4 * (l + 1) ** 2, desc: (l) => `Always earn at least ${[5, 10, 20, 30][l]}% while away, for at least ${[2, 8, 24, 72][l]} hours.` },
  { id: 'heirloom-muse', emoji: '💡', name: 'Old friend', max: 1, cost: () => 6, desc: (l) => (l ? 'Every edition starts with A muse.' : 'Start every edition with A muse.') },
  { id: 'scholar', emoji: '🎓', name: 'Scholar', max: 5, cost: (l) => 4 * (l + 1) ** 2, desc: (l) => `New words pay ×${1 + l} (in every edition).` },
  { id: 'patron', emoji: '🏺', name: 'Patron', max: 5, cost: (l) => 6 * (l + 1) ** 2, desc: (l) => `Everything earns +${l * 10}% more, on top of ink.` }
]
const perk = (s, id) => s.perks?.[id] || 0

// --- effects ------------------------------------------------------------------------

export function effects (s) {
  const fx = {
    building: Object.fromEntries(BUILDINGS.map((b) => [b.id, 1])),
    wordFlat: 0, wordSecs: 0, wordMult: 1, perLetter: 0, firstOfDay: 1,
    streakStep: 0.02, streakCap: 1.5, streakWindow: 60, streakKeep: 0, streakToIdle: false,
    museMult: 1, museSecs: 0,
    offlineRate: 0.05, offlineHours: 2,
    lobbyMult: 1, hostMult: 1, lobbySecs: 0, friendPct: 0,
    global: 1
  }
  for (const u of UPGRADES) if (s.upgrades.includes(u.id)) u.apply(fx, s)
  // Perks from past editions.
  fx.streakCap += 0.5 * perk(s, 'heirloom-streak')
  const rested = perk(s, 'heirloom-offline')
  fx.offlineRate = Math.max(fx.offlineRate, [0.05, 0.1, 0.2, 0.3][rested])
  fx.offlineHours = Math.max(fx.offlineHours, [2, 8, 24, 72][rested])
  if (perk(s, 'heirloom-muse')) { fx.museMult = Math.max(fx.museMult, 1.2); fx.museSecs = Math.max(fx.museSecs, 20) }
  fx.wordMult *= 1 + perk(s, 'scholar')
  fx.prestige = (1 + INK_BONUS * (s.inkTotal || 0)) * (1 + 0.1 * perk(s, 'patron'))
  return fx
}

// Coins per second from buildings alone, before the muse, streak and friends.
export function baseCps (s, fx = effects(s)) {
  let total = 0
  for (const b of BUILDINGS) total += b.cps * (s.buildings[b.id] || 0) * fx.building[b.id]
  return total * fx.global * fx.prestige
}

export function buildingCps (s, id, fx = effects(s)) {
  const b = BUILDINGS.find((x) => x.id === id)
  return b.cps * fx.building[id] * fx.global * fx.prestige
}

// The pace streak at a moment: { n, mult, endsAt }.
export function streakNow (s, now, fx = effects(s)) {
  const st = s.streak || { n: 0, last: 0 }
  if (!st.n) return { n: 0, mult: 1, endsAt: null }
  const endsAt = st.last + fx.streakWindow * 1000
  if (now > endsAt) {
    const kept = Math.floor(st.n * fx.streakKeep)
    return { n: kept, mult: streakMult(kept, fx), endsAt: null, lapsed: true }
  }
  return { n: st.n, mult: streakMult(st.n, fx), endsAt }
}
export const streakMult = (n, fx) => Math.min(fx.streakCap, 1 + n * fx.streakStep)

// Everything the wirdhouse is making right now, per second.
export function cpsNow (s, { now, friendsOnline = 0 }, fx = effects(s)) {
  let cps = baseCps(s, fx)
  if (s.museUntil && now < s.museUntil) cps *= fx.museMult
  if (fx.friendPct) cps *= 1 + fx.friendPct * friendsOnline
  if (fx.streakToIdle) cps *= Math.sqrt(streakNow(s, now, fx).mult)
  return cps
}

// What rating a new word pays: { coins, parts } where parts explains it.
// `streak` is the multiplier the word lands on (after it counts).
export function wordPay (s, { word, now, firstToday = false }, fx = effects(s)) {
  const letters = Math.max(0, String(word).length - 5)
  const flat = BASE_PER_WORD + fx.wordFlat + fx.perLetter * letters
  const fromHouse = baseCps(s, fx) * fx.wordSecs
  const streak = nextStreak(s, now, fx)
  let coins = (flat * fx.global * fx.prestige + fromHouse) * fx.wordMult * streak.mult
  if (firstToday) coins *= fx.firstOfDay
  return { coins, streak, flat, fromHouse, letters, firstToday: firstToday && fx.firstOfDay > 1 }
}

// The streak after one more rating at `now`.
export function nextStreak (s, now, fx = effects(s)) {
  const cur = streakNow(s, now, fx)
  const st = s.streak || { n: 0, last: 0 }
  let n = cur.n
  if (st.last && now - st.last < MIN_GAP_MS) n = Math.max(1, st.n) // too fast to count, too fast to break
  else n += 1
  return { n, mult: streakMult(n, fx), last: now }
}

export function lobbyPay (s, { hosting = false }, fx = effects(s)) {
  return (BASE_LOBBY_ROUND * fx.lobbyMult * (hosting ? fx.hostMult : 1) * fx.global * fx.prestige) + baseCps(s, fx) * fx.lobbySecs
}

// What the wirdhouse made while the app was closed.
export function offlinePay (s, awayMs, fx = effects(s)) {
  const secs = Math.min(awayMs / 1000, fx.offlineHours * 3600)
  return { coins: baseCps(s, fx) * fx.offlineRate * secs, secs, rate: fx.offlineRate, capped: awayMs / 1000 > fx.offlineHours * 3600 }
}

// Which upgrades can be seen in the shop, and whether they can be bought.
export function upgradeList (s) {
  return UPGRADES.map(({ apply, req, ...u }) => ({ ...u, owned: s.upgrades.includes(u.id), open: s.upgrades.includes(u.id) || req(s) }))
}

export const formatCoins = (n) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '0'
  const a = Math.abs(n)
  if (a < 1000) return a < 10 && a % 1 ? n.toFixed(1) : Math.floor(n).toLocaleString('en-US')
  if (a < 1e6) return Math.floor(n).toLocaleString('en-US')
  const units = [[1e18, 'quintillion'], [1e15, 'quadrillion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']]
  for (const [v, name] of units) if (a >= v) return `${(n / v).toFixed(n / v >= 100 ? 1 : 2)} ${name}`
  return String(Math.floor(n))
}
