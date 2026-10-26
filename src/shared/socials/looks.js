// What Socials earns you: looks (some of them badges of shame) and badges.

export const SM_GOALS = {
  first: { text: 'Post on Socials.', test: (g) => g.posts >= 1 },
  regular: { text: 'Reach 250 followers.', test: (g) => g.followers >= 250 },
  influencer: { text: 'Reach 10,000 followers.', test: (g) => g.followers >= 10000 },
  celebrity: { text: 'Reach 100,000 followers.', test: (g) => g.followers >= 100000 },
  main: { text: 'Reach a million followers.', test: (g) => g.followers >= 1e6 },
  legend: { text: 'Reach ten million followers.', test: (g) => g.followers >= 1e7 },
  viral: { text: 'Get 10,000 likes on one post.', test: (g) => g.likes >= 10000 },
  ratioed: { text: 'Get ratio’d.', test: (g) => g.ratioed },
  cancelled: { text: 'Get cancelled.', test: (g) => g.cancelled },
  comeback: { text: 'Post a Notes-app apology after getting cancelled.', test: (g) => g.comeback },
  called: { text: 'Call a word’s move right.', test: (g) => g.called },
  blue: { text: 'Buy Writter Blue.', test: (g) => g.blue },
  karma: { text: 'Reach 50,000 readit karma.', test: (g) => g.karma >= 50000 }
}

const look = (kind, id, name, goal, desc, extra = {}) => ({ kind, id, name, price: null, rarity: 'socials', sm: goal, desc, ...extra })
export const SOCIALS_COSMETICS = [
  look('title', 'sm-poster', 'Poster', 'first', 'From Socials.', { text: 'Poster' }),
  look('title', 'sm-influencer', 'Influencer', 'influencer', 'From Socials.', { text: 'Influencer' }),
  look('title', 'sm-main', 'Main Character', 'main', 'From Socials.', { text: 'Main Character' }),
  look('title', 'sm-legend', 'Lexicon Legend', 'legend', 'From Socials.', { text: 'Lexicon Legend' }),
  look('title', 'sm-boughtcheck', 'Bought the Check', 'blue', 'From Socials. A badge of shame.', { text: 'Bought the Check' }),
  look('title', 'sm-cancelled', 'Cancelled', 'cancelled', 'From Socials. A badge of shame.', { text: 'Cancelled' }),
  look('title', 'sm-prophet', 'Prophet', 'called', 'From Socials.', { text: 'Prophet' }),
  look('name', 'sm-viral', 'Viral', 'viral', 'From Socials. It spreads.', { grad: ['#ff3a6a', '#ffb83a', '#3ac8ff', '#ff3a6a'], move: true }),
  look('name', 'sm-ratiod', 'Ratio’d', 'ratioed', 'From Socials. Replies outnumbered likes.', { grad: ['#8a8a96', '#c83a3a', '#8a8a96'], move: false }),
  look('frame', 'sm-check', 'Verified', 'celebrity', 'From Socials. A real check, earned.', { ring: ['#1d9bf0', '#8ad0ff', '#1d9bf0', '#ffffff', '#1d9bf0'], spin: true }),
  look('frame', 'sm-goldquill', 'Golden Quill', 'karma', 'From Socials. readit’s finest award.', { ring: ['#f2c23e', '#fff4c2', '#c8962a', '#f2c23e'], spin: true }),
  look('confetti', 'sm-engagement', 'Engagement', 'regular', 'From Socials. Likes, reposts and replies.', { emoji: ['❤️', '🔁', '💬', '📈'] }),
  look('cardBack', 'sm-timeline', 'Timeline', 'comeback', 'From Socials. An endless scroll.', { back: 'repeating-linear-gradient(0deg, #15202b 0 22px, #22303c 22px 23px), #15202b' })
]

export const SOCIALS_BADGES = [
  { id: 'sm-post', emoji: '💬', name: 'Posted', hint: 'Post on Socials.', test: (s) => s.smPosts >= 1 },
  { id: 'sm-influencer', emoji: '📣', name: 'Influencer', hint: 'Reach 10,000 followers on Socials.', test: (s) => s.smFollowers >= 10000 },
  { id: 'sm-main', emoji: '🎬', name: 'Main Character', hint: 'Reach a million followers on Socials.', test: (s) => s.smFollowers >= 1e6 },
  { id: 'sm-viral', emoji: '🔥', name: 'Went viral', hint: 'Get 10,000 likes on one post.', test: (s) => s.smLikes >= 10000 },
  { id: 'sm-ratio', emoji: '💀', name: 'Ratio’d', hint: 'Get more replies than likes.', test: (s) => s.smRatioed >= 1 },
  { id: 'sm-cancel', emoji: '🙊', name: 'Cancelled', hint: 'Get cancelled on Socials.', test: (s) => s.smCancelled >= 1 },
  { id: 'sm-called', emoji: '🔮', name: 'Called it', hint: 'Call a word’s move right on Socials.', test: (s) => s.smCalled >= 1 },
  { id: 'sm-blue', emoji: '☑️', name: 'Bought the check', hint: 'Buy Writter Blue.', test: (s) => s.smBlue >= 1 },
  { id: 'sm-legacy', emoji: '✅', name: 'Legacy verified', hint: 'Reach 100,000 followers.', test: (s) => s.smLegacy >= 1 }
]
