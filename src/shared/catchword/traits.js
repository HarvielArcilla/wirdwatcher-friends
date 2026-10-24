// What you can evolve your word with, in three trees (like a disease's
// transmissions, symptoms and abilities):
//
//   Spread       how it gets around: schoolyards, group chats, flights, ships
//   The word     what it's like: catchier, louder, and more ordinary (which
//                is how people end up absorbing it for good)
//   Staying power  surviving formal places, other languages and the Purists
//
// Effects add up across everything you've evolved:
//   catch    how readily one speaker passes it on
//   net      bonus where people are online       young   bonus where they're young
//   offline  bonus where they aren't online      old     bonus where they're older
//   formal   resistance to formal speech (0–1)   lang    crossing language families (0–1)
//   land / air / sea   travel by road, flight and ship
//   noto     notoriety: more buzz, and the Purists notice and work faster
//   absorb   how fast speakers stop noticing it's new (absorbed for good)
//   purist   slows the Purists' research (0–1)   resist  softens their ruling (0–1)
//
// col/row place each trait in its tree's grid; req: any one of these first.

export const TREES = [
  { id: 'spread', name: 'Spread', blurb: 'How it gets from mouth to mouth, and country to country.' },
  { id: 'word', name: 'The word', blurb: 'What it’s like. Catchier and louder spreads it; more ordinary gets it absorbed for good.' },
  { id: 'stay', name: 'Staying power', blurb: 'Getting into formal places, other languages, and past the Purists.' }
]

const t = (tree, id, name, cost, col, row, req, fx, blurb) => ({ tree, id, name, cost, col, row, req, fx, blurb })

export const TRAITS = [
  // Spread.
  t('spread', 'mouth', 'Word of mouth', 3, 2, 0, [], { catch: 0.04, land: 0.3 }, 'Friends tell friends. Spreads a little better everywhere, and across borders.'),
  t('spread', 'school', 'Schoolyards', 6, 0, 1, ['mouth'], { young: 0.5 }, 'Kids pick it up first. Much better where people are young.'),
  t('spread', 'chat', 'Group chats', 6, 2, 1, ['mouth'], { net: 0.5 }, 'Pasted into every chat. Much better where people are online.'),
  t('spread', 'market', 'Market stalls', 5, 4, 1, ['mouth'], { offline: 0.5, land: 0.2 }, 'Shouted across the street. Better where people aren’t online.'),
  t('spread', 'lyrics', 'Song lyrics', 10, 0, 2, ['school', 'chat'], { young: 0.4, lang: 0.15, noto: 1 }, 'Someone puts it in a chorus. Young people everywhere, in any language.'),
  t('spread', 'memes', 'Memes', 10, 2, 2, ['chat'], { net: 0.6, noto: 2 }, 'A picture with the word on it. Online regions, and people notice.'),
  t('spread', 'radio', 'Radio jingles', 9, 4, 2, ['market'], { offline: 0.5, lang: 0.1 }, 'Stuck in an advert. Reaches people without the internet.'),
  t('spread', 'airport', 'Airport chatter', 8, 1, 3, ['chat', 'market'], { air: 1 }, 'Overheard at the gate. More flights carry it to new countries.'),
  t('spread', 'dock', 'Dockside talk', 7, 3, 3, ['market', 'chat'], { sea: 1 }, 'Sailors swap it. More ships carry it to new coasts.'),
  t('spread', 'tv', 'TV catchphrase', 15, 0, 4, ['lyrics', 'radio'], { catch: 0.06, noto: 3 }, 'A sitcom character says it every week. Catchier, and very noticeable.'),
  t('spread', 'translate', 'Translation apps', 14, 2, 4, ['memes', 'airport'], { lang: 0.35 }, 'Apps leave it untranslated. Crosses into other languages much more easily.'),
  t('spread', 'cruise', 'Cruise ships', 12, 4, 4, ['dock'], { sea: 1.2, air: 0.3 }, 'A whole ship of tourists takes it home.'),
  t('spread', 'viral', 'Viral video', 22, 1, 5, ['tv', 'memes'], { catch: 0.08, net: 0.5, noto: 4 }, 'Everyone has seen it. Huge spread online, and everyone knows.'),
  t('spread', 'jetset', 'Jet set', 18, 3, 5, ['airport', 'cruise'], { air: 1.5 }, 'Business travellers carry it between every capital.'),

  // The word.
  t('word', 'punchy', 'Short & punchy', 4, 1, 0, [], { catch: 0.04, noto: 1 }, 'Easy to say. A bit catchier.'),
  t('word', 'rhyme', 'Rhymes with everything', 4, 3, 0, [], { catch: 0.035, noto: 1 }, 'Fits in any sentence. A bit catchier.'),
  t('word', 'ironic', 'Said ironically', 6, 0, 1, ['punchy'], { catch: 0.03, absorb: 0.002, noto: 1 }, 'People say it as a joke, then forget it was one. Starts being absorbed.'),
  t('word', 'rude', 'Sounds a bit rude', 7, 2, 1, ['punchy', 'rhyme'], { catch: 0.07, noto: 5 }, 'It isn’t, but it sounds it. Much catchier, and loud.'),
  t('word', 'hashtag', 'Hashtag', 6, 4, 1, ['rhyme'], { net: 0.3, noto: 2 }, 'Trending. Better online, and noticeable.'),
  t('word', 'plural', 'Takes a plural', 9, 0, 2, ['ironic'], { absorb: 0.004, catch: 0.02 }, 'It behaves like a real word now. Absorbed faster.'),
  t('word', 'dance', 'A dance move', 12, 2, 2, ['rude', 'hashtag'], { young: 0.5, catch: 0.05, noto: 5 }, 'There’s a move that goes with it. Young people can’t stop.'),
  t('word', 'abbrev', 'Gets abbreviated', 10, 4, 2, ['hashtag'], { catch: 0.05, net: 0.2, noto: 2 }, 'Three letters in a text. Catchier, online especially.'),
  t('word', 'verb', 'Becomes a verb', 16, 1, 3, ['plural', 'dance'], { absorb: 0.008, catch: 0.03, noto: 2 }, 'People start doing it. Absorbed much faster.'),
  t('word', 'crossword', 'Crossword answer', 14, 3, 3, ['abbrev', 'plural'], { absorb: 0.006, formal: 0.2, noto: -1 }, 'Seven across. Respectable, and absorbed quietly.'),
  t('word', 'grandma', 'Grandma says it', 18, 0, 4, ['verb'], { absorb: 0.012, old: 0.6 }, 'Once your grandmother says it, it’s over: absorbed, everywhere.'),
  t('word', 'spellingbee', 'Spelling-bee word', 18, 4, 4, ['crossword'], { absorb: 0.01, formal: 0.3 }, 'Children are tested on it. Absorbed fast, even in formal places.'),
  t('word', 'everyday', 'Everyday word', 30, 2, 5, ['grandma', 'spellingbee'], { absorb: 0.03, noto: 3 }, 'Nobody remembers a time before it. Absorbs speakers very fast.'),

  // Staying power.
  t('stay', 'office', 'Office-safe', 8, 0, 0, [], { formal: 0.3 }, 'You can say it in a meeting. Better in formal places.'),
  t('stay', 'loanword', 'Loanword', 9, 2, 0, [], { lang: 0.25 }, 'Other languages borrow it as it is. Crosses language families more easily.'),
  t('stay', 'lowkey', 'Low-key', 8, 4, 0, [], { noto: -4 }, 'Nobody makes a fuss. Less notoriety: the Purists take longer to notice.'),
  t('stay', 'generations', 'Cross-generational', 12, 0, 1, ['office'], { old: 0.5, formal: 0.1 }, 'Parents say it too. Better where people are older.'),
  t('stay', 'multilingual', 'Multilingual', 15, 2, 1, ['loanword'], { lang: 0.4 }, 'It means the same thing everywhere. Crosses languages far more easily.'),
  t('stay', 'etymology', 'Plausible etymology', 12, 4, 1, ['lowkey'], { purist: 0.2 }, 'Someone claims it’s from Old Norse. The Purists work slower.'),
  t('stay', 'register', 'Formal register', 16, 0, 2, ['generations'], { formal: 0.4 }, 'Newsreaders use it. Much better in formal places.'),
  t('stay', 'autocorrect', 'Survives autocorrect', 10, 2, 2, ['multilingual', 'office'], { net: 0.25, purist: 0.1 }, 'Phones stop changing it. Better online, and harder to stamp out.'),
  t('stay', 'academic', 'Cited in a paper', 18, 4, 2, ['etymology'], { purist: 0.25, formal: 0.15 }, 'A linguist writes about it. The Purists work much slower.'),
  t('stay', 'reinvent', 'Reinvention', 20, 1, 3, ['register', 'autocorrect'], { resist: 0.5 }, 'It keeps finding new meanings. Speakers hold on after a ruling.'),
  t('stay', 'defiance', 'Defiant speakers', 22, 3, 3, ['autocorrect', 'academic'], { resist: 0.4, purist: 0.1 }, 'Being told not to only makes people say it more.')
]

export const TRAIT = Object.fromEntries(TRAITS.map((x) => [x.id, x]))

// What evolving costs right now: its price, plus one for every two traits
// already evolved in the same tree.
export function traitCost (id, owned) {
  const x = TRAIT[id]
  const inTree = owned.filter((o) => TRAIT[o]?.tree === x.tree).length
  return x.cost + Math.floor(inTree / 2)
}

export const DEVOLVE_COST = 2

export function canEvolve (id, owned) {
  const x = TRAIT[id]
  if (!x || owned.includes(id)) return false
  return x.req.length === 0 || x.req.some((r) => owned.includes(r))
}

// A trait can be devolved if nothing you have relies on it alone.
export function canDevolve (id, owned) {
  if (!owned.includes(id)) return false
  const rest = owned.filter((o) => o !== id)
  return rest.every((o) => { const x = TRAIT[o]; return x.req.length === 0 || x.req.some((r) => rest.includes(r)) })
}

export function totalFx (owned) {
  const fx = { catch: 0, net: 0, young: 0, offline: 0, old: 0, formal: 0, lang: 0, land: 0, air: 0, sea: 0, noto: 0, absorb: 0, purist: 0, resist: 0 }
  for (const id of owned) for (const [k, v] of Object.entries(TRAIT[id]?.fx || {})) fx[k] += v
  return fx
}
