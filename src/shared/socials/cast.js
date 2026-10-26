// Who's online: the regulars (a cast with voices, running jokes and big
// followings) and an endless crowd of throwaway accounts, every one of them
// named after words. Throwaway names are built from the word list itself
// (passed in as pools), so they're the same on every computer.

// check: 'blue' (bought), 'legacy' (earned, old money), 'grey' (official),
// 'gold' (a brand), null.
// sites: where they post. subs: their readit haunts. voice: which lines they get.
const R = (handle, name, o) => ({ handle, name, ...o })
export const REGULARS = [
  // The owner.
  R('grandiloquent', 'Grandiloquent', { check: 'grey', followers: 214e6, sites: ['writter'], voice: 'owner', color: '#1a1a1a', bio: 'Chief W (formerly Chief Writter). Free speech absolutist (terms apply). Bought this place for 44B glyphs, no regrets (some regrets).' }),
  // Money.
  R('bignounenergy', 'Big Noun Energy', { check: 'blue', followers: 312e3, sites: ['writter', 'readit'], subs: ['WirdStreetBets', 'PennyWords'], voice: 'degen', color: '#e8503a', bio: 'Not financial advice. Barely advice. 🚀' }),
  R('diamondhyphens', 'Diamond Hyphens', { check: 'blue', followers: 88e3, sites: ['writter', 'readit'], subs: ['WirdStreetBets'], voice: 'holder', color: '#3a8ae8', bio: '💎🙌 never selling a single word. not one.' }),
  R('lugubrious', 'Lugubrious', { check: null, followers: 141e3, sites: ['writter', 'readit'], subs: ['WirdStreetBets', 'LateStageLexicon', 'Wodleheads'], voice: 'doomer', color: '#4a4a5a', bio: 'It’s all going to zero. Called the Great Adverb Crash of ’26.' }),
  R('prudenceledger', 'Prudence Ledger', { check: null, followers: 52e3, sites: ['readit', 'writter'], subs: ['Wodleheads', 'LexiconFIRE'], voice: 'boggle', color: '#3a7a5a', bio: 'WTLX and chill. Stay the course.' }),
  R('stalwart', 'Stalwart', { check: null, followers: 9e3, sites: ['readit'], subs: ['Wodleheads'], voice: 'boggle', color: '#5a6a4a', bio: 'Dollar-cost averaging into nouns since 1985.' }),
  R('feeratio', 'Fee Ratio', { check: null, followers: 4e3, sites: ['readit'], subs: ['Wodleheads', 'LexiconFIRE'], voice: 'boggle', color: '#2a5a3a', bio: '0.03% is theft.' }),
  // Prediction markets.
  R('soothsayer', 'Soothsayer Markets', { check: 'gold', followers: 2.4e6, sites: ['writter'], voice: 'markets', color: '#2a6ae8', bio: 'Live odds on the Wird leagues, elections and everything else. Prices, not promises.' }),
  R('clairvoyant', 'Clairvoyant', { check: 'blue', followers: 96e3, sites: ['writter'], voice: 'pmwhale', color: '#8a3ae8', bio: 'Bought YES at 3¢ once. Haven’t shut up about it since.' }),
  R('pollster', 'The Pollster', { check: null, followers: 210e3, sites: ['writter'], voice: 'pundit', color: '#6a6a6a', bio: 'Thirty years of polling. A market is a poll with a spread and an attitude.' }),
  R('hindsightprophet', 'Hindsight Prophet', { check: 'blue', followers: 61e3, sites: ['writter'], voice: 'prophet', color: '#c8962a', bio: 'Called every crash. After it happened.' }),
  R('lexicoinwhale', 'Lexicoin Whale 🐳', { check: 'blue', followers: 1.2e6, sites: ['writter'], voice: 'scam', color: '#2ab0c8', bio: 'DM for 100× on adjectives. Not a scam. 🐳' }),
  R('foliomagnate', 'Folio Magnate', { check: 'blue', followers: 470e3, sites: ['writter', 'wirdin'], voice: 'tycoon', color: '#8a5a2a', bio: 'Founder. Investor. Published 41 dictionaries. Ask me how.' }),
  // Words.
  R('ackshually', 'Ackshually', { check: 'blue', followers: 23e3, sites: ['writter', 'readit'], subs: ['Wirds', 'ThePurists', 'NoStupidSynonyms'], voice: 'pedant', color: '#6a6aa8', bio: 'Well, technically.' }),
  R('etymon', 'Etymon', { check: 'legacy', followers: 390e3, sites: ['writter', 'readit'], subs: ['TodayILexed', 'Wirds'], voice: 'etym', color: '#a86a3a', bio: 'Every word has a story. Most of them are about Latin.' }),
  R('prescriptiva', 'Prescriptiva', { check: 'grey', followers: 205e3, sites: ['writter', 'readit'], subs: ['ThePurists'], voice: 'purist', color: '#2f7fd0', bio: 'Official voice of The Purists. That is not a word.' }),
  R('petrichor', 'Petrichor', { check: 'legacy', followers: 1.8e6, sites: ['writter', 'readit'], subs: ['BeautifulWords', 'AwwWords'], voice: 'wholesome', color: '#5aa88a', bio: 'Collecting lovely words. Be kind 🌧️' }),
  R('silentktruther', 'Silent K Truther', { check: null, followers: 77e3, sites: ['writter', 'readit'], subs: ['WirdConspiracy'], voice: 'conspiracy', color: '#6a8a2a', bio: 'The K in knife is WATCHING. Do your own research.' }),
  R('moistavenger', 'Moist Avenger', { check: null, followers: 33e3, sites: ['writter', 'readit'], subs: ['Wirds', 'UnpopularWirdions'], voice: 'moist', color: '#c84a8a', bio: 'Moist is a 5.0 and I will die on this hill.' }),
  R('oxfordcommando', 'Oxford Commando', { check: null, followers: 19e3, sites: ['writter'], voice: 'comma', color: '#3a3a8a', bio: 'Red, white, and blue. The comma stays.' }),
  R('irregardless', 'Irregardless', { check: null, followers: 12e3, sites: ['writter', 'readit'], subs: ['BoneAppleTea'], voice: 'troll', color: '#a83a3a', bio: 'It’s in the dictionary. Cope.' }),
  // Games.
  R('cluecumber', 'Cluecumber', { check: null, followers: 41e3, sites: ['writter', 'readit'], subs: ['Cluedle'], voice: 'clues', color: '#5aa83a', bio: 'Daily Clues streak: 412. Never asked for a clue. Never will.' }),
  R('roguelexeme', 'Rogue Lexeme', { check: 'blue', followers: 128e3, sites: ['writter', 'readit'], subs: ['Wirdlike'], voice: 'speedrun', color: '#8a4ad8', bio: 'Wirdlike WR holder (any%). Autocorrect is fair actually.' }),
  R('neologizer', 'Neologizer', { check: null, followers: 26e3, sites: ['readit', 'writter'], subs: ['CatchwordGame'], voice: 'catchword', color: '#ff5a3c', bio: 'Got “clasmite” into every dictionary on Earth. Ask me anything.' }),
  R('turnipruminate', 'Turnip Ruminate', { check: null, followers: 58e3, sites: ['writter', 'readit'], subs: ['WirdValley'], voice: 'farmer', color: '#7aa83a', bio: 'Turnip szn is every szn 🌱' }),
  R('lexitrainer', 'Lexi Trainer', { check: null, followers: 37e3, sites: ['readit', 'writter'], subs: ['Leximon'], voice: 'leximon', color: '#e8b83a', bio: 'Rate my team. Actually don’t.' }),
  R('onemorecrate', 'One More Crate', { check: null, followers: 6e3, sites: ['readit', 'writter'], subs: ['OneMoreCrate', 'WirdCasino'], voice: 'gacha', color: '#d0508a', bio: 'Day 214 of not opening crates. (Opened 3 today.)' }),
  R('semicolonultra', 'Semicolon Ultra', { check: null, followers: 22e3, sites: ['writter', 'readit'], subs: ['Semicolons'], voice: 'sports', color: '#127a86', bio: 'SEMICOLONS TIL I DIE ;;;' }),
  // Culture.
  R('onomatopoeia', 'Onomatopoeia', { check: 'gold', followers: 48e6, sites: ['writter'], voice: 'popstar', color: '#ff3a8a', bio: 'BOOM. New album “Kerplunk” out now.' }),
  R('breakinggnus', 'Breaking Gnus', { check: 'grey', followers: 9.4e6, sites: ['writter', 'readit'], subs: ['NewsWirds'], voice: 'news', color: '#c83a3a', bio: 'News that’s fit to define. 🦬' }),
  R('wordexchange', 'The Word Exchange', { check: 'grey', followers: 3.1e6, sites: ['writter'], voice: 'exchange', color: '#2a6ad8', bio: 'Official account of The Word Exchange. Prices are the same for everyone.' }),
  R('dailyclues', 'Daily Clues', { check: 'grey', followers: 2.2e6, sites: ['writter'], voice: 'cluesofficial', color: '#3a2a8a', bio: 'One word. Everyone. Every day. No spoilers in the replies (please).' }),
  R('wirdvalleyseed', 'Wird Valley Seed Co.', { check: 'gold', followers: 640e3, sites: ['writter', 'wirdin'], voice: 'brand', color: '#5a8a2a', bio: 'Seeds for every season. 🌾' }),
  R('wirdhouseholdings', 'Wirdhouse Holdings', { check: 'gold', followers: 1.1e6, sites: ['writter', 'wirdin'], voice: 'brand', color: '#c8962a', bio: 'Building the future of passive income. One coin a second.' }),
  // WirdIn.
  R('synergy', 'Synergy Strategist', { check: null, followers: 30e3, sites: ['wirdin'], voice: 'linkedin', color: '#0a66c2', headline: 'Chief Lexicon Officer | Thought Leader | Helping words reach their full potential', bio: '' }),
  R('thoughtleader', 'Thought Leadership', { check: null, followers: 112e3, sites: ['wirdin'], voice: 'linkedin', color: '#2a7ab8', headline: 'Top Voice in Vocabulary | Keynote Speaker | Ex-Wirdhouse', bio: '' }),
  R('hustleculture', 'Hustle Culture', { check: null, followers: 64e3, sites: ['wirdin', 'writter'], voice: 'grind', color: '#e8782a', headline: 'Up at 4am rating words | Founder @ 3 startups (2 defunct)', bio: 'Sleep is a synonym for weakness.' }),
  R('recruiterrecruits', 'Recruiter Recruits', { check: null, followers: 18e3, sites: ['wirdin'], voice: 'recruiter', color: '#5a5ab8', headline: 'Talent Acquisition Wizard 🧙 | We’re hiring (always)', bio: '' }),
  R('humblebrag', 'Humblebrag', { check: null, followers: 27e3, sites: ['wirdin'], voice: 'linkedin', color: '#3a8a8a', headline: 'Humbled. Honored. Here. | MBA, PMP, LOL', bio: '' })
]
export const REGULAR = Object.fromEntries(REGULARS.map((r) => [r.handle, r]))

// --- throwaways ------------------------------------------------------------------------------
// pools: { adj: [...], noun: [...], any: [...] }, words from the shared list.
// r(): a deterministic random number. Every account a seed can make.
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1)
const COLORS = ['#e8503a', '#3a8ae8', '#5aa83a', '#c8962a', '#8a4ad8', '#d0508a', '#2ab0c8', '#e8782a', '#6a6aa8', '#3a7a5a', '#a83a3a', '#127a86']
const EMOJI = ['🦅', '🌱', '💎', '🚀', '🐸', '☕', '🌙', '🔥', '🦊', '📚', '✨', '🍜', '🐢', '🎧']
const DOMAINS = ['', '', '', '', ' | he/they', ' | views my own', ' | 🇺🇸', ' | eggcorn enjoyer', ' | DMs open']

export function throwaway (site, pools, r) {
  const a = pools.adj[Math.floor(r() * pools.adj.length)] || 'quiet'
  const n = pools.noun[Math.floor(r() * pools.noun.length)] || 'kettle'
  const w = pools.any[Math.floor(r() * pools.any.length)] || 'lantern'
  const num = (d) => String(Math.floor(r() * 10 ** d)).padStart(d, '0')
  const color = COLORS[Math.floor(r() * COLORS.length)]
  if (site === 'readit') {
    // readit's own auto-generated names: Adjective-Noun-1234, and the usual suspects.
    const styles = [
      () => `${cap(a)}-${cap(n)}-${num(4)}`, () => `${cap(a)}-${cap(n)}-${num(4)}`, () => `${cap(a)}_${cap(n)}_${num(4)}`,
      () => `throwaway_${w}_${num(4)}`, () => `${w}_enjoyer`, () => `${n}${num(2)}`, () => `Ok_${cap(n)}_${num(3)}`, () => `${a}${n}`,
      () => `Not_A_${cap(n)}`, () => `${cap(w)}Whisperer`, () => `u_${w}${w.length}`, () => `${cap(a)}${cap(n)}${num(2)}`, () => `PM_ME_YOUR_${n.toUpperCase()}S`,
      () => `${n}_${pools.noun[Math.floor(r() * pools.noun.length)] || 'kettle'}`, () => `Mr${cap(n)}`, () => `The${cap(a)}${cap(n)}`, () => `${w}_throwaway${num(4)}`, () => `${cap(w)}Truther`, () => `Sir_${cap(n)}_The_${cap(a)}`
    ]
    const handle = styles[Math.floor(r() * styles.length)]()
    return { handle, name: handle, check: null, color, throwaway: true, karma: Math.floor(10 ** (1 + r() * 4.5)) }
  }
  if (site === 'wirdin') {
    const first = cap(w)
    const last = cap(n)
    const creds = ['', ', MBA', ', PMP', ', CSM', ' 🌱', ', MBA, PMP', ' (Open to Work)', ', CPA']
    const role = ['Synonym Strategist', 'Adjective Evangelist', 'Head of Nouns', 'VP of Vowels', 'Lexical Growth Hacker', 'Chief Vibes Officer', 'Senior Rating Analyst', 'Word Ninja', 'Punctuation Consultant', 'Thesaurus Ops Lead', 'Founder (stealth)', 'Aspiring Wordsmith']
    const at = ['Wirdhouse', 'The Word Exchange', 'Wird Valley Seed Co.', 'a Fortune 500 Dictionary', 'stealth startup', 'Self-employed', 'Lexicon & Co.', 'The Purists']
    return { handle: `${w}-${n}-${num(3)}`, name: `${first} ${last}${creds[Math.floor(r() * creds.length)]}`, check: null, color, throwaway: true, headline: `${role[Math.floor(r() * role.length)]} at ${at[Math.floor(r() * at.length)]}`, connections: Math.floor(40 + r() * 2000) }
  }
  // Writter: default handles with digits, stan accounts, ironic accounts, bots.
  const styles = [
    () => [`${w}${num(8)}`, cap(w)], () => [`${w}${num(8)}`, `${cap(w)} ${EMOJI[Math.floor(r() * EMOJI.length)]}`],
    () => [`${a}_${n}`, `${cap(a)} ${cap(n)}`], () => [`${n}stan`, `${n} stan account`], () => [`not_a_${n}`, `definitely not a ${n}`],
    () => [`${w}enjoyer`, `${w} enjoyer`], () => [`the_real_${n}`, `The Real ${cap(n)}`], () => [`lil${n}`, `lil ${n}`], () => [`big${n}energy`, `Big ${cap(n)} Energy`],
    () => [`xX_${w}_Xx`, `xX ${w} Xx`], () => [`${a}${n}${num(2)}`, `${cap(a)} ${cap(n)}`], () => [`${n}dad${num(2)}`, `${cap(n)} Dad`], () => [`${w}_tm`, `${cap(w)}™`],
    () => [`${n}_${num(4)}`, `${cap(n)} | Lexicoin 🚀`], () => [`${a}takes`, `${cap(a)} Takes`],
    () => [`${n}_irl`, `${n} irl`], () => [`real${n}hours`, `real ${n} hours`], () => [`${n}posting`, `${n} posting`], () => [`${w}_szn`, `${w} szn 🔥`], () => [`daily_${n}`, `Daily ${cap(n)} 📅`],
    () => [`${n}_facts`, `${cap(n)} Facts`], () => [`${w}.eth`, `${w}.eth 🦍`], () => [`${a}_${n}_${1980 + Math.floor(r() * 30)}`, `${cap(a)} ${cap(n)}`], () => [`${n}fan${num(2)}`, `${n} fan`],
    () => [`${w}bot`, `${cap(w)} Bot 🤖 (automated)`], () => [`not${n}`, `not ${n}`], () => [`${a}${w}`, `${cap(a)} ${cap(w)} (parody)`], () => [`ex${n}`, `ex-${n}, now ${w}`], () => [`${n}mom${num(2)}`, `${cap(n)} Mom ✨`]
  ]
  const [handle, name] = styles[Math.floor(r() * styles.length)]()
  const check = r() < 0.12 ? 'blue' : null
  return { handle, name: name + (r() < 0.15 ? DOMAINS[Math.floor(r() * DOMAINS.length)] : ''), check, color, throwaway: true, followers: Math.floor(10 ** (0.5 + r() * 3.6)) }
}

// Your handle is a word: one you've rated.
export const validHandle = (h) => /^[a-z][a-z0-9_]{2,19}$/.test(String(h || ''))
