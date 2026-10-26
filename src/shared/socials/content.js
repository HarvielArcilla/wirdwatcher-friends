// Socials' places, trends, tiers and price lists.

export const SITES = {
  writter: { name: 'Writter', blurb: 'What’s happening, wordwise.' },
  readit: { name: 'readit', blurb: 'The front page of the dictionary.' },
  wirdin: { name: 'WirdIn', blurb: 'Your professional word network.' }
}

// readit's subs. kind: what does well there (calls, takes, brags, chill).
const S = (id, blurb, o = {}) => ({ id, blurb, members: 0, ...o })
export const SUBS = [
  // Money.
  S('WirdStreetBets', 'Like 4chan found a Bloomberg terminal, but for words. Loss posts welcome.', { group: 'Money', members: 14.2e6, likes: ['call', 'brag', 'loss'], hates: ['wodle'], flair: ['YOLO', 'DD', 'Gain', 'Loss', 'Meme', 'Discussion'] }),
  S('Wodleheads', 'Buy the whole dictionary. Stay the course. Your question has been asked before.', { group: 'Money', members: 610e3, likes: ['wodle'], hates: ['call', 'brag', 'loss'], flair: ['Investing - Help Request', 'Personal Finance', 'Stay The Course'] }),
  S('PennyWords', 'Obscure words under 5 glyphs a share. One is going to 100×. Probably.', { group: 'Money', members: 220e3, likes: ['call'], flair: ['DD', 'Moonshot', 'Rug'] }),
  S('LexiconFIRE', 'Financial Independence, Retire Early (on synonyms).', { group: 'Money', members: 340e3, likes: ['wodle', 'brag'], flair: ['Milestone', 'Question'] }),
  S('LateStageLexicon', 'Everything is the dictionary’s fault.', { group: 'Money', members: 980e3, likes: ['take'], flair: ['Rant'] }),
  // Words.
  S('Wirds', 'Words. Ratings. Arguments about words and ratings.', { group: 'Words', members: 22.4e6, likes: ['take'], flair: ['Discussion', 'Hot take', 'Appreciation'] }),
  S('UnpopularWirdions', 'Your take on a word that everyone else is wrong about. Upvote if you DISAGREE (nobody does).', { group: 'Words', members: 3.3e6, likes: ['contrarian'], flair: ['Unpopular', 'Actually popular'] }),
  S('AmITheAsterisk', 'Am I the Asterisk? A place to find out if you were in the wrong about a word.', { group: 'Words', members: 9.8e6, likes: ['take'], flair: ['YTA', 'NTA', 'ESH', 'NAH'] }),
  S('DefineLikeImFive', 'Explain a word like I’m five. No big words. (Hard, here.)', { group: 'Words', members: 8.1e6, flair: ['Explained'] }),
  S('TodayILexed', 'You learn something new every day; what did you learn today?', { group: 'Words', members: 31e6, flair: ['TIL'] }),
  S('BoneAppleTea', 'For all intensive purposes, the best eggcorns.', { group: 'Words', members: 1.9e6, flair: ['Eggcorn'] }),
  S('BeautifulWords', 'Words that sound like they feel.', { group: 'Words', members: 4.4e6, likes: ['take'], flair: ['Lovely'] }),
  S('NoStupidSynonyms', 'Ask about any word. There are no stupid synonyms. (There are some.)', { group: 'Words', members: 2.6e6, flair: ['Question'] }),
  S('ShowerWords', 'Thoughts about words, had in the shower.', { group: 'Words', members: 27e6, flair: [] }),
  S('Punderstruck', 'Puns. We’re sorry. We’re not sorry.', { group: 'Words', members: 3.7e6, flair: ['Groan'] }),
  S('Palindromes', 'Never odd or even.', { group: 'Words', members: 410e3, flair: [] }),
  S('DataIsWirdiful', 'Charts about words. Beautiful ones. Mostly.', { group: 'Words', members: 21e6, flair: ['OC'] }),
  S('word_irl', 'word_irl', { group: 'Words', members: 7.2e6, flair: [] }),
  S('AwwWords', 'smol. bork. cozy. snoot. 🥺', { group: 'Words', members: 5.1e6, flair: [] }),
  // Drama.
  S('ThePurists', 'Official discussion of style rulings. That is not a word.', { group: 'Drama', members: 290e3, hates: ['contrarian'], flair: ['Ruling', 'Not A Word'] }),
  S('WirdConspiracy', 'Who REALLY owns the dictionary? Do your own research.', { group: 'Drama', members: 1.1e6, flair: ['Theory', 'Wake Up'] }),
  S('WordRelationships', 'Advice for relationships, mostly about how your partner rates words.', { group: 'Drama', members: 3.9e6, flair: ['Advice', 'Update'] }),
  // Games.
  S('Cluedle', 'Daily Clues discussion. Spoilers MUST be tagged. Results posts in the daily thread only.', { group: 'Games', members: 1.6e6, flair: ['Daily Thread', 'Streak', 'Rant'] }),
  S('Wirdlike', 'Wirdlike: seeds, runs, builds, and why Autocorrect is unfair.', { group: 'Games', members: 880e3, likes: ['brag'], flair: ['Run', 'Seed', 'Help', 'Meme'] }),
  S('CatchwordGame', 'Spread your word. Fear the Purists.', { group: 'Games', members: 420e3, likes: ['brag'], flair: ['Win', 'Strategy'] }),
  S('WirdTycoon', 'Dictionary publishing simulator. Post your reviews.', { group: 'Games', members: 300e3, likes: ['brag'], flair: ['Review', 'Help'] }),
  S('Leximon', 'Rate my team. Trade. Cry about duels.', { group: 'Games', members: 1.2e6, likes: ['brag'], flair: ['Team', 'Trade', 'Duel'] }),
  S('WirdValley', 'Farms, turnips, and the sweet valley life.', { group: 'Games', members: 760e3, likes: ['brag'], flair: ['My Farm', 'Turnips'] }),
  S('OneMoreCrate', 'A support group for people who are definitely going to stop opening crates.', { group: 'Games', members: 530e3, likes: ['brag', 'loss'], flair: ['Pull', 'Relapse', 'Day 1'] }),
  S('WirdCasino', 'The house always wins. Let’s talk about it.', { group: 'Games', members: 370e3, likes: ['brag', 'loss'], flair: ['Win', 'Loss'] }),
  S('PenguinCross', 'Hop. Hop. Hop. Crack.', { group: 'Games', members: 190e3, flair: ['Hop'] }),
  // Sports and news.
  S('Semicolons', 'Seattle Semicolons fans. ;;;', { group: 'Sports', members: 210e3, flair: ['Game Thread', 'Post Game'] }),
  S('WordBall', 'All the leagues. All the takes.', { group: 'Sports', members: 2.9e6, flair: ['Game Thread', 'Post Game'] }),
  S('NewsWirds', 'News, about words, and the world they live in.', { group: 'News', members: 18e6, flair: ['Breaking'] })
]
export const SUB = Object.fromEntries(SUBS.map((s) => [s.id, s]))

// Always-on hashtags (the feed adds the day's words and moves).
export const HASHTAGS = {
  culture: ['#WordOfTheDay', '#MoistAwareness', '#IrregardlessIsAWord', '#LiterallyLiterally', '#OxfordCommaWar', '#GifOrJif', '#TeamLowercase', '#NewWordDropped', '#AdjectiveAppreciationDay', '#VerbSzn', '#NounsAreBack', '#ThrowbackThesaurus', '#MondayMoodWord', '#ShowerThoughts', '#UnpopularOpinion'],
  drama: ['#Grammargeddon', '#PrescriptivistMeltdown', '#PassiveVoiceWasUsed', '#Ratio', '#TouchGrass', '#CancelTheSemicolon', '#MainCharacter'],
  games: ['#DailyClues', '#WirdlikeSpeedrun', '#CatchwordChallenge', '#PurgeThePurists', '#ProtectTheDictionary', '#RateMyLeximon', '#TurnipSzn', '#OneMoreCrate'],
  money: ['#LexiconToTheMoon', '#BagHolders', '#StayTheCourse', '#DiamondHyphens', '#WTLX']
}

// What you can say about a word (the generated replies know what each means).
export const STANCES = [
  { id: 'love', text: 'is criminally underrated', s: 1 },
  { id: 'perfect', text: 'is a perfect word. No notes.', s: 1 },
  { id: 'hate', text: 'is a crime against language', s: -1 },
  { id: 'overrated', text: 'is SO overrated', s: -1 },
  { id: 'mid', text: 'is mid. Sorry.', s: -0.4 },
  { id: 'sound', text: 'sounds exactly like what it means', s: 0.6 },
  { id: 'fake', text: 'is not a real word and you can’t make me', s: -0.8 }
]
export const STANCE = Object.fromEntries(STANCES.map((s) => [s.id, s]))

// Followers to reach each rung.
export const TIERS = [
  { id: 'lurker', name: 'Lurker', at: 0 },
  { id: 'poster', name: 'Poster', at: 25 },
  { id: 'regular', name: 'Regular', at: 250 },
  { id: 'micro', name: 'Micro-influencer', at: 1000 },
  { id: 'influencer', name: 'Influencer', at: 10000 },
  { id: 'celebrity', name: 'Celebrity', at: 100000 },
  { id: 'main', name: 'Main Character', at: 1000000 },
  { id: 'legend', name: 'Lexicon Legend', at: 10000000 }
]
export const tierFor = (f) => TIERS.reduce((t, x) => (f >= x.at ? x : t), TIERS[0])
export const LEGACY_AT = 100000

// Writter Blue. Each tier costs more and does exactly as much.
export const BLUE = [
  { id: 'blue', name: 'Writter Blue', weeks: 1, k: 1, perks: ['A checkmark that means nothing', 'Your replies float to the top', 'Half the ads', 'Edit button (coming soon)'] },
  { id: 'premium', name: 'Blue Premium', weeks: 1, k: 4, perks: ['Everything in Blue', 'A slightly bluer checkmark', 'Longer posts (nobody reads them)'] },
  { id: 'plus', name: 'Blue Premium+', weeks: 1, k: 16, perks: ['Everything in Premium', 'No ads (some ads)', 'AI replies (it’s a thesaurus)'] },
  { id: 'diamond', name: 'Diamond Check', weeks: 1, k: 64, perks: ['Everything in Premium+', 'The check sparkles', 'Grandiloquent may reply to you (he won’t)'] },
  { id: 'checkcheck', name: 'The Check With a Check On It', weeks: 1, k: 256, perks: ['A check. On your check.', 'Nothing else', 'Seriously, nothing else'] }
]
export const BLUE_TIER = Object.fromEntries(BLUE.map((b) => [b.id, b]))

// Sponsors who come knocking once you're big enough.
export const SPONSORS = [
  { id: 'seed', brand: 'Wird Valley Seed Co.', handle: 'wirdvalleyseed', ask: 'a post about turnips', word: 'turnip', at: 1000 },
  { id: 'house', brand: 'Wirdhouse Holdings', handle: 'wirdhouseholdings', ask: 'a post about passive income', word: 'income', at: 5000 },
  { id: 'crate', brand: 'CrateCo', handle: 'crateco', ask: 'a post about how fun crates are', word: 'crate', at: 20000 },
  { id: 'lexicoin', brand: 'Lexicoin', handle: 'lexicoinwhale', ask: 'a post about Lexicoin (it’s fine)', word: 'coin', at: 50000 },
  { id: 'onoma', brand: 'Onomatopoeia’s new album “Kerplunk”', handle: 'onomatopoeia', ask: 'a post saying BOOM', word: 'boom', at: 250000 }
]
