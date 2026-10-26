// The feed: W (formerly Writter), readit and WirdIn, the same on every computer.
//
// Time is cut into slots. Each slot's posts come from a hash of the slot
// number and facts that are themselves the same everywhere (Word Exchange
// prices, sports results, the Daily Clues number, the word list), so two
// friends looking at the same minute see the same posts, the same replies
// and the same like counts. Counts grow on a curve with a post's age; now
// and then one goes viral.
//
// ctx (built by src/core/socials.js) gives the world at a moment:
//   ctx.at(t) → { day, dailyNumber, movers: { up: [{ word, pct }], down }, sports: [...] }
//   ctx.word(x) → a word (x in [0, 1)); ctx.info(word) → { pos, def, syns }
//   ctx.consensus(word) → the crowd's rating, 0–5
//   ctx.pools → { adj, noun, any }: words throwaway names are built from
//
// FEED v1: changing a template changes what everyone's feed says, so do it
// on a release, and change ids/counts as little as possible.

import { hash32 } from '../market.js'
import { REGULARS, REGULAR, throwaway } from './cast.js'
import { SUBS, SUB, HASHTAGS, STANCE } from './content.js'

export const FEED_VERSION = 1
export const SLOT_MS = 6 * 60e3
const HOUR = 3600e3
const DAY = 24 * HOUR
const PER_SLOT = { writter: 3, readit: 2, wirdin: 1 }

export function rng (seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = (r, a) => a[Math.floor(r() * a.length)]
const cap = (w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)
const fill = (s, f) => s.replace(/\{(\w+)\}/g, (_, k) => (f[k] !== undefined ? f[k] : `{${k}}`))
// Heavy tail: most posts do nothing, a few blow up.
const tail = (r) => { const u = r(); return u < 0.012 ? 30 + r() * 120 : u < 0.06 ? 6 + r() * 20 : 0.25 + r() * 2.2 }

export const slotOf = (t) => Math.floor(t / SLOT_MS)

// --- the weekly Writter poll ------------------------------------------------------------------
// The site is W now (formerly Writter). Every Monday at 17:00 UTC Grandiloquent
// asks whether to change it back. When the answer is yes (about one week in
// three), Wednesday is Writter day, and Thursday it's W again.
const WEEK = 7 * DAY
const MONDAY = Date.UTC(2026, 0, 5, 17) // a Monday, 17:00 UTC
export const pollWeek = (t) => Math.floor((t - MONDAY) / WEEK)
export const pollYes = (w) => hash32(`w-poll|${w}`) % 3 === 0
export function isWritterDay (t) {
  const w = pollWeek(t)
  const since = t - (MONDAY + w * WEEK)
  return pollYes(w) && since >= DAY && since < 2 * DAY
}
const pollPct = (w) => (pollYes(w) ? 51 + (hash32(`w-pct|${w}`) % 19) : 30 + (hash32(`w-pct|${w}`) % 19))

// The day's main character: one unlucky throwaway everyone's dunking on.
export function mainCharacter (day, ctx) {
  return throwaway('writter', ctx.pools, rng(hash32(`main|${day}`)))
}

// --- authors ---------------------------------------------------------------------------------
function regular (voice, site, r) {
  const list = REGULARS.filter((x) => (voice ? x.voice === voice : true) && x.sites.includes(site))
  return list.length ? pick(r, list) : null
}
function author (a) {
  return { handle: a.handle, name: a.name, check: a.check || null, color: a.color, followers: a.followers || 0, karma: a.karma || Math.round((a.followers || 100) / 20), headline: a.headline || null, connections: a.connections || Math.round((a.followers || 300) / 3), regular: Boolean(REGULAR[a.handle]), bio: a.bio || null }
}

// --- what's going on --------------------------------------------------------------------------
function facts (ctx, t, r) {
  const w = ctx.at(t)
  const word = ctx.word(r())
  const word2 = ctx.word(r())
  const info = ctx.info(word) || { pos: 'word', def: 'it’s a word', syns: [] }
  const up = w.movers.up[Math.floor(r() * Math.max(1, w.movers.up.length))] || { word, pct: 12 }
  const down = w.movers.down[Math.floor(r() * Math.max(1, w.movers.down.length))] || { word: word2, pct: -9 }
  const game = w.sports.length ? pick(r, w.sports) : null
  return {
    w: word, W: cap(word), w2: word2, W2: cap(word2), pos: info.pos, def: info.def, syn: info.syns[0] || word2, Syn: cap(info.syns[0] || word2),
    up: up.word, UP: up.word.toUpperCase(), cashUp: `$${up.word.toUpperCase()}`, cashDown: `$${down.word.toUpperCase()}`, upPct: Math.abs(Math.round(up.pct)), down: down.word, DOWN: down.word.toUpperCase(), downPct: Math.abs(Math.round(down.pct)),
    num: w.dailyNumber, n: 2 + Math.floor(r() * 9), big: 10 + Math.floor(r() * 90), yr: 1985 + Math.floor(r() * 40), cr: (ctx.consensus(word)).toFixed(1),
    team: game?.winner || 'Semicolons', opp: game?.loser || 'Dashes', score: game ? `${game.ws}–${game.ls}` : '3–2', league: game?.league || 'the WBL',
    letters: word.length, first: word[0].toUpperCase(), tag: pick(r, HASHTAGS.culture), day: w.day
  }
}

// --- Writter ---------------------------------------------------------------------------------
const WRITTER_BEATS = [
  ['market', 14], ['take', 16], ['culture', 10], ['pedant', 5], ['purist', 4], ['conspiracy', 4], ['wholesome', 6], ['clues', 5], ['sports', 6],
  ['games', 10], ['owner', 3], ['popstar', 2], ['news', 5], ['scam', 3], ['ad', 3], ['shower', 6], ['main', 4], ['grind', 2], ['wodle', 3], ['etym', 4]
]
const W_LINES = {
  market: {
    degen: ['{cashUp} up {upPct}% today and I’m still in. Sir, this is a casino and I am the house now 🚀', 'Took my whole Wirdhouse income and put it into {cashUp}. Wife’s boyfriend says it’s a good idea.', '{cashDown} -{downPct}%. Averaging down. Averaging down again. Help.', 'Puts on {cashDown} printed. I’m buying a second keyboard to rate words on. #LexiconToTheMoon'],
    holder: ['{cashDown} down {downPct}%? Didn’t sell. Won’t sell. 💎🙌', 'They can’t make me sell {cashDown}. They can’t make me sell anything. #DiamondHyphens', 'Paper hands sold {cashUp} yesterday. Paper hands are crying today.'],
    doomer: ['{cashUp} up {upPct}%. Classic bull trap. It’s all going to zero.', 'Told you about {cashDown}. Nobody listens. -{downPct}% and there’s more to come. #BagHolders', 'Every word you love is a bubble. Every single one.'],
    prophet: ['Called {cashUp} at the bottom. (I didn’t post it but I called it.)', 'As I predicted, {cashDown} fell {downPct}%. I predicted it just now.'],
    exchange: ['Today’s biggest mover: {cashUp}, up {upPct}%. Biggest faller: {cashDown}, down {downPct}%. Prices are the same for everyone.', 'Reminder: what you rated a word never moves its price. Trade responsibly.'],
    crowd: ['who else bought {cashDown} at the top 💀', '{cashUp} +{upPct}% and I sold it last week. love that for me', 'just lost a month of Wirdhouse income on {cashDown} ama', 'me: I’ll just look at the Word Exchange for a minute\n*3 hours later*: {cashUp} {cashUp} {cashUp}', 'should I buy {cashUp} (asking for my bank account)']
  },
  take: ['{w} {stance}', '{W} {stance}. I said what I said.', 'Unpopular opinion: {w} {stance}', 'hot take: {w} {stance} #UnpopularOpinion', 'Nobody talks about how {w} {stance}', 'POV: you realise {w} {stance}', 'Rating {w} a {rate} and I’m not taking questions', 'If you rated {w} under a {cr} we can’t be friends', '{w} is a {cr} at best. Fight me.'],
  culture: {
    moist: ['Moist is a 5.0. It is moist. It is supposed to sound moist. #MoistAwareness', 'Saying “moist” out loud to a room every day until people get over it. Day {big}.'],
    comma: ['Red, white and blue is a crime. Red, white, and blue. #OxfordCommaWar', 'I’d like to thank my parents, God, and the Oxford comma.'],
    troll: ['Irregardless is in the dictionary. Literally. #IrregardlessIsAWord', 'Supposably I’m wrong. Irregardless, I’m right.'],
    crowd: ['It’s pronounced “jif.” No it isn’t. Yes it is. #GifOrJif', 'Literally means figuratively now and we all just let it happen #LiterallyLiterally', 'Lowercase everything. capitals are a construct. #TeamLowercase', 'new word dropped: {w}{w2}. use it in a sentence. #NewWordDropped', 'Happy #AdjectiveAppreciationDay to {w} specifically', 'nouns are SO back #NounsAreBack', 'it’s {w} szn and you’re not ready #VerbSzn']
  },
  pedant: ['Well, ackshually, {w} is a {pos}. Just so we’re clear.', 'It’s “for all intents and purposes.” Not intensive. I’ll wait.', 'Technically {w} means “{def}.” So no.', 'Correction: {syn} is not a synonym of {w}. It’s a near-synonym. Big difference.'],
  purist: ['That is not a word.', 'The Purists have reviewed “{w}{w2}” and ruled it is not a word. Thank you for your cooperation.', 'Reminder: {w} has {letters} letters, all of them in the correct order. Keep it that way. #ProtectTheDictionary', 'We are aware a word is spreading. We are drafting a style ruling. #ProtectTheDictionary'],
  conspiracy: ['Why does “{w}” have {letters} letters? Why not {n}? Who decided? Wake up.', 'The silent K in knife is not silent. It is LISTENING.', '{W} and {w2} have never been seen in the same sentence. Think about it.', 'Who REALLY sets the price of {cashUp}? Do your own research. #DoYourOwnResearch'],
  wholesome: ['Today’s lovely word: {w}. {def_}. That’s it, that’s the post 🌧️', 'Say “{w}” slowly. Feel better? Me too.', 'Reminder that {w} exists and you’re doing great 💛', 'Gentle reminder: you can rate a word a 5.0 just because it makes you happy.'],
  clues: {
    cluesofficial: ['Daily Clues #{num} is live. One word, everyone. No spoilers in the replies please. #DailyClues', 'Daily Clues #{num}: {pct}% of players needed more than {n} clues today. #DailyClues'],
    clues: ['Daily Clues #{num} on the first try. Didn’t even ask for a clue. Streak alive.', 'Daily Clues #{num} 🟨🟨🟩 I am a genius (it took me 40 minutes)'],
    crowd: ['Daily Clues #{num} 🟨🟨🟨🟨🟥🟥 I want to speak to the dictionary’s manager', 'whoever wrote today’s Daily Clues: we need to talk', 'Daily Clues #{num} 🟨🟩 don’t look at me', 'Do NOT spoil Daily Clues #{num} in the replies. (It’s a {pos}.) (SORRY)']
  },
  sports: ['{TEAM} WIN {score}!!! {team_} til I die', 'Can’t believe the {opp} lost {score}. Actually I can. I’ve watched them all season.', 'Refs handed the {team} that one {score}. Rigged league.', 'FINAL: {team} {score} {opp}. Your bets are worthless now. Mine too.'],
  games: ['Beat Autocorrect in Wirdlike with nothing but adverbs. AMA. #WirdlikeSpeedrun', 'Wirdlike seed of the day is evil. Who put The Red Pen on floor 2', 'Got “{w}{w2}” into every dictionary on Earth in Catchword. The Purists can cope. #CatchwordChallenge', 'My Tycoon company just got a 9.8 for a cooking picture dictionary. I am a publishing god now.', 'Turnips are up in Wird Valley and I have 400 of them #TurnipSzn', 'Opened {big} crates. Got {big} duplicates. #OneMoreCrate', 'Rate my Leximon team: {W}, {W2}, and a {pos} I caught by accident #RateMyLeximon', 'Penguin Cross: hopped 9 floes, got greedy, ice cracked. Every single time.', 'put my entire life savings on red in Wird Roulette. it was black. it’s always black'],
  owner: ['Should W go back to being Writter? 🗳️', 'Free speech means you can say any word. Except that one.', '!!', 'Looking into this', '💯', 'W Blue is now 8 glyphs. Complaints can be sent to /dev/null', 'Concerning', 'The algorithm is fine. Your posts are bad.', 'Edit button coming soon™'],
  popstar: ['BOOM.', 'KERPLUNK. Out now. 💥', 'Thank you {big} million listeners!!! BOOM', 'New single “{W}” drops Friday. Bang. Crash. Wallop.'],
  news: ['BREAKING: {cashUp} surges {upPct}% on the Word Exchange.', 'BREAKING: {team} beat {opp} {score}.', 'BREAKING: The Purists say they are “monitoring” a new word.', 'BREAKING: Daily Clues #{num} reportedly “a hard one.” More soon.', 'BREAKING: Local man rates {w} a 0.0. Neighbours concerned.'],
  scam: ['🚀 Lexicoin is going 100× on adjectives. DM me now, only {n} spots left 🐳', 'I turned 50 glyphs into 50,000 with this ONE trick (DM me)', 'Hello dear, I am a Nigerian prince of nouns. Kindly send glyphs.'],
  ad: ['🌾 Turnip season is here. Grow more with Wird Valley Seed Co.', 'Earn while you sleep. Wirdhouse Holdings: one coin a second, forever.*\n*not forever', 'Kerplunk. The new album from Onomatopoeia. BOOM.'],
  shower: ['If you rate every word a 2.5 you’re technically never wrong', 'The word “dictionary” is in the dictionary. That’s like a phone book with a picture of a phone book in it.', 'Abbreviation is a really long word', 'Nobody’s ever been the first person to say “{w}” out loud. Except someone was.', 'Words are just letters that agreed to hang out'],
  main: ['@{mc} is today’s main character and honestly they earned it', 'Not @{mc} rating {w} a 0.0 in public 💀 #MainCharacter', 'The way @{mc} got ratioed by a dictionary account', 'Muting @{mc}, the word “{w}” and everyone involved'],
  grind: ['Up at 4am. Rated 300 words before breakfast. What did YOU do today?', 'Sleep is just a synonym for “not rating words.” #Grind'],
  wodle: ['Just buy WTLX and stay the course. #StayTheCourse', 'Every single word you pick is a gamble. The dictionary is not. #WTLX', 'Reminder: WTLX is 0.08% and WORD is 0.09%. Choose wisely. #StayTheCourse', 'Sold all my WORD for WTLX. Same words. Feels like a fresh start.'],
  etym: ['TIL “{w}” is a {pos} meaning “{def}.” The more you know.', 'Fun fact: {w} and {syn} mean nearly the same thing. Language is a lie.', 'Every word has a story. {W}’s is short: it means “{def}.” That’s it.']
}

function writterPost (slot, k, ctx) {
  const t0 = slot * SLOT_MS
  const r = rng(hash32(`w|${FEED_VERSION}|${slot}|${k}`))
  const t = t0 + Math.floor(r() * SLOT_MS)
  const beat = weighted(r, WRITTER_BEATS)
  const f = facts(ctx, t, r)
  let a = null
  let text = ''
  const voice = (v) => { a = regular(v, 'writter', r) }
  const crowd = () => { a = throwaway('writter', ctx.pools, r) }
  const lines = W_LINES[beat]
  let kind = beat
  let media = null
  let tags = []
  let stance = null
  switch (beat) {
    case 'market': {
      const v = pick(r, ['degen', 'degen', 'holder', 'doomer', 'prophet', 'exchange', 'crowd', 'crowd', 'crowd'])
      if (v === 'crowd') crowd(); else voice(v)
      text = pick(r, lines[v])
      media = r() < 0.5 ? (r() < 0.5 ? { type: 'ticker', word: f.up, pct: f.upPct } : { type: 'ticker', word: f.down, pct: -f.downPct }) : null
      break
    }
    case 'take': {
      if (r() < 0.25) voice(pick(r, ['moist', 'troll', 'pedant'])); else crowd()
      stance = pick(r, ['love', 'perfect', 'hate', 'overrated', 'mid', 'sound', 'fake'])
      text = fill(pick(r, lines), { ...f, stance: STANCE[stance].text, rate: (r() * 5).toFixed(1) })
      kind = 'take'
      break
    }
    case 'culture': {
      const v = pick(r, ['moist', 'comma', 'troll', 'crowd', 'crowd'])
      if (v === 'crowd') crowd(); else voice(v)
      text = pick(r, lines[v])
      break
    }
    case 'clues': {
      const v = pick(r, ['cluesofficial', 'clues', 'crowd', 'crowd'])
      if (v === 'crowd') crowd(); else voice(v)
      text = pick(r, lines[v])
      f.pct = 30 + Math.floor(r() * 50)
      break
    }
    case 'sports': if (r() < 0.4) voice('sports'); else crowd(); text = pick(r, lines); f.TEAM = f.team.toUpperCase(); f.team_ = f.team.toUpperCase(); break
    case 'games': if (r() < 0.3) voice(pick(r, ['speedrun', 'catchword', 'farmer', 'gacha', 'leximon', 'tycoon'])); else crowd(); text = pick(r, lines); break
    case 'owner': voice('owner'); text = pick(r, lines); if (text.startsWith('Should W go back')) { media = { type: 'poll', options: ['Yes', 'No'], pct: [pollPct(pollWeek(t)), 100 - pollPct(pollWeek(t))] } } break
    case 'popstar': voice('popstar'); text = pick(r, lines); break
    case 'news': voice('news'); text = pick(r, lines); break
    case 'scam': if (r() < 0.4) voice('scam'); else { crowd(); a.name = `${a.name} | Lexicoin 🚀`; a.check = 'blue' } text = pick(r, lines); break
    case 'ad': { const brand = pick(r, ['wirdvalleyseed', 'wirdhouseholdings', 'onomatopoeia']); a = REGULAR[brand]; text = lines[['wirdvalleyseed', 'wirdhouseholdings', 'onomatopoeia'].indexOf(brand)]; kind = 'ad'; break }
    case 'main': { crowd(); const mc = mainCharacter(Math.floor(t / DAY), ctx); f.mc = mc.handle; text = pick(r, lines); tags = ['#MainCharacter']; break }
    case 'pedant': voice('pedant'); text = pick(r, lines); break
    case 'purist': voice('purist'); text = pick(r, lines); break
    case 'conspiracy': if (r() < 0.6) voice('conspiracy'); else crowd(); text = pick(r, lines); break
    case 'wholesome': if (r() < 0.6) voice('wholesome'); else crowd(); text = pick(r, lines); f.def_ = cap(f.def); break
    case 'grind': voice('grind'); text = pick(r, lines); break
    case 'wodle': voice('boggle'); if (!a) a = REGULAR.prudenceledger; text = pick(r, lines); break
    case 'etym': if (r() < 0.6) voice('etym'); else crowd(); text = pick(r, lines); break
    default: crowd(); text = pick(r, W_LINES.shower)
  }
  if (!a) crowd()
  text = fill(text, f)
  tags = [...new Set([...tags, ...(text.match(/#\w+/g) || [])])]
  const au = author(a)
  const reach = Math.max(20, au.followers) * 0.004 * tail(r) * (au.check === 'blue' ? 1.15 : 1)
  return {
    id: `w-${slot}-${k}`, site: 'writter', t, kind, text, tags, media, author: au, stance, word: f.w,
    footnote: kind === 'market' && /called|predicted/i.test(text) && r() < 0.5 ? `Readers added context: ${f.UP} rose ${f.upPct}% before this was posted. Nobody “called” it.` : kind === 'scam' ? 'Readers added context: Lexicoin is not real. Neither are the 100×.' : null,
    eng: { likes: Math.round(reach), reposts: Math.round(reach * (0.08 + r() * 0.15)), replies: Math.round(reach * (0.04 + r() * 0.1) * (kind === 'take' ? 2 : 1)), views: Math.round(reach * (25 + r() * 60)), tau: 1.6 * HOUR }
  }
}

// --- readit ----------------------------------------------------------------------------------
// Each sub has its own posts: [title, body] pairs, some with sub-specific voices.
const R_POSTS = {
  WirdStreetBets: [['{cashUp} 🚀🚀🚀 (not financial advice)', 'Literally the only advice I give is not financial advice.', 'Meme'], ['Wodleheads are fighting about 0.01% again', 'Meanwhile I lost 40% before lunch. We are not the same.', 'Meme'], ['My wife left me for a Wodlehead', 'He has a three-word portfolio. I have {big} shares of a word nobody’s heard of.', 'Loss'], ['Lost {big}% this week. AMA', 'Ask me anything except how.', 'Loss'], ['{cashUp} YOLO update: +{upPct}% 🚀🚀🚀', 'Put my entire Wirdhouse income into {cashUp} last week. Wife’s boyfriend said it was a bad idea. Who’s laughing now. (Him. He’s laughing.)', 'Gain'], ['{cashDown} loss post: -{downPct}%', 'Bought at the top. Sold at the bottom. Bought again at the top. I am a professional.', 'Loss'], ['DD: Why {cashUp} is going to 10×', '1. It’s a word\n2. People say it\n3. ???\n4. Profit\n\nPositions: 400 shares, 0 sense', 'DD'], ['Is it too late to get into {cashUp}?', 'Asking for me. I’m the friend.', 'Discussion'], ['Daily Discussion Thread', 'Post your positions. Post your losses. Do NOT post WTLX, the Wodleheads are two doors down.', 'Discussion'], ['GUH', '{cashDown}. That’s the post.', 'Loss']],
  Wodleheads: [['Is it ever okay to look at your portfolio?', 'Asking for the third time today.', 'Stay The Course'], ['My coworker bought {cashDown} and it fell {downPct}%', 'I said nothing. I just held my WTLX a little tighter.', 'Stay The Course'], ['Rate my portfolio: 100% WTLX', 'Be honest.\n\nEdit: you were all very supportive. Thank you. This sub is a family.', 'Personal Finance'], ['Should I buy {cashUp} after its {upPct}% run?', 'Edit: Got it. Buy WTLX. Stay the course. Sorry for asking.', 'Investing - Help Request'], ['I bought WTLX and did nothing for 30 days. AMA', 'I didn’t check the price once. (I checked it {big} times.)', 'Stay The Course'], ['Three-Word Portfolio vs. One-Word Portfolio', 'Nouns / verbs / adjectives at 60/30/10. Fight me. (Politely. This is Wodleheads.)', 'Personal Finance'], ['PSA: picking individual words is gambling', 'I’ve been dollar-cost averaging into nouns since {yr}. I have never once been excited. That’s the point.', 'Stay The Course'], ['Market down {downPct}% on {cashDown}. Don’t look at your portfolio.', 'I am looking at my portfolio.', 'Stay The Course'], ['My fee ratio is 0.03%. My brother-in-law’s is 0.04%. How do I tell him?', 'He has to know.', 'Personal Finance'], ['WORD or WTLX?', 'Same words. Same weights. WTLX is 0.01% cheaper. I have been thinking about this for three weeks.', 'Investing - Help Request'], ['Switched from WORD to WTLX', 'On my {big} glyphs that saves about one glyph a decade. I have never felt more alive.', 'Personal Finance'], ['PSA: WORD and WTLX hold the exact same words', 'Please stop asking which one is better. (It’s WTLX. By 0.01%.)', 'Stay The Course'], ['Tax-loss harvesting WORD into WTLX', 'They’re not “substantially identical.” They’re completely identical. Anyway, is this allowed?', 'Personal Finance'], ['My partner holds WORD. I hold WTLX.', 'We don’t talk about it at dinner.', 'Personal Finance'], ['Is 0.08% too high?', 'Asking for a friend who pays 0.09% and can’t sleep.', 'Investing - Help Request']],
  PennyWords: [['{cashUp} is the next 100-bagger (DD inside)', 'Nobody has heard of it. That’s the point.', 'DD'], ['Rugged by {cashDown}', 'It went down {downPct}% and the dev (the dictionary) won’t answer my DMs.', 'Rug']],
  LexiconFIRE: [['Hit my FIRE number! Retiring at {n}0 on synonyms', 'Withdrawal rate: 4% of my Wirdhouse. Planning to spend my days rating words.', 'Milestone'], ['Is a 5,000 coin a second Wirdhouse enough to retire?', 'Asking because I want to quit rating words and just… rate words.', 'Question']],
  LateStageLexicon: [['Can’t afford a single share of {cashUp} anymore', 'Back in my day a word cost 10 glyphs. Now it’s a whole Wirdhouse.', 'Rant'], ['The rent for a noun is too high', 'We should be able to say “{w}” for free.', 'Rant']],
  Wirds: [['Is {w} a {cr} or am I crazy', 'Genuinely asking. My partner says {n}.0.', 'Discussion'], ['{W} sounds like a sneeze', 'Say it out loud. You can’t unhear it.', 'Discussion'], ['Rate {w} wrong answers only', 'I’ll start: 7.4', 'Discussion'], ['Every time I hear “{w}” I think of {w2}', 'Is this normal', 'Discussion'], ['PSA: {w} is a {pos}', 'Some of you have been using it as something else. Stop.', 'Discussion'], ['Which is better: {w} or {w2}?', 'Wrong answers will be downvoted (all answers are wrong).', 'Discussion'], ['{W} is a {cr} and here’s why', 'Discuss. ({w}: {def}.)', 'Discussion'], ['What’s a word you love that everyone hates?', 'Mine is {w}. Don’t @ me.', 'Discussion'], ['{W} appreciation post', 'It means “{def}.” Perfect. No notes.', 'Appreciation'], ['Hot take: {w} is overrated', 'It’s fine. It’s a {cr}. It’s not a 5.0.', 'Hot take']],
  UnpopularWirdions: [['{W} is a perfect 5.0', 'I said what I said.', 'Unpopular'], ['Moist is a nice word', 'It’s descriptive and correct.', 'Actually popular'], ['{W} is a 0.0 and it isn’t close', 'Everyone pretends to like it.', 'Unpopular']],
  AmITheAsterisk: [['AITA for correcting my boss’s pronunciation of “{w}” in a meeting?', 'In front of the whole team. On a Friday.', 'YTA'], ['AITA for naming my cat {W}?', 'My family says it’s “not a name.” It IS a word though.', 'NTA'], ['AITA for rating “{w}” a 0.0 at my sister’s wedding?', 'She used it in her vows. I had my phone out. I was rating. I’m not proud.', 'YTA'], ['AITA for not letting my partner say “{w}” in the house?', 'They say it {n} times a day. I have asked nicely.', 'NTA'], ['WIBTA if I told my book club {w} isn’t a real word?', 'It is a real word. I just don’t like it.', 'ESH']],
  DefineLikeImFive: [['DLI5: What does “{w}” mean?', 'Top answer: it’s a {pos}. It means {def}. Like when you {w}. Now go to bed.', 'Explained'], ['DLI5: why is it “{w}” and not “{w2}”?', 'Because it is. Bedtime.', 'Explained']],
  TodayILexed: [['TIL “{w}” has {letters} letters', 'I counted. Twice.', 'TIL'], ['TIL you can use “{w}” as a {pos}', 'It means “{def}.” I’ve been doing it wrong for {n} years.', 'TIL'], ['TIL “{w}” is a {pos} that means “{def}”', 'Source: the dictionary. (I read the dictionary for fun.)', 'TIL'], ['TIL “{w}” and “{syn}” are synonyms', 'They mean nearly the same thing and nobody told me.', 'TIL']],
  BoneAppleTea: [['Found on a menu: “{w}{w2} tea”', 'For all intensive purposes, I ordered it.', 'Eggcorn'], ['My coworker says “irregardless” in every meeting', 'Supposably it’s a word.', 'Eggcorn'], ['“Damp squid”', 'It’s a damp squib. I will not be taking questions.', 'Eggcorn']],
  BeautifulWords: [['Sonder', 'The realisation that every word you pass has a story as vivid as your own.', 'Lovely'], ['{W} (say it like you mean it)', '{Def}.', 'Lovely'], ['{W}', '{Def}. Say it slowly. 🌧️', 'Lovely'], ['Petrichor', 'The smell of rain on dry ground. Obviously.', 'Lovely']],
  NoStupidSynonyms: [['Is there a word for when you forget a word?', 'Asking for a word.', 'Question'], ['Is “{syn}” a synonym for “{w}”?', 'Asking for a crossword.', 'Question'], ['What’s a fancier word for “{w}”?', 'Need it for a cover letter.', 'Question']],
  ShowerWords: [['If you say “{w}” enough times it stops being a word', 'Try it. {W}. {W}. {W}. See?', ''], ['Every word was once a new word', 'Even “{w}.” Especially “{w}.”', ''], ['“Dictionary” is in the dictionary', 'It’s like a map with itself on it.', ''], ['Somebody had to be the first person to say “{w}”', 'And nobody wrote down who.', ''], ['“Abbreviation” is a really long word', 'Someone should abbreviate it.', '']],
  Punderstruck: [['I used to be a {w}, but then I {w2}', 'I’ll see myself out.', 'Groan'], ['Why did the {w} cross the road?', 'To get to the other {w2}. (I’m sorry.)', 'Groan']],
  Palindromes: [['Never odd or even', 'Taco cat. Racecar. You know the drill.', ''], ['Was it a car or a cat I saw?', 'It was a cat. Obviously.', '']],
  DataIsWirdiful: [['[OC] How often “{w}” gets rated a 5.0, by time of day', '(chart that is mostly one bar)', 'OC'], ['[OC] Every word I’ve rated, coloured by mood', 'It’s mostly 2.5s. I’m fine.', 'OC']],
  word_irl: [['word_irl', 'me when someone says “{w}” in a meeting', '']],
  AwwWords: [['smol', 'This word is so smol 🥺', ''], ['{W} is a cozy word', 'it wears a little sweater', '']],
  ThePurists: [['Ruling: “{w}{w2}” is not a word', 'The committee has spoken. Please update your dictionaries.', 'Ruling'], ['Weekly reminder: that is not a word', 'Whatever you were about to say.', 'Not A Word']],
  WirdConspiracy: [['The silent K in “knife” is listening', 'Do your own research. Then whisper it.', 'Wake Up'], ['Who REALLY sets the price of {cashUp}?', 'It went up {upPct}% and nobody can explain it. (The Word Exchange explained it.)', 'Theory'], ['Why does “{w}” have {letters} letters?', 'Think about it.', 'Theory']],
  WordRelationships: [['My partner rates “{w}” a 5.0. Dealbreaker?', 'We’ve been together {n} years. I just found out.', 'Advice'], ['UPDATE: we talked about “{w}”', 'We’re still together. We have agreed never to say it.', 'Update']],
  Cluedle: [['Daily Clues #{num} Discussion Thread', 'Spoilers in the comments MUST be tagged. Results go here.', 'Daily Thread'], ['{n}00 day streak and I still don’t ask for clues', 'Today almost broke me though.', 'Streak'], ['Today’s Daily Clues was unfair', 'Not saying why. Spoilers. But unfair.', 'Rant']],
  Wirdlike: [['Beat Autocorrect with a cursed-word build!', 'Every item a word I can’t stand. Strongest run I’ve ever had. Thanks, hatred.', 'Run'], ['Seed {first}{big}{first}: Red Pen on floor 2', 'Good luck. You’ll need it.', 'Seed'], ['How do you beat The Homophones?', 'I keep shooting the wrong one.', 'Help'], ['Autocorrect is unfair (a thread)', 'Ducking autocorrect.', 'Meme']],
  CatchwordGame: [['Won on Brutal by never evolving the word tree', 'Low-key + translation apps. The Purists never noticed. AMA.', 'Strategy'], ['The Purists ruled my word wasn’t a word at 99% absorbed', 'I have never been so angry at a fictional committee.', 'Win']],
  WirdTycoon: [['Got a 10 for a Rhyming Dictionary on a smart speaker', '“What rhymes with orange?” Me. I rhyme with success.', 'Review'], ['Went bankrupt in 1993 because of CD-ROMs', 'I should have stayed in paperbacks.', 'Help']],
  Leximon: [['Rate my team', '{W}, {W2}, and a level 3 {pos}. Be nice.', 'Team'], ['Trading a shiny {w} for anything', 'Seriously anything.', 'Trade']],
  WirdValley: [['My farm after 30 days', 'Mostly turnips. Some regret.', 'My Farm'], ['Turnip prices are insane today', 'Selling. Buying. Selling again.', 'Turnips']],
  OneMoreCrate: [['Day 1 of not opening crates', 'Opened one. It’s fine. Day 1 again tomorrow.', 'Day 1'], ['1 in 3.9 billion. I’ll get it next one.', '{big} crates in. {big} duplicates. Next one.', 'Relapse']],
  WirdCasino: [['The house always wins', 'And yet here I am, the house’s best customer.', 'Loss'], ['Hit a 5-letter word on Wird Slots!', '×155. I am never stopping now. (Please stop me.)', 'Win']],
  PenguinCross: [['9 floes. Got greedy. Ice cracked.', 'Every. Single. Time.', 'Hop']],
  Semicolons: [['Post Game Thread: {team} {score} {opp}', ';;;;;;;;;;;;;;', 'Post Game']],
  WordBall: [['Post Game Thread: {team} beat the {opp} {score}', 'Discuss. Politely. (Lol.)', 'Post Game'], ['The refs in the {opp} game were a disgrace', 'That’s the post.', 'Game Thread']],
  NewsWirds: [['{cashUp} surges {upPct}% on the Word Exchange', 'Analysts “cannot explain it,” then explain it at length.', 'Breaking'], ['{team} beat {opp} {score}', 'In other news: the {opp}.', 'Breaking'], ['The Purists are “monitoring” a new word', 'A spokesperson said: “That is not a word.”', 'Breaking']]
}
const SUB_VOICES = { WirdStreetBets: ['degen', 'holder', 'doomer'], Wodleheads: ['boggle'], LexiconFIRE: ['boggle'], ThePurists: ['purist'], WirdConspiracy: ['conspiracy'], TodayILexed: ['etym'], Cluedle: ['clues'], Wirdlike: ['speedrun'], CatchwordGame: ['catchword'], Leximon: ['leximon'], WirdValley: ['farmer'], OneMoreCrate: ['gacha'], Semicolons: ['sports'], NewsWirds: ['news'], BeautifulWords: ['wholesome'], Wirds: ['pedant', 'moist'], UnpopularWirdions: ['moist', 'troll'] }

function readitPost (slot, k, ctx) {
  const t0 = slot * SLOT_MS
  const r = rng(hash32(`r|${FEED_VERSION}|${slot}|${k}`))
  const t = t0 + Math.floor(r() * SLOT_MS)
  const sub = weighted(r, SUBS.map((s) => [s.id, Math.sqrt(s.members)]))
  const f = facts(ctx, t, r)
  const [title, body, flair] = pick(r, R_POSTS[sub] || R_POSTS.Wirds)
  let a = null
  const voices = SUB_VOICES[sub]
  if (voices && r() < 0.35) { const v = REGULARS.filter((x) => voices.includes(x.voice) && x.sites.includes('readit')); if (v.length) a = pick(r, v) }
  if (!a) a = throwaway('readit', ctx.pools, r)
  const au = author(a)
  const s = SUB[sub]
  const reach = Math.sqrt(s.members) * 0.4 * tail(r)
  f.Def = cap(f.def)
  return {
    id: `r-${slot}-${k}`, site: 'readit', t, sub, title: fill(title, f), text: fill(body, f), flair: flair || null, author: au, word: f.w, kind: 'post',
    awards: reach > 4000 ? Math.floor(r() * 4) + 1 : 0,
    eng: { score: Math.round(reach), ratio: 0.72 + r() * 0.26, comments: Math.round(reach * (0.06 + r() * 0.2)), tau: 4 * HOUR },
    locked: sub === 'Wodleheads' && /buy \$|after its/i.test(title) && r() < 0.5
  }
}

// --- WirdIn ----------------------------------------------------------------------------------
const L_POSTS = [
  'I’m thrilled to announce that I have rated my {big}th word. 🎉\n\nIt wasn’t easy. There were days I wanted to give up. There were words I didn’t understand.\n\nBut I kept going.\n\nAnd today, I rated “{w}” a {cr}.\n\nAgree?',
  'What rating “{w}” taught me about B2B sales:\n\n1. Every word has value.\n2. Some words have less value.\n3. Synergy.\n\nAgree? 👇',
  'I asked a candidate to define “{w}.”\n\nThey couldn’t.\n\nI hired them anyway.\n\nBecause leadership isn’t about knowing words.\n\nIt’s about rating them.',
  'Humbled to share I’ve been named a Top Voice in Vocabulary. 🙏\n\nThank you to my team, my mentors, and the word “{w}.”',
  'Unpopular opinion: you don’t need a thesaurus.\n\nYou need a growth mindset.\n\n(And a thesaurus.)',
  'My 4-year-old said “{w}” today.\n\nHere’s what it taught me about leadership. 🧵',
  'Up at 4am.\nCold plunge.\nRated 300 words.\nJournaled about “{w}.”\n\nWhat’s YOUR morning routine?',
  'I failed.\n\nI shorted {cashUp} and it went up {upPct}%.\n\nBut failure is just success that hasn’t been rated yet.\n\n#Grateful #Growth',
  '🚀 We’re hiring! Looking for a Senior Word Rater with 10+ years of experience rating a word that was coined last month.',
  'Excited to start a new position as {role} at {company}! 🎉',
  'Stop saying “{w}.”\n\nStart saying “{syn}.”\n\nSmall changes. Big results.',
  'I’m #OpenToWork. Skills: rating, re-rating, and saying “{w}” with confidence.',
  'Congratulate me on {n} years at Wirdhouse! (It feels like {big}.)',
  'Today I learned the word “{w}.”\n\nTomorrow I’ll put it in a slide deck.\n\nThat’s growth.'
]
function wirdinPost (slot, k, ctx) {
  const t0 = slot * SLOT_MS
  const r = rng(hash32(`l|${FEED_VERSION}|${slot}|${k}`))
  const t = t0 + Math.floor(r() * SLOT_MS)
  const f = facts(ctx, t, r)
  f.role = pick(r, ['Chief Lexicon Officer', 'VP of Vowels', 'Head of Nouns', 'Synonym Strategist', 'Thesaurus Ops Lead'])
  f.company = pick(r, ['Wirdhouse', 'The Word Exchange', 'Wird Valley Seed Co.', 'a stealth dictionary startup', 'Lexicon & Co.'])
  const a = r() < 0.4 ? regular(pick(r, ['linkedin', 'linkedin', 'grind', 'recruiter', 'tycoon']), 'wirdin', r) || throwaway('wirdin', ctx.pools, r) : throwaway('wirdin', ctx.pools, r)
  const au = author(a)
  const reach = Math.max(30, au.connections) * 0.05 * tail(r)
  const text = fill(pick(r, L_POSTS), f)
  return { id: `l-${slot}-${k}`, site: 'wirdin', t, kind: 'post', text, author: au, word: f.w, eng: { likes: Math.round(reach), comments: Math.round(reach * (0.1 + r() * 0.2)), reposts: Math.round(reach * 0.05), tau: 6 * HOUR } }
}

function weighted (r, list) {
  const total = list.reduce((a, [, w]) => a + w, 0)
  let x = r() * total
  for (const [v, w] of list) if ((x -= w) < 0) return v
  return list[list.length - 1][0]
}

// --- the feed --------------------------------------------------------------------------------
const cache = new Map()
export function slotPosts (slot, ctx) {
  const key = slot
  let out = cache.get(key)
  if (out) return out
  out = []
  for (let k = 0; k < PER_SLOT.writter; k++) out.push(writterPost(slot, k, ctx))
  for (let k = 0; k < PER_SLOT.readit; k++) out.push(readitPost(slot, k, ctx))
  for (let k = 0; k < PER_SLOT.wirdin; k++) out.push(wirdinPost(slot, k, ctx))
  // The weekly Writter poll itself, Mondays at 17:00.
  const w = pollWeek(slot * SLOT_MS)
  const pollAt = MONDAY + w * WEEK
  if (pollAt >= slot * SLOT_MS && pollAt < (slot + 1) * SLOT_MS) {
    out.push({ id: `w-poll-${w}`, site: 'writter', t: pollAt, kind: 'owner', text: 'Should W go back to being Writter? Poll closes in 24 hours. 🗳️', tags: [], author: author(REGULAR.grandiloquent), media: { type: 'poll', options: ['Yes', 'No'], pct: [pollPct(w), 100 - pollPct(w)], closes: pollAt + DAY }, eng: { likes: 2.1e6, reposts: 300e3, replies: 410e3, views: 98e6, tau: 3 * HOUR } })
  }
  if (cache.size > 3000) cache.clear()
  cache.set(key, out)
  return out
}

// Posts on a site from `from` to `to` (newest first), up to `limit`.
export function feed (site, ctx, { to, from = to - 2 * DAY, limit = 60, sub = null } = {}) {
  const out = []
  for (let s = slotOf(to); s >= slotOf(from) && out.length < limit; s--) {
    const posts = slotPosts(s, ctx).filter((p) => p.site === site && p.t <= to && (!sub || p.sub === sub)).sort((a, b) => b.t - a.t)
    for (const p of posts) { if (out.length < limit) out.push(p) }
  }
  return out
}

export function findPost (id, ctx) {
  const m = /^[wrl]-(\d+)-\d+$/.exec(id)
  if (m) return slotPosts(Number(m[1]), ctx).find((p) => p.id === id) || null
  const pw = /^w-poll-(-?\d+)$/.exec(id)
  if (pw) { const t = MONDAY + Number(pw[1]) * WEEK; return slotPosts(slotOf(t), ctx).find((p) => p.id === id) || null }
  return null
}

// Counts at time t: they grow on a curve with age.
export function statsAt (p, t) {
  const age = Math.max(0, t - p.t)
  const k = 0.12 * (1 - Math.exp(-age / 240e3)) + 0.88 * (1 - Math.exp(-age / (p.eng.tau || HOUR)))
  const out = {}
  for (const [key, v] of Object.entries(p.eng)) if (key !== 'tau' && key !== 'ratio') out[key] = Math.round(v * k)
  if (p.eng.ratio !== undefined) out.ratio = p.eng.ratio
  return out
}

// What's trending on W around t: a few evergreen tags (they change
// every few hours), the day's movers as cashtags, and Daily Clues.
export function trends (t, ctx) {
  const h = Math.floor(t / (3 * HOUR))
  const r = rng(hash32(`trends|${h}`))
  const w = ctx.at(t)
  const all = [...HASHTAGS.culture, ...HASHTAGS.drama, ...HASHTAGS.games]
  const picks = new Set()
  while (picks.size < 4) picks.add(pick(r, all))
  const out = [...picks].map((tag) => ({ tag, cat: HASHTAGS.drama.includes(tag) ? 'Drama' : HASHTAGS.games.includes(tag) ? 'Games' : 'Words', posts: Math.round(5e3 + r() * 200e3) }))
  for (const m of [...w.movers.up.slice(0, 2), ...w.movers.down.slice(0, 1)]) out.splice(1 + Math.floor(r() * out.length), 0, { tag: `$${m.word.toUpperCase()}`, cat: `Word Exchange · ${m.pct > 0 ? '+' : ''}${Math.round(m.pct)}%`, posts: Math.round(2e3 + r() * 60e3) })
  out.splice(2, 0, { tag: `Daily Clues #${w.dailyNumber}`, cat: 'Games · Trending', posts: Math.round(40e3 + r() * 100e3) })
  out.unshift(isWritterDay(t) ? { tag: '#WritterIsBack', cat: 'Trending worldwide', posts: 1.2e6 } : { tag: '#ItsStillWritter', cat: 'Trending worldwide', posts: Math.round(80e3 + rng(hash32(`isw|${Math.floor(t / DAY)}`))() * 200e3) })
  const mc = mainCharacter(Math.floor(t / DAY), ctx)
  out.push({ tag: `@${mc.handle}`, cat: 'Main Character of the Day', posts: Math.round(8e3 + r() * 30e3) })
  return out
}

// --- replies ---------------------------------------------------------------------------------
const REPLIES = {
  writter: {
    any: ['this', 'real', 'ratio', 'L + ratio', 'who asked', 'Source?', 'Counterpoint: no', 'I’m saving this', 'Not you posting this at {hour}', 'This aged well', 'This will age badly', 'Sir this is a Wirdy’s', 'Big if true', 'Let him cook', 'Touch grass', 'You’re so right and so wrong at the same time', 'bookmarked', '💀💀💀', 'Me reading this: 🧍', 'Okay but why is this so true'],
    take: ['Delete this', 'Finally someone said it', 'Worst take I’ve seen today and I’ve been online since 6am', '{w} slander will not be tolerated', 'I rated it a {cr}. Fight me.', 'Ratio for saying this about {w}', 'Mom come quick, the wrong opinion is here'],
    market: ['Bag holder detected', 'NFA but I’m in', 'This is financial advice now', 'sold at the bottom, as is tradition', 'Wodleheads are typing…', 'Just buy WTLX', 'Screenshot this', 'Puts', 'Calls'],
    owner: ['!!', 'Concerning', 'Interesting', 'Yes', 'No', 'Please stop renaming things', 'It’s still Writter to me', 'What does W even stand for', 'Edit button when'],
    blue: ['Paid for the check lmao', 'Imagine paying 8 glyphs to be annoying', 'Blue check reply detected, scrolling past', 'Nice check. Did it come with a personality?'],
    pedant: ['Well, ackshually,', 'Technically it’s a {pos}', 'You mean “{syn}”'],
    scam: ['🚀 DM me for 100× on {w}', 'I made 40,000 glyphs this week with Lexicoin, DM me 🐳', 'Hello dear, kindly check your DMs']
  },
  readit: {
    any: ['This is the way.', 'Underrated comment.', 'Username checks out.', 'Came here to say this.', 'Take my upvote and get out.', 'Edit: thanks for the gold, kind stranger!', 'Edit: RIP my inbox', 'Found the {w} enjoyer.', 'Instructions unclear, rated my own hand.', 'This comment made me snort {w} out of my nose', '[deleted]', '[removed]', 'Reported for being correct.', 'OP is a bot.', 'OP delivered.', 'Mods are asleep. Post {w}s.'],
    WirdStreetBets: ['Sir, this is a Wirdy’s.', 'Positions or ban.', 'Loss posts is the only true art.', 'Wife’s boyfriend approves.', 'GUH', 'Apes together strong.', 'I like the word.'],
    Wodleheads: ['Just buy WTLX.', 'Stay the course.', 'Locked: this is speculation.', 'Wrong sub. r/WirdStreetBets is that way.', 'Have you considered: not doing that?', 'Fee ratio?', 'This has been asked before. Use the search.', 'Total lexicon fund and chill.', 'WTLX is 0.01% cheaper. Just saying.', 'WORD, WTLX, same thing. Please stop.', 'Have you considered WTLX? It’s like WORD but better (by 0.01%).'],
    AmITheAsterisk: ['YTA', 'NTA', 'ESH', 'YTA and you know it.', 'NTA but your sister is.', 'INFO: what did you rate it?'],
    ThePurists: ['That is not a word.', 'Ruling upheld.', 'Correct.'],
    Cluedle: ['>!spoiler!<', 'Do NOT spoil it.', 'Took me {n} clues and a nap.']
  },
  wirdin: {
    any: ['Congrats! 🎉', 'Agree 💯', 'Great insights, thanks for sharing!', 'This.', 'Interested.', 'So inspiring! 🙏', 'Couldn’t agree more.', 'Love this mindset!', 'I sent you a DM.', 'Thanks for sharing, {name}!', 'Following for more.', 'Saving this for my team.', 'Congratulations on the new role! (I didn’t read the post)']
  }
}

// The replies under a post, the same for everyone.
export function repliesFor (p, ctx, n = 8) {
  const r = rng(hash32(`replies|${p.id}`))
  const f = facts(ctx, p.t, r)
  f.hour = `${Math.floor(r() * 4) + 1}am`
  f.name = (p.author?.name || '').split(' ')[0]
  const site = p.site
  const pools = REPLIES[site]
  const out = []
  const count = Math.max(3, Math.min(n, Math.round(3 + r() * 6)))
  for (let i = 0; i < count; i++) {
    let line
    let a
    if (site === 'writter') {
      const voice = r()
      if (p.kind === 'owner' && voice < 0.5) line = pick(r, pools.owner)
      else if ((p.kind === 'market') && voice < 0.4) line = pick(r, pools.market)
      else if (p.kind === 'take' && voice < 0.45) line = pick(r, pools.take)
      else if (voice < 0.55 && voice > 0.5) { a = REGULAR.ackshually; line = pick(r, pools.pedant) } else if (voice > 0.93) { a = r() < 0.5 ? REGULAR.lexicoinwhale : null; line = pick(r, pools.scam) } else line = pick(r, pools.any)
      if (!a) a = throwaway('writter', ctx.pools, r)
      if (a.check === 'blue' && r() < 0.5 && !a.regular) line = pick(r, pools.any)
    } else if (site === 'readit') {
      const local = pools[p.sub]
      line = local && r() < 0.55 ? pick(r, local) : pick(r, pools.any)
      a = throwaway('readit', ctx.pools, r)
      if (p.sub === 'Wodleheads' && r() < 0.3) a = REGULAR[pick(r, ['prudenceledger', 'stalwart', 'feeratio'])]
    } else {
      line = pick(r, pools.any)
      a = r() < 0.15 ? REGULAR.recruiterrecruits : throwaway('wirdin', ctx.pools, r)
    }
    const replies = site === 'readit' && r() < 0.35 ? [{ id: `${p.id}-c${i}-1`, author: author(throwaway('readit', ctx.pools, r)), text: fill(pick(r, pools.any), f), score: Math.round(1 + r() * 400) }] : []
    out.push({ id: `${p.id}-c${i}`, author: author(a), text: fill(line, f), t: p.t + Math.round((0.02 + r() * r()) * 6 * HOUR), score: Math.round(1 + r() * (site === 'readit' ? 3000 : 900) * (i === 0 ? 3 : 1)), replies })
  }
  if (site === 'readit' && ['Wodleheads', 'WirdStreetBets', 'Cluedle', 'ThePurists', 'AmITheAsterisk'].includes(p.sub)) {
    out.unshift({ id: `${p.id}-auto`, author: { handle: 'AutoLexerator', name: 'AutoLexerator', check: null, color: '#5a5a62', mod: true }, text: p.sub === 'Wodleheads' ? 'Your post has been received. Have you considered buying the total lexicon fund? This action was performed automatically.' : p.sub === 'Cluedle' ? 'Reminder: spoilers must be tagged >!like this!<. This action was performed automatically.' : 'Reminder: be civil. Rule 4: no low-effort words. This action was performed automatically.', t: p.t + 1000, score: 1, sticky: true, replies: [] })
  }
  return out.sort((a, b) => (b.sticky ? 1 : 0) - (a.sticky ? 1 : 0) || b.score - a.score)
}
