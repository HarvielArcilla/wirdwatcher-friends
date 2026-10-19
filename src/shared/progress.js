// Progression: XP, levels, titles and badges. Pure functions, used by the
// background process (which awards) and the window (which shows).

export const XP = {
  rating: 10, // a word you hadn't rated before
  firstOfDay: 20, // first rating each day
  streakDay: 5, // per day of streak, on the first rating of the day (up to 10 days)
  daily: 40, // the word of the day
  comment: 5, // first comment on a word
  chainWord: 5, // per word, when you finish a synonym chain
  playlist: 100, // finishing one of your own playlists (10+ words)
  flow: 25, // every 10 ratings in one sitting
  lobbyRound: 15,
  lobbyGame: 50,
  hiveMind: 20, // everyone at the table within 0.5
  twin: 10 // same rating as a friend
}

// XP needed to go from level L to L+1.
export const stepFor = (level) => 100 + 40 * (level - 1)

export function levelFor (xp) {
  let level = 1
  let floor = 0
  while (xp >= floor + stepFor(level)) { floor += stepFor(level); level++ }
  return { level, into: xp - floor, step: stepFor(level), xp }
}

const TITLES = ['Glancer', 'Skimmer', 'Reader', 'Watcher', 'Word Watcher', 'Wordsmith', 'Lexicographer', 'Etymologist', 'Oracle of Words', 'Wird Sage']
export const titleFor = (level) => TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 5))]

// stats: see Store.stats(). Each badge: id, name, hint, emoji, test(stats).
export const BADGES = [
  { id: 'first', emoji: '🐣', name: 'First word', hint: 'Rate a word.', test: (s) => s.rated >= 1 },
  { id: 'ten', emoji: '🔟', name: 'Warming up', hint: 'Rate 10 words.', test: (s) => s.rated >= 10 },
  { id: 'hundred', emoji: '💯', name: 'Centurion', hint: 'Rate 100 words.', test: (s) => s.rated >= 100 },
  { id: 'thousand', emoji: '📚', name: 'Bookworm', hint: 'Rate 1,000 words.', test: (s) => s.rated >= 1000 },
  { id: 'tenk', emoji: '🏛️', name: 'Living dictionary', hint: 'Rate 10,000 words.', test: (s) => s.rated >= 10000 },
  { id: 'perfect', emoji: '🌟', name: 'Flawless', hint: 'Give a word a 5.0.', test: (s) => s.fives >= 1 },
  { id: 'zero', emoji: '🕳️', name: 'The void', hint: 'Give a word a 0.0.', test: (s) => s.zeros >= 1 },
  { id: 'fence', emoji: '🤷', name: 'Fence sitter', hint: 'Give ten words exactly 2.5.', test: (s) => s.middles >= 10 },
  { id: 'harsh', emoji: '🧐', name: 'Harsh critic', hint: 'Rate 25 words 1.0 or lower.', test: (s) => s.lows >= 25 },
  { id: 'soft', emoji: '🧸', name: 'Soft touch', hint: 'Rate 25 words 4.5 or higher.', test: (s) => s.highs >= 25 },
  { id: 'allpos', emoji: '🧩', name: 'Parts of speech', hint: 'Rate a noun, a verb, an adjective and an adverb.', test: (s) => ['n', 'v', 'a', 'r'].every((p) => s.byPos[p] > 0) },
  { id: 'explorer', emoji: '🧭', name: 'Explorer', hint: 'Rate words from every topic playlist.', test: (s) => s.topicsTouched >= s.topicsTotal },
  { id: 'tiny', emoji: '🐜', name: 'Tiny', hint: 'Rate a two-letter word.', test: (s) => s.shortest > 0 && s.shortest <= 2 },
  { id: 'mouthful', emoji: '🐍', name: 'Mouthful', hint: 'Rate a word of 15 letters or more.', test: (s) => s.longest >= 15 },
  { id: 'daily', emoji: '📅', name: 'Daily reader', hint: 'Rate the word of the day.', test: (s) => s.dailies >= 1 },
  { id: 'streak7', emoji: '🔥', name: 'On fire', hint: 'Rate words seven days in a row.', test: (s) => s.bestStreak >= 7 },
  { id: 'streak30', emoji: '🌋', name: 'Unstoppable', hint: 'Rate words thirty days in a row.', test: (s) => s.bestStreak >= 30 },
  { id: 'chain', emoji: '🔗', name: 'Chain reaction', hint: 'Finish a synonym chain.', test: (s) => s.chains >= 1 },
  { id: 'chain10', emoji: '⛓️', name: 'Chain gang', hint: 'Finish ten synonym chains.', test: (s) => s.chains >= 10 },
  { id: 'curator', emoji: '🎧', name: 'Curator', hint: 'Make a playlist of 10 or more words.', test: (s) => s.biggestPlaylist >= 10 },
  { id: 'finisher', emoji: '🏁', name: 'Finisher', hint: 'Rate every word in a playlist of 10 or more.', test: (s) => s.playlistsDone >= 1 },
  { id: 'critic', emoji: '✍️', name: 'Critic', hint: 'Comment on 10 words.', test: (s) => s.comments >= 10 },
  { id: 'collector', emoji: '💛', name: 'Collector', hint: 'Favorite 25 words.', test: (s) => s.favorites >= 25 },
  { id: 'friend', emoji: '🤝', name: 'Pen pal', hint: 'Add a friend.', test: (s) => s.friends >= 1 },
  { id: 'friends5', emoji: '🎉', name: 'Book club', hint: 'Have five friends.', test: (s) => s.friends >= 5 },
  { id: 'twin', emoji: '👯', name: 'Twins', hint: 'Give a word the same rating as a friend.', test: (s) => s.twins >= 1 },
  { id: 'lobby', emoji: '🪑', name: 'Pull up a chair', hint: 'Finish a lobby game.', test: (s) => s.lobbyGames >= 1 },
  { id: 'fulltable', emoji: '🎱', name: 'Full table', hint: 'Finish a lobby game with eight players.', test: (s) => s.fullTables >= 1 },
  { id: 'hive', emoji: '🤝', name: 'In sync', hint: 'Everyone at a table rates a word within 0.5 of each other.', test: (s) => s.hiveMinds >= 1 },
  { id: 'hottake', emoji: '🌶️', name: 'Hot take', hint: 'Be 2.0 away from everyone else at the table.', test: (s) => s.hotTakes >= 1 },
  { id: 'owl', emoji: '🦉', name: 'Night owl', hint: 'Rate a word between 2 and 5 in the morning.', test: (s) => s.owl >= 1 },
  // Volume and dedication
  { id: 'fivehundred', emoji: '📖', name: 'Paperback', hint: 'Rate 500 words.', test: (s) => s.rated >= 500 },
  { id: 'fivek', emoji: '🗄️', name: 'Card catalog', hint: 'Rate 5,000 words.', test: (s) => s.rated >= 5000 },
  { id: 'twentyfivek', emoji: '🏔️', name: 'Summit', hint: 'Rate 25,000 words.', test: (s) => s.rated >= 25000 },
  { id: 'sitting20', emoji: '⚡', name: 'Speed reader', hint: 'Rate 20 new words in one sitting.', test: (s) => s.bestSession >= 20 },
  { id: 'sitting100', emoji: '🏃', name: 'Marathon', hint: 'Rate 100 new words in one sitting.', test: (s) => s.bestSession >= 100 },
  { id: 'streak100', emoji: '💎', name: 'Diamond streak', hint: 'Rate words 100 days in a row.', test: (s) => s.bestStreak >= 100 },
  { id: 'early', emoji: '🐦', name: 'Early bird', hint: 'Rate a word between 5 and 7 in the morning.', test: (s) => s.earlyBird >= 1 },
  { id: 'weekend', emoji: '🛋️', name: 'Weekend wordsmith', hint: 'Rate words on a Saturday and the Sunday after.', test: (s) => s.weekends >= 1 },
  { id: 'level10', emoji: '🎖️', name: 'Double digits', hint: 'Reach level 10.', test: (s) => s.level >= 10 },
  { id: 'level25', emoji: '🏅', name: 'Seasoned', hint: 'Reach level 25.', test: (s) => s.level >= 25 },
  // How you rate
  { id: 'perfect10', emoji: '✨', name: 'Perfectionist', hint: 'Give ten words a 5.0.', test: (s) => s.fives >= 10 },
  { id: 'zero10', emoji: '🌑', name: 'Abyss gazer', hint: 'Give ten words a 0.0.', test: (s) => s.zeros >= 10 },
  { id: 'spectrum', emoji: '🌈', name: 'Full spectrum', hint: 'Use 25 different ratings.', test: (s) => s.distinct >= 25 },
  { id: 'everyrating', emoji: '🎚️', name: 'Every notch', hint: 'Use all 51 ratings from 0.0 to 5.0.', test: (s) => s.distinct >= 51 },
  { id: 'optimist', emoji: '🌻', name: 'Optimist', hint: 'Average 4.0 or more over 100 words.', test: (s) => s.rated >= 100 && s.average >= 4 },
  { id: 'curmudgeon', emoji: '🌧️', name: 'Curmudgeon', hint: 'Average under 2.0 over 100 words.', test: (s) => s.rated >= 100 && s.average < 2 },
  // The words themselves
  { id: 'alphabet', emoji: '🔤', name: 'A to Z', hint: 'Rate a word starting with every letter.', test: (s) => s.letters >= 26 },
  { id: 'palindrome', emoji: '🪞', name: 'Racecar', hint: 'Rate a palindrome, a word spelled the same backwards.', test: (s) => s.palindromes >= 1 },
  { id: 'qnou', emoji: '🦆', name: 'Q without U', hint: 'Rate a word with a Q not followed by a U.', test: (s) => s.qNoU >= 1 },
  { id: 'vowelless', emoji: '🤐', name: 'Vowel-free', hint: 'Rate a word of three letters or more with no a, e, i, o or u.', test: (s) => s.vowelless >= 1 },
  { id: 'zoologist', emoji: '🦒', name: 'Zoologist', hint: 'Rate 50 animal words.', test: (s) => (s.byTopic.animals || 0) >= 50 },
  { id: 'gourmet', emoji: '🧑‍🍳', name: 'Gourmet', hint: 'Rate 50 food and drink words.', test: (s) => (s.byTopic.food || 0) >= 50 },
  { id: 'botanist', emoji: '🌱', name: 'Botanist', hint: 'Rate 50 plant words.', test: (s) => (s.byTopic.plants || 0) >= 50 },
  { id: 'feelings', emoji: '🫶', name: 'In your feelings', hint: 'Rate 50 feelings words.', test: (s) => (s.byTopic.feelings || 0) >= 50 },
  // Finding words
  { id: 'skipper', emoji: '⏭️', name: 'Not today', hint: 'Skip a word with →.', test: (s) => s.skips >= 1 },
  { id: 'detective', emoji: '🔎', name: 'Reverse dictionary', hint: 'Open 10 words you found by their meaning.', test: (s) => s.meaningSearches >= 10 },
  { id: 'thesaurus', emoji: '🧭', name: 'Thesaurus hopper', hint: 'Jump to 25 synonyms.', test: (s) => s.synonymsOpened >= 25 },
  // Friends and the table
  { id: 'friends10', emoji: '🏟️', name: 'Full house', hint: 'Have ten friends.', test: (s) => s.friends >= 10 },
  { id: 'soulmate', emoji: '🧬', name: 'Taste twin', hint: 'Reach a 90% taste match with a friend over 25 shared words.', test: (s) => s.maxMatch >= 90 },
  { id: 'opposites', emoji: '🧲', name: 'Opposites attract', hint: 'Stay friends at under 50% taste match over 25 shared words.', test: (s) => s.matched > 0 && s.minMatch < 50 },
  { id: 'host', emoji: '🎩', name: 'Host with the most', hint: 'Host five lobbies.', test: (s) => s.hosted >= 5 },
  { id: 'regular', emoji: '🍻', name: 'Regular', hint: 'Finish ten lobby games.', test: (s) => s.lobbyGames >= 10 },
  { id: 'hive10', emoji: '🎼', name: 'Perfect harmony', hint: 'Ten in-sync words at a table.', test: (s) => s.hiveMinds >= 10 },
  { id: 'mindreader', emoji: '🔮', name: 'Mind reader', hint: 'In High/Low, guess both the highest and the lowest.', test: (s) => s.mindReads >= 1 },
  { id: 'telepath', emoji: '🧠', name: 'Telepath', hint: 'In Hot seat, predict the rating within 0.1.', test: (s) => s.exactReads >= 1 },
  { id: 'bullseye', emoji: '🎯', name: 'Bullseye', hint: 'In Hive mind, land within 0.1 of your target.', test: (s) => s.bullseyes >= 1 },
  { id: 'allmodes', emoji: '🎲', name: 'Tried them all', hint: 'Finish a lobby game in every mode.', test: (s) => ['classic', 'highlow', 'hotseat', 'hive'].every((m) => s[`games_${m}`] >= 1) },
  { id: 'hottake5', emoji: '🔥', name: 'Contrarian', hint: 'Five hot takes at a table.', test: (s) => s.hotTakes >= 5 },
  // Rating, a little further.
  { id: 'longword', emoji: '📏', name: 'Sesquipedalian', hint: 'Rate a word of 15 letters or more.', test: (s) => s.longest >= 15 },
  { id: 'chatterbox', emoji: '💬', name: 'Chatterbox', hint: 'Leave 50 comments.', test: (s) => s.comments >= 50 },
  { id: 'hoarder', emoji: '🗃️', name: 'Hoarder', hint: 'Keep 100 favorites.', test: (s) => s.favorites >= 100 },
  { id: 'fiftyk', emoji: '🌍', name: 'Lexicon', hint: 'Rate 50,000 words.', test: (s) => s.rated >= 50000 },
  // Coins and the wirdhouse.
  { id: 'coin1k', emoji: '🪙', name: 'Pocket change', hint: 'Earn 1,000 coins.', test: (s) => s.ecoEver >= 1e3 },
  { id: 'coin1m', emoji: '💰', name: 'Millionaire', hint: 'Earn a million coins.', test: (s) => s.ecoEver >= 1e6 },
  { id: 'coin1b', emoji: '🏦', name: 'Billionaire', hint: 'Earn a billion coins.', test: (s) => s.ecoEver >= 1e9 },
  { id: 'coin1t', emoji: '🌌', name: 'Trillionaire', hint: 'Earn a trillion coins.', test: (s) => s.ecoEver >= 1e12 },
  { id: 'builder', emoji: '🏗️', name: 'Builder', hint: 'Own 100 buildings at once.', test: (s) => s.ecoBuildings >= 100 },
  { id: 'tycoon', emoji: '🏰', name: 'Tycoon', hint: 'Own one of every building.', test: (s) => s.ecoKinds >= 12 },
  { id: 'tinkerer', emoji: '🔧', name: 'Tinkerer', hint: 'Own 25 upgrades at once.', test: (s) => s.ecoUpgrades >= 25 },
  { id: 'engineer', emoji: '⚙️', name: 'Engineer', hint: 'Own 75 upgrades at once.', test: (s) => s.ecoUpgrades >= 75 },
  { id: 'published', emoji: '📖', name: 'Published', hint: 'Publish your dictionary.', test: (s) => s.ecoEditions >= 1 },
  { id: 'prolific', emoji: '📚', name: 'Prolific', hint: 'Publish five times.', test: (s) => s.ecoEditions >= 5 },
  { id: 'perked', emoji: '🎓', name: 'Well read', hint: 'Buy 10 levels of ink perks.', test: (s) => s.ecoPerks >= 10 },
  { id: 'pace25', emoji: '🏃', name: 'In the flow', hint: 'Rate 25 new words in a pace streak.', test: (s) => s.ecoPace >= 25 },
  { id: 'pace100', emoji: '🌪️', name: 'Unbroken', hint: 'Rate 100 new words in a pace streak.', test: (s) => s.ecoPace >= 100 },
  // The coinflip.
  { id: 'flipper', emoji: '🪙', name: 'Heads or tails', hint: 'Flip a coin.', test: (s) => s.ecoFlips >= 1 },
  { id: 'flip5', emoji: '🍀', name: 'Lucky streak', hint: 'Win 5 flips in a row.', test: (s) => s.ecoFlipBest >= 5 },
  { id: 'flip10', emoji: '🎰', name: 'Unlikely', hint: 'Win 10 flips in a row.', test: (s) => s.ecoFlipBest >= 10 },
  { id: 'flipbad', emoji: '🌧️', name: 'Down bad', hint: 'Lose 7 flips in a row.', test: (s) => s.ecoFlipWorst >= 7 },
  { id: 'highroller', emoji: '🎲', name: 'High roller', hint: 'Flip a billion coins at once.', test: (s) => s.ecoFlipBig >= 1e9 },
  // The shop.
  { id: 'shopper', emoji: '🛍️', name: 'Window shopper', hint: 'Buy something in the shop.', test: (s) => s.ecoCosmetics >= 1 },
  { id: 'wardrobe', emoji: '👗', name: 'Wardrobe', hint: 'Own 25 things from the shop.', test: (s) => s.ecoCosmetics >= 25 }
]

// Rating input: what the box shows after each keystroke, like the original
// wirdwatcher. "4" → "4.", "47" → "4.7", "5" → "5.0". Returns the new text.
export function typeRating (text) {
  const digits = String(text || '').replace(/[^0-9]/g, '')
  if (!digits) return ''
  const a = digits[0]
  if (a === '5') return '5.0'
  if (a > '5') return ''
  if (digits.length === 1) return `${a}.`
  return `${a}.${digits[1]}`
}

// "4.7" → 4.7, and "4." → 4.0, so one key and Enter is enough.
export function ratingValue (text) {
  const m = /^([0-5])\.([0-9]?)$/.exec(String(text || ''))
  if (!m) return null
  const v = Number(`${m[1]}.${m[2] || 0}`)
  return v <= 5 ? v : null
}
export const formatRating = (r) => (Math.round(r * 10) / 10).toFixed(1)

// Nudges a rating by delta, staying within 0.0–5.0.
export function nudge (r, delta) {
  const v = Math.round(((Number.isFinite(r) ? r : 2.5) + delta) * 10) / 10
  return Math.max(0, Math.min(5, v))
}

// What happened at a lobby table this round. ratings: { playerId: r }.
export function roundVerdict (ratings) {
  const ids = Object.keys(ratings)
  const vals = ids.map((id) => ratings[id])
  if (vals.length < 2) return { mean: vals[0] ?? null, spread: 0, hive: false, hotTake: null, twins: [] }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const spread = Math.max(...vals) - Math.min(...vals)
  const hive = vals.length >= 2 && spread <= 0.5
  let hotTake = null
  if (vals.length >= 3) {
    for (const id of ids) {
      const others = ids.filter((o) => o !== id).map((o) => ratings[o])
      if (others.every((o) => Math.abs(o - ratings[id]) >= 2)) { hotTake = id; break }
    }
  }
  const twins = []
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (ratings[ids[i]] === ratings[ids[j]]) twins.push([ids[i], ids[j]])
  return { mean, spread, hive, hotTake, twins }
}
