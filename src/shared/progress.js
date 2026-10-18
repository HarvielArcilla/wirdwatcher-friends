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
  { id: 'hive', emoji: '🐝', name: 'Hive mind', hint: 'Everyone at the table rates within 0.5 of each other.', test: (s) => s.hiveMinds >= 1 },
  { id: 'hottake', emoji: '🌶️', name: 'Hot take', hint: 'Be 2.0 away from everyone else at the table.', test: (s) => s.hotTakes >= 1 },
  { id: 'owl', emoji: '🦉', name: 'Night owl', hint: 'Rate a word between 2 and 5 in the morning.', test: (s) => s.owl >= 1 }
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

export const ratingValue = (text) => /^[0-5]\.[0-9]$/.test(text) && Number(text) <= 5 ? Number(text) : null
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
