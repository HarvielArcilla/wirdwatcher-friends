// Catchword's goals, the looks they earn and the badges (checked with the
// rest, see src/shared/progress.js; the numbers come in prefixed cw).

export const blankProgress = () => ({ games: 0, wins: 0, byDiff: { casual: 0, normal: 0, brutal: 0 }, fastest: null, starts: {}, beatRuling: 0, quietWins: 0, allRegions: 0, best: 0, words: [] })

export const CW_GOALS = {
  play: { text: 'Play a game of Catchword.', test: (p) => p.games >= 1 },
  reach: { text: 'Get a word to every region in one game.', test: (p) => p.allRegions >= 1 },
  win: { text: 'Get the whole world to absorb a word.', test: (p) => p.wins >= 1 },
  fast: { text: 'Win in 250 days or fewer.', test: (p) => p.fastest !== null && p.fastest <= 250 },
  quiet: { text: 'Win before the Purists get a quarter of the way to a ruling.', test: (p) => p.quietWins >= 1 },
  survive: { text: 'Win after the Purists’ ruling has passed.', test: (p) => p.beatRuling >= 1 },
  brutal: { text: 'Win on Brutal.', test: (p) => p.byDiff.brutal >= 1 },
  wins5: { text: 'Win five games.', test: (p) => p.wins >= 5 },
  starts5: { text: 'Win starting from five different regions.', test: (p) => Object.keys(p.starts).length >= 5 }
}

const look = (kind, id, name, goal, desc, extra = {}) => ({ kind, id, name, price: null, rarity: 'catchword', cw: goal, desc, ...extra })
export const CATCHWORD_COSMETICS = [
  look('title', 'cw-coiner', 'Coiner', 'play', 'From Catchword.', { text: 'Coiner' }),
  look('frame', 'cw-globe', 'Globe', 'win', 'From Catchword. Sea, land and a little cloud.', { ring: ['#3a7ad0', '#5ab870', '#e8f0f8', '#3a7ad0', '#5ab870', '#3a7ad0'], spin: true }),
  look('cardBack', 'cw-map', 'Flight paths', 'reach', 'From Catchword. Dotted routes over the sea.', { back: 'radial-gradient(circle at 30% 40%, #f2b84b 0 3px, transparent 4px), radial-gradient(circle at 72% 64%, #f2b84b 0 3px, transparent 4px), repeating-linear-gradient(35deg, transparent 0 9px, rgba(255,255,255,.35) 9px 12px), linear-gradient(160deg, #1e4f86, #2a78b8)' }),
  look('name', 'cw-viral', 'Viral', 'fast', 'From Catchword. Spreads across your name.', { grad: ['#ff6a5a', '#ffb84b', '#ff5aa8', '#ff6a5a'], move: true }),
  look('title', 'cw-lingua', 'Lingua franca', 'brutal', 'From Catchword.', { text: 'Lingua franca' }),
  look('confetti', 'cw-bubbles', 'Speech bubbles', 'survive', 'From Catchword. Everybody’s talking.', { emoji: ['💬', '🗯️', '💭', '🌍'] }),
  look('title', 'cw-sleeper', 'Sleeper hit', 'quiet', 'From Catchword.', { text: 'Sleeper hit' }),
  look('table', 'cw-atlas', 'Atlas', 'wins5', 'From Catchword. An old sea chart.', { felt: 'repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 1px, transparent 1px 48px), repeating-linear-gradient(90deg, rgba(255,255,255,.06) 0 1px, transparent 1px 48px), radial-gradient(ellipse at 50% 40%, #2a6a9a, #123a5a 75%)', rim: '#7a5a30' }),
  look('frame', 'cw-compass', 'Compass rose', 'starts5', 'From Catchword. Every direction.', { ring: ['#f2d58b', '#8a5a2a', '#f2d58b', '#c23a3a', '#f2d58b', '#8a5a2a'], spin: true })
]

export const CATCHWORD_BADGES = [
  { id: 'cw-play', emoji: '🗣️', name: 'Coined it', hint: 'Play a game of Catchword.', test: (s) => s.cwGames >= 1 },
  { id: 'cw-reach', emoji: '✈️', name: 'Frequent flyer', hint: 'Get a Catchword word to every region.', test: (s) => s.cwAllRegions >= 1 },
  { id: 'cw-win', emoji: '🌍', name: 'In every dictionary', hint: 'Win a game of Catchword.', test: (s) => s.cwWins >= 1 },
  { id: 'cw-fast', emoji: '⚡', name: 'Overnight sensation', hint: 'Win Catchword in 250 days or fewer.', test: (s) => s.cwFast >= 1 },
  { id: 'cw-survive', emoji: '📜', name: 'Overruled', hint: 'Win Catchword after the Purists’ ruling.', test: (s) => s.cwSurvive >= 1 },
  { id: 'cw-brutal', emoji: '🔥', name: 'Lingua franca', hint: 'Win Catchword on Brutal.', test: (s) => s.cwBrutal >= 1 }
]

export const MIN_RATED_CW = 10
