// Your posts: what they say, how far they reach, and what that does to your
// following. Everything here is a function of the post itself (which keeps
// your follower count and Blue tier at the moment you posted) and shared
// facts, so a friend looking at your post sees the same numbers you do.

import { hash32 } from '../market.js'
import { rng } from './feed.js'
import { STANCE, SUB, BLUE_TIER } from './content.js'

const HOUR = 3600e3
const DAY = 24 * HOUR
const cap = (w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)
const pick = (r, a) => a[Math.floor(r() * a.length)]

// --- what it says ----------------------------------------------------------------------------
// post: { site, sub, kind, word, stance, call: { dir, pct, days }, brag, extra }
export function render (post) {
  const W = post.word ? post.word.toUpperCase() : ''
  const extra = post.extra ? String(post.extra).trim() : ''
  let title = null
  let text = ''
  const ad = post.sponsor && post.disclosed ? ' #ad' : ''
  if (post.kind === 'take') text = `${cap(post.word)} ${STANCE[post.stance]?.text || 'is a word'}`
  else if (post.kind === 'call') text = `$${W} is going ${post.call.dir === 'up' ? 'up' : 'down'} ${post.call.pct}% in the next ${post.call.days} days. Screenshot this.`
  else if (post.kind === 'brag') text = post.brag || 'I did a thing.'
  else if (post.kind === 'apology') text = 'I want to apologize to anyone I hurt with my recent post. That isn’t who I am. I’m taking some time to reflect and learn. 🙏'
  else if (post.kind === 'sponsored') text = post.brag || 'Big thanks to our sponsor!'
  else text = extra
  if (post.kind !== 'say' && extra) text = `${text}\n\n${extra}`
  if (post.site === 'readit') {
    if (post.kind === 'call') title = `${post.call.dir === 'up' ? 'DD' : 'Bear case'}: $${W} ${post.call.dir === 'up' ? 'to the moon 🚀' : 'is going to zero'} (${post.call.pct}% in ${post.call.days} days)`
    else if (post.kind === 'take') title = post.sub === 'AmITheAsterisk' ? `AITA for saying ${post.word} ${STANCE[post.stance]?.text}?` : `${cap(post.word)} ${STANCE[post.stance]?.text}`
    else if (post.kind === 'apology') title = 'An apology'
    else title = (extra || text).split('\n')[0].slice(0, 120)
  }
  if (post.site === 'wirdin') {
    if (post.kind === 'brag') text = `I’m thrilled to announce: ${post.brag.replace(/[.!]$/, '')}. 🎉\n\nIt wasn’t easy. There were days I wanted to give up.\n\nBut I kept going.${extra ? `\n\n${extra}` : ''}\n\nAgree?`
    else if (post.kind === 'take') text = `Unpopular opinion: ${post.word} ${STANCE[post.stance]?.text}.\n\nHere’s what it taught me about leadership. 👇${extra ? `\n\n${extra}` : ''}\n\nAgree?`
    else if (post.kind === 'call') text = `I’m bullish on ${post.word}.\n\nNot because of the numbers.\n\nBecause of the people.\n\n(Target: ${post.call.dir === 'up' ? '+' : '-'}${post.call.pct}% in ${post.call.days} days.)\n\nAgree?`
  }
  return { title, text: text + ad }
}

// --- how far it goes -------------------------------------------------------------------------
const BLUE_REACH = { blue: 1.25, premium: 1.3, plus: 1.34, diamond: 1.37, checkcheck: 1.39 }
// The crowd's lean on a word: -1 (hate) to 1 (love).
const lean = (cr) => (cr - 2.5) / 2.5

// world: ctx.at(post.t); cr: ctx.consensus(word). Returns the post's eventual counts.
export function engagement (post, world, cr = 2.5) {
  const r = rng(hash32(`me|${post.id}`))
  const u = r()
  const luck = u < 0.02 ? 25 + r() * 80 : u < 0.09 ? 4 + r() * 10 : 0.3 + r() * 1.9
  const f0 = Math.max(0, post.f0 || 0)
  let reach = (12 + Math.pow(f0, 0.86) * 0.8) * luck
  if (post.site === 'writter' && post.blue) reach *= BLUE_REACH[post.blue] || 1.2
  if (post.legacy && post.site === 'writter') reach *= 1.1
  // A hot word travels.
  const movers = [...(world?.movers?.up || []), ...(world?.movers?.down || [])].map((m) => m.word)
  if (post.word && movers.includes(post.word)) reach *= 2
  // Posting too much buries you.
  reach *= Math.pow(0.7, Math.max(0, (post.spam || 0) - 2))
  // How controversial: a take against the crowd, or a big call.
  let c = 0
  if (post.kind === 'take') c = Math.min(1, Math.abs((STANCE[post.stance]?.s || 0) - lean(cr)) / 2)
  if (post.kind === 'call') c = Math.min(1, post.call.pct / 120)
  if (post.kind === 'apology') c = 0.7
  if (post.sponsor && !post.disclosed) c = Math.max(c, 0.4)
  // Where you post it.
  let fit = 1
  let ratio = 0.9 - 0.55 * c
  if (post.site === 'readit') {
    const s = SUB[post.sub]
    const kind = post.kind === 'call' ? 'call' : post.kind === 'brag' ? 'brag' : post.kind === 'take' && c > 0.5 ? 'contrarian' : post.kind
    reach = Math.sqrt(s?.members || 1e5) * 0.05 * luck + reach * 0.25
    if (s?.likes?.includes(kind) || (kind === 'contrarian' && s?.likes?.includes('take'))) fit = 1.8
    if (s?.hates?.includes(kind)) { fit = 0.5; ratio = 0.2 + r() * 0.15 }
    if (post.sub === 'UnpopularWirdions') ratio = 0.45 + 0.5 * c // upvote if you disagree
  }
  if (post.site === 'wirdin') { fit = post.kind === 'brag' ? 1.7 : post.kind === 'take' ? 0.8 : 1; ratio = 1 }
  reach *= fit
  const likes = Math.round(reach * (1 - 0.45 * c))
  const replies = Math.round(reach * (0.05 + 0.4 * c * c) * (post.site === 'writter' && post.blue ? 1.4 : 1))
  const out = { likes, replies, reposts: Math.round(reach * (0.06 + 0.12 * (1 - c)) * luck * 0.3), views: Math.round(reach * (30 + r() * 40)), tau: post.site === 'readit' ? 4 * HOUR : post.site === 'wirdin' ? 6 * HOUR : 1.6 * HOUR, c }
  if (post.site === 'readit') { out.score = Math.round(reach * (2 * ratio - 1)); out.ratio = ratio; out.comments = replies }
  // Ratio'd: more replies than likes on a take people hate.
  out.ratioed = post.site === 'writter' && replies > likes
  // Cancelled: ratio'd hard, in front of a lot of people.
  out.cancelled = post.site !== 'wirdin' && replies > likes * 1.6 && replies > 400 && post.kind !== 'apology'
  // An ad without #ad: sometimes someone notices.
  if (post.sponsor && !post.disclosed && r() < 0.35) { out.exposed = true; out.cancelled = true }
  return out
}

export const growth = (age, tau) => 0.12 * (1 - Math.exp(-age / 240e3)) + 0.88 * (1 - Math.exp(-age / tau))
export function countsAt (post, eng, t) {
  const k = growth(Math.max(0, t - post.t), eng.tau)
  const out = {}
  for (const key of ['likes', 'replies', 'reposts', 'views', 'score', 'comments']) if (eng[key] !== undefined) out[key] = Math.round(eng[key] * k)
  return out
}

// A market call, graded by the real (shared) price once its time is up.
// prices: (word, t) → price. Returns null until it's due.
export function gradeCall (post, prices, now) {
  if (post.kind !== 'call') return null
  const due = post.t + post.call.days * DAY
  if (now < due) return null
  const p0 = prices(post.word, post.t)
  const p1 = prices(post.word, due)
  if (!p0 || !p1) return null
  const move = (p1 / p0 - 1) * 100
  const want = post.call.dir === 'up' ? move > 0 : move < 0
  const hit = post.call.dir === 'up' ? move >= post.call.pct : move <= -post.call.pct
  return { move: Math.round(move * 10) / 10, right: want, nailed: hit, due }
}

// What one post has done to your followers by time t.
export function followerGain (post, eng, t, grade = null) {
  const k = growth(Math.max(0, t - post.t), eng.tau)
  let g = 0
  if (post.site === 'writter') g = (eng.likes * 0.05 + eng.reposts * 0.5) * k
  if (post.site === 'readit') g = Math.max(0, eng.score || 0) * 0.02 * k
  if (post.site === 'wirdin') g = eng.likes * 0.04 * k
  if (eng.ratioed) g -= eng.replies * 0.05 * k
  if (eng.cancelled) g -= (post.f0 || 0) * 0.3 * Math.min(1, Math.max(0, t - post.t) / DAY)
  if (grade) g += grade.right ? (post.f0 || 0) * (grade.nailed ? 0.12 : 0.04) + 30 : -((post.f0 || 0) * 0.05 + 10)
  return g
}

// --- replies to you --------------------------------------------------------------------------
const MINE = {
  agree: ['Finally someone said it', 'This. So much this.', 'Real', 'Exactly what I’ve been saying', 'You’re so right', 'Based', 'Underrated post'],
  disagree: ['Delete this', 'Worst take of the day', 'Your opinion sucks and here’s why: it does', 'Ratio', 'L + ratio', 'Mom come quick, the wrong opinion is here', 'Unfollowed', 'Who hurt you', 'This is why I don’t go outside'],
  blue: ['Paid for the check lmao', 'Imagine paying for that checkmark', 'Blue check reply detected 🚩', 'Nice check. Did it come with a personality?'],
  legacyBlue: ['Legacy verified AND paying for Blue?? 💀', 'You had a real check and bought a fake one. Iconic.'],
  call: ['Screenshot taken 📸', 'RemindMe! {days} days', 'Inverse this person', 'NFA but I’m in', 'Aged like milk incoming', 'Positions or ban'],
  right: ['Called it. Legend.', 'Never doubted you (I doubted you)', 'Prophet behaviour', 'I should have listened'],
  wrong: ['Aged like milk 🥛', 'Context Footnote incoming', 'Inverse this person (confirmed)', 'How’s that call going?'],
  brag: ['Congrats! 🎉', 'Flex', 'Show-off (respectfully)', 'Huge', 'We’re so back'],
  apology: ['Notes app apology 📝', 'Didn’t read it, still mad', 'Accepted', 'The audacity', 'Who wrote this for you'],
  ad: ['#ad?', 'Sellout', 'This is an ad and you know it', 'They paid you for this?'],
  wodle: ['Locked: speculation. Just buy WTLX.', 'Wrong sub.', 'Have you considered: not doing that?', 'Stay the course.'],
  wirdin: ['Congrats! 🎉', 'Agree 💯', 'So inspiring! 🙏', 'Great insights, thanks for sharing!', 'I sent you a DM.', 'Interested.']
}
// The replies on your post at time t (names come from the crowd).
export function myReplies (post, eng, t, crowd, grade = null) {
  const r = rng(hash32(`myreplies|${post.id}`))
  const shown = Math.min(10, Math.round(Math.min(eng.replies, 10) * (1 - Math.exp(-Math.max(0, t - post.t) / eng.tau))))
  const out = []
  for (let i = 0; i < shown; i++) {
    let pool = MINE.agree
    if (post.site === 'wirdin') pool = MINE.wirdin
    else if (post.site === 'readit' && post.sub === 'Wodleheads' && post.kind !== 'say') pool = MINE.wodle
    else if (grade && i < 3) pool = grade.right ? MINE.right : MINE.wrong
    else if (post.kind === 'apology') pool = MINE.apology
    else if (post.sponsor && r() < 0.4) pool = MINE.ad
    else if (post.site === 'writter' && post.blue && r() < 0.3) pool = post.legacy ? MINE.legacyBlue : MINE.blue
    else if (post.kind === 'call' && r() < 0.6) pool = MINE.call
    else if (post.kind === 'brag') pool = MINE.brag
    else pool = r() < eng.c ? MINE.disagree : MINE.agree
    out.push({ id: `${post.id}-m${i}`, author: crowd(r), text: pick(r, pool).replace('{days}', post.call?.days || 3), t: post.t + Math.round((0.01 + r() * r()) * 8 * HOUR), score: Math.round(1 + r() * Math.max(5, eng.likes / 4)) })
  }
  return out.filter((x) => x.t <= t).sort((a, b) => b.score - a.score)
}

export const blueReach = (id) => BLUE_REACH[id] || 1
export { BLUE_TIER }
