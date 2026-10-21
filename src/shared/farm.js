// The Word Farm: a quiet place to grow words, fish, and get to know the
// word gods. Plain data and rules, shared by the core (src/core/farm.js)
// and the screen (src/renderer/Farm.jsx).
//
// Time is real time. Crops grow while their soil is wet (watering keeps it
// wet for WET_HOURS; rain keeps it wet all day) and never die. The gods can
// be talked to once a day and given two gifts a week, like in Stardew
// Valley, and nothing here depends on how you rate words: a new word drops
// a seed of itself whatever you gave it.

export const HOUR = 3600e3
export const WET_HOURS = 8
export const HEART = 250 // friendship points a heart
export const MAX_FRIEND = 8 * HEART // until you're dating
export const MAX_DATING = 10 * HEART
export const MAX_MARRIED = 14 * HEART
export const GIFTS_PER_WEEK = 2
export const TALK_POINTS = 20
export const GIFT_POINTS = { love: 80, like: 45, neutral: 20, dislike: -20, hate: -40 }
export const BIRTHDAY_MULT = 5
export const BOUQUET = 'bouquet'
export const QUILL = 'quill'
export const WORD_SEEDS_MAX = 60 // word seeds kept at once

// A small, stable hash for days and positions.
export function hash32 (str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
export function rng (seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

// Days and weeks are the computer's own (local) calendar.
const pad = (n) => String(n).padStart(2, '0')
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
export const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
export function weekKey (t) {
  const d = new Date(dayStart(t))
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // back to Monday
  return dayKey(d.getTime())
}
export const isRainy = (day) => hash32(`rain|${day}`) % 100 < 20
export const hourOf = (t) => { const d = new Date(t); return d.getHours() + d.getMinutes() / 60 }
export const partOfDay = (t) => { const h = hourOf(t); return h < 6 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'day' : h < 21 ? 'evening' : 'night' }

// --- crops -------------------------------------------------------------------------------
// hours: wet hours to grow. regrow: wet hours to fruit again after a harvest.
export const CROPS = {
  syllabeet: { name: 'Syllabeet', seed: 20, sell: 38, hours: 3, color: '#b0305a', leaf: '#4a9a3a', shape: 'root', blurb: 'A beet that comes in neat syllables. Quick and dependable.' },
  thyme: { name: 'Thesaurus thyme', seed: 30, sell: 62, hours: 5, color: '#7aa84a', leaf: '#5a8a3a', shape: 'herb', blurb: 'Smells like sage, savour, seasoning. Means the same thing.' },
  inkplant: { name: 'Inkplant', seed: 45, sell: 95, hours: 7, color: '#3a2a6a', leaf: '#3a7a4a', shape: 'hang', blurb: 'An eggplant full of ink. Glyph will want these.' },
  rhymeberry: { name: 'Rhymeberry', seed: 60, sell: 34, hours: 6, regrow: 3, color: '#3a5ad8', leaf: '#3a8a3a', shape: 'bush', blurb: 'Fruits again and again, in time with itself.' },
  sunflower: { name: 'Sonnet sunflower', seed: 40, sell: 115, hours: 9, color: '#e8b82a', leaf: '#4a8a2a', shape: 'flower', blurb: 'Fourteen petals, always. Count them.' },
  corn: { name: 'Alphabet corn', seed: 70, sell: 52, hours: 10, regrow: 5, color: '#f0d050', leaf: '#5a9a3a', shape: 'stalk', blurb: 'Every kernel is a letter. Regrows.' },
  melon: { name: 'Vowel melon', seed: 90, sell: 260, hours: 13, color: '#6ac85a', leaf: '#3a8a3a', shape: 'melon', blurb: 'Ooh. Aah. Sweet all the way through.' },
  punkin: { name: 'Pun-kin', seed: 120, sell: 360, hours: 18, color: '#e87a2a', leaf: '#4a7a2a', shape: 'melon', blurb: 'Gourd-geous. Pip grew the first one, and won’t stop saying so.' }
}
export const WORD_CROP = { hours: 4, color: '#c8a0e8', leaf: '#5a9a5a', shape: 'word' }
export const wordValue = (w) => 12 + 9 * String(w).replace(/[^a-z]/gi, '').length
export const cropDone = (p) => (p.crop === 'word' ? WORD_CROP.hours : CROPS[p.crop].hours) * HOUR

// --- foraging ----------------------------------------------------------------------------
export const FORAGE = {
  dandelion: { name: 'Dandelion', sell: 20, blurb: 'Make a wish.' },
  lavender: { name: 'Lavender', sell: 30, blurb: 'Calming. Hush keeps some in her pockets.' },
  clover: { name: 'Four-leaf clover', sell: 60, blurb: 'Lucky, apparently.' },
  inkcap: { name: 'Ink cap', sell: 45, blurb: 'A mushroom that drips ink. Good for writing, not for eating.' },
  shell: { name: 'Pond shell', sell: 25, blurb: 'Hold it to your ear: whispering.' }
}

// --- fish ----------------------------------------------------------------------------------
// diff: 1–100, how lively it is on the line. moves: how it swims.
// when: the parts of the day it bites. rain: only bites in the rain.
export const FISH = {
  minnow: { name: 'Dash minnow', sell: 25, diff: 15, moves: 'smooth', weight: 30, when: ['morning', 'day', 'evening', 'night'], color: '#9ab0c0', blurb: 'Small, quick, everywhere—like a dash.' },
  carp: { name: 'Comma carp', sell: 40, diff: 25, moves: 'smooth', weight: 24, when: ['morning', 'day', 'evening'], color: '#c8a050', blurb: 'Pauses a lot. Not quite finished.' },
  sunfish: { name: 'Semicolon sunfish', sell: 60, diff: 35, moves: 'mixed', weight: 16, when: ['day'], color: '#e8b830', blurb: 'Joins two halves of the pond together; nobody knows how to use it.' },
  trout: { name: 'Italic trout', sell: 85, diff: 45, moves: 'dart', weight: 12, when: ['morning', 'evening'], color: '#d07a8a', blurb: 'Swims at a slant.' },
  perch: { name: 'Ellipsis perch', sell: 75, diff: 40, moves: 'sinker', weight: 10, when: ['evening', 'night'], color: '#7a8ab8', blurb: 'Trails off at the end…' },
  eel: { name: 'Ampersand eel', sell: 120, diff: 60, moves: 'mixed', weight: 7, when: ['night'], color: '#4a6a4a', blurb: 'This & that & the other.' },
  koi: { name: 'Kerning koi', sell: 150, diff: 55, moves: 'floater', weight: 6, when: ['morning', 'day'], rain: true, color: '#f07040', blurb: 'Always a little too close to the next fish.' },
  salmon: { name: 'Serif salmon', sell: 140, diff: 65, moves: 'dart', weight: 5, when: ['day', 'evening'], color: '#e88a6a', blurb: 'Has little feet on its fins. Very proper.' },
  squid: { name: 'Quill squid', sell: 180, diff: 70, moves: 'sinker', weight: 4, when: ['night'], color: '#2a2a4a', blurb: 'Writes its own name in ink as it swims away.' },
  lexifish: { name: 'The Great Lexifish', sell: 1500, diff: 95, moves: 'mixed', weight: 0.6, when: ['morning', 'day', 'evening', 'night'], rain: true, color: '#e8c84a', legendary: true, blurb: 'Knows every word. Said to have eaten a dictionary.' },
  page: { name: 'Soggy page', sell: 1, diff: 0, moves: 'none', weight: 6, when: ['morning', 'day', 'evening', 'night'], junk: true, color: '#d8d0b8', blurb: 'Page 412 of something. Illegible now.' }
}

// What bites now, by weight.
export function fishPool (t, rainy) {
  const part = partOfDay(t)
  return Object.entries(FISH).filter(([, f]) => f.when.includes(part) && (!f.rain || rainy))
}
export function pickFish (r, t, rainy) {
  const pool = fishPool(t, rainy)
  const total = pool.reduce((a, [, f]) => a + f.weight, 0)
  let x = r() * total
  for (const [id, f] of pool) { x -= f.weight; if (x <= 0) return id }
  return pool[0][0]
}

// --- the shop ---------------------------------------------------------------------------
export const SHOP = [
  ...Object.entries(CROPS).map(([id, c]) => ({ id: `seed:${id}`, name: `${c.name} seeds`, price: c.seed, blurb: c.blurb })),
  { id: BOUQUET, name: 'Bouquet of letters', price: 400, blurb: 'Give it to a god at 8 hearts to start dating.' },
  { id: QUILL, name: 'Promise quill', price: 5000, blurb: 'Give it to the god you’re dating, at 10 hearts, to ask them to marry you.' }
]

// --- items ------------------------------------------------------------------------------
// Items are ids: 'syllabeet', 'carp', 'dandelion', 'word:tranquil', 'seed:melon', 'bouquet'.
export function itemInfo (id) {
  if (id.startsWith('word:')) { const w = id.slice(5); return { id, name: `“${w}”`, sell: wordValue(w), kind: 'word', word: w, blurb: 'A word you grew. Some gods are particular about words.' } }
  if (id.startsWith('wordseed:')) { const w = id.slice(9); return { id, name: `“${w}” seed`, sell: 0, kind: 'wordseed', word: w, blurb: 'Plant it and the word grows.' } }
  if (id.startsWith('seed:')) { const c = CROPS[id.slice(5)]; return c ? { id, name: `${c.name} seeds`, sell: Math.floor(c.seed / 2), kind: 'seed', crop: id.slice(5), blurb: c.blurb } : null }
  if (CROPS[id]) return { id, ...CROPS[id], kind: 'crop' }
  if (FISH[id]) return { id, ...FISH[id], kind: 'fish' }
  if (FORAGE[id]) return { id, ...FORAGE[id], kind: 'forage' }
  if (id === BOUQUET) return { id, name: 'Bouquet of letters', sell: 0, kind: 'special', blurb: 'For a god at 8 hearts.' }
  if (id === QUILL) return { id, name: 'Promise quill', sell: 0, kind: 'special', blurb: 'For the god you’re dating, at 10 hearts.' }
  return null
}

// --- the word gods --------------------------------------------------------------------------
const vowels = (w) => (w.match(/[aeiou]/gi) || []).length / Math.max(1, w.length)
const SILENT = /kn|wr|gn|mb\b|ght|ps|bt\b|mn\b|^ho|stle|lk|lm\b/i

export const GODS = {
  vela: {
    name: 'Vela',
    title: 'Goddess of Vowels',
    birthday: [4, 5],
    loves: ['melon', 'rhymeberry', 'sunflower', 'trout'],
    likes: ['dandelion', 'lavender', 'shell', 'carp', 'koi'],
    dislikes: ['inkplant', 'eel'],
    hates: ['page'],
    word: (w) => (vowels(w) >= 0.5 ? 'love' : vowels(w) < 0.25 ? 'dislike' : 'like'),
    wordHint: 'loves open, vowel-rich words',
    lines: {
      t0: ['Oh! Hello-o-o. I didn’t see you there. I was humming.', 'Every word needs a little breath in it. That’s where I come in.', 'Do you hear that? The pond is singing in A minor today.'],
      t1: ['You say my name so softly. Most people rush the e.', 'I planted a vowel melon once. It grew so round it rolled away.', 'Some words have no vowels at all. I worry about them. Who holds them up?'],
      t2: ['When you’re near, everything sounds a little warmer.', 'I wrote you a song, but it’s only vowels. Ooh-aah-ee. Do you like it?', 'Stay a while? The evening is so open today.'],
      dating: ['I hummed your name all morning. Kip told me to stop. I didn’t.', 'Walk with me to the pond? The light sings at this hour.', 'I keep finding reasons to come by your farm. I hope you don’t mind.'],
      married: ['Good morning, love. I watered the melons and sang to them. They looked happier.', 'Our house is never quiet, and I like it that way.', 'Come home early tonight? I’ll make tea and we’ll listen to the rain.']
    },
    events: {
      2: ['Vela is sitting on the pond’s edge, eyes closed.', '“Shh, listen. Each ripple is a vowel. That one was an o.”', '“You’re the first one who ever listened back.”'],
      4: ['Vela is crying, very quietly, under a tree.', '“Someone called me ‘just the soft bits’. Like I’m only filler.”', 'You tell her there’s no word without her.', '“…You really think so? Thank you. That helps more than you know.”'],
      6: ['Vela is singing near your fields. The sprouts lean toward her.', '“Plants like a song. So do people, if you sing the right one.”', 'She sings a long, open note just for you.'],
      8: ['At sunset, Vela takes your hand at the pond.', '“I used to think I had to fill every silence. With you, I don’t.”', '“If you ever wanted to, I’d like to be more than friends.”']
    },
    react: { love: 'Ooh! Oh, this is wonderful. Thank you!', like: 'Aw, that’s lovely. Thank you.', neutral: 'Oh, for me? Thank you.', dislike: 'Hm. It’s… a bit consonant-y, isn’t it?', hate: 'Oh. Oh no. I’ll just… put that down.', birthday: 'You remembered my birthday! I could sing!' },
    accept: { bouquet: 'Yes! Oh, yes. I’ve been hoping you’d ask.', quill: 'Marry you? Yes, a thousand open-throated yeses!' }
  },
  kip: {
    name: 'Kip',
    title: 'God of Consonants',
    birthday: [11, 2],
    loves: ['corn', 'syllabeet', 'eel', 'salmon'],
    likes: ['inkplant', 'minnow', 'inkcap', 'clover'],
    dislikes: ['melon', 'lavender'],
    hates: ['page'],
    word: (w) => (vowels(w) <= 0.25 ? 'love' : vowels(w) >= 0.5 ? 'dislike' : 'like'),
    wordHint: 'loves crunchy, consonant-heavy words',
    lines: {
      t0: ['Hm. Farmer. Good.', 'Words need bones. I make the bones. Strengths. Rhythms. Crwth.', 'Busy. Hammering out a new cluster. Str. Spl. Ngth.'],
      t1: ['You work hard. I respect that.', 'Vela thinks I’m rude. I’m not rude. I’m concise.', 'Brought my tools. Fence by the pond needed fixing. Fixed it.'],
      t2: ['…You’re all right. More than all right.', 'Made you something. A nail. A good one. Don’t lose it.', 'I don’t talk much. But I talk to you.'],
      dating: ['Thought about you. While hammering. Hit my thumb.', 'Walk? Short one. Then a longer one.', 'You make the hard sounds softer. Don’t tell anyone.'],
      married: ['Fixed the gate. Fixed the roof. Made breakfast. Burnt it. Ate it anyway.', 'Home. Good word. Better with you in it.', 'Rest today. I’ll handle the corn.']
    },
    events: {
      2: ['Kip is hammering at an anvil behind the grove.', '“Every word starts with a strike. Like this.” Clang.', '“…You can try. Careful with your thumb.”'],
      4: ['Kip is staring at a broken word on his anvil.', '“Tried to make a word with no vowels. Rhythm. Close. Not quite.”', 'You suggest asking Vela for help.', '“…Fine. Maybe. Don’t tell her I said fine.”'],
      6: ['Kip has built a little bench by your field.', '“For you. To sit. When tired. You’re always tired.”', 'It’s sturdy, and carved with tiny consonants.'],
      8: ['Kip stands at your door, holding a hand-forged rose.', '“Not good at words. Ironic. I made most of them.”', '“I like you. A lot. That’s it. That’s the speech.”']
    },
    react: { love: 'Good. Very good. Thanks.', like: 'Nice. Thanks.', neutral: 'Hm. Thanks.', dislike: 'Too soft.', hate: 'No.', birthday: 'You remembered. Huh. Thanks.' },
    accept: { bouquet: 'Yes. Obviously yes.', quill: 'Marry you. Yes. Strongest word I know.' }
  },
  etyma: {
    name: 'Etyma',
    title: 'Goddess of Roots',
    birthday: [9, 21],
    loves: ['thyme', 'inkcap', 'salmon', 'clover'],
    likes: ['syllabeet', 'corn', 'shell', 'perch'],
    dislikes: ['punkin'],
    hates: ['page'],
    word: (w) => (w.length >= 9 ? 'love' : w.length >= 6 ? 'like' : 'neutral'),
    wordHint: 'loves long words with history in them',
    lines: {
      t0: ['Ah, a new face. From the Old English fæger, fair. Welcome.', 'Every word has roots. Most people never dig.', 'Did you know “farm” once meant a fixed payment? Words wander.'],
      t1: ['You ask good questions. Very rare, these days.', 'I keep a garden of root-words. Some are older than the hills.', '“Companion” means someone you share bread with. Here, have some bread.'],
      t2: ['I’ve grown fond of you, dear. From the Old English fond… well. It meant foolish. Perhaps I am.', 'Sit. Let me tell you where “heart” comes from.', 'You remind me of a word I loved long ago.'],
      dating: ['I looked up “darling” for you. Dēorling. Little dear one.', 'The oldest words are the simplest. I love you is very old.', 'Read with me this evening? I’ve saved you the comfortable chair.'],
      married: ['Good morning, dēorling. The thyme is doing beautifully.', 'I added our names to my great book of roots. Side by side.', 'Home: from hām. A village, a dwelling, a heart. All three, here.']
    },
    events: {
      2: ['Etyma is kneeling in the grove, digging gently.', '“Look, a root-word. Very old. It meant ‘to grow’.”', 'She lets you hold it. It feels warm.'],
      4: ['Etyma’s great book is soaking wet by the pond.', '“My notes. Centuries of them.”', 'You help her dry every page in the sun.', '“You patient thing. Thank you.”'],
      6: ['Etyma is waiting on your porch with tea.', '“You know, I traced your name back today. It means ‘one who stays’.”', '“I hope that’s true.”'],
      8: ['Under the old tree in the grove, Etyma closes her book.', '“I’ve spent forever on where words come from. I’d like to think about where they’re going. With you.”']
    },
    react: { love: 'Oh, how splendid. You know me well.', like: 'Lovely, dear. Thank you.', neutral: 'Thank you, dear.', dislike: 'Hm. Rather newfangled.', hate: 'That has no roots at all. Please take it away.', birthday: 'A birthday gift! At my age! You dear thing.' },
    accept: { bouquet: 'Courting! How wonderfully old-fashioned. Yes.', quill: 'Yes. Let’s become an old word together.' }
  },
  orrin: {
    name: 'Orrin',
    title: 'God of Rhyme',
    birthday: [7, 14],
    loves: ['rhymeberry', 'koi', 'sunflower', 'clover'],
    likes: ['melon', 'trout', 'dandelion', 'carp'],
    dislikes: ['syllabeet', 'minnow'],
    hates: ['page'],
    word: (w) => (/(ing|ight|tion|ay|ee|oon)$/i.test(w) ? 'love' : /(y|e)$/i.test(w) ? 'like' : 'neutral'),
    wordHint: 'loves words that end in a ring: -ing, -ight, -tion',
    lines: {
      t0: ['A stranger, I see, on a fine sunny day; I’m Orrin, the rhymer. Good farming, I say!', 'I rhyme when I speak, it’s a habit, you see. It started at birth, and it won’t let me be.', 'The pond’s looking bright and the weather is fair; I tried a new couplet. It went… over there.'],
      t1: ['You listen so well to my lute and my lines; you’re turning out finer than most other finds.', 'I tried to rhyme “orange”. I wept for a week. It’s not that I’m sad, I’m just… lacking technique.', 'Your farm’s looking grand, all the rows standing straight; I wrote it a ballad. It’s called “Crop Debate”.'],
      t2: ['I’ve written a song and it’s all about you. It’s mostly the chorus. The verses are… due.', 'When you’re around me, my rhymes come out right; the lute stays in tune and the words take to flight.', 'Some nights I can’t sleep, I just strum and I sigh, and think of a farmer. I’ll let you guess why.'],
      dating: ['My heart’s like a sonnet with only one theme: it’s you, by the river, the field, and the stream.', 'Let’s walk by the pond as the evening grows long; you be the quiet, I’ll be the song.', 'I tried not to rhyme, just to tell you it straight: I love you. Ah. Rhymed it with “straight”. Wait.'],
      married: ['Good morning, my dear, the coffee is hot; I wrote you a poem. It’s short. It’s a lot.', 'Our home is a verse that I never want done; it rhymes every morning, it rhymes in the sun.', 'I’ll water the berries, I’ll sweep and I’ll sing; you rest for a while. You’re my everything.']
    },
    events: {
      2: ['Orrin is strumming his lute, frowning at a page.', '“I need a rhyme for ‘silver’. Is there one? Is there? No?”', 'You suggest “chilver”. It isn’t a word.', '“…Chilver. I love it. It’s a word now. You’re a genius.”'],
      4: ['Orrin sits alone, lute unstrung.', '“Sometimes I wonder if I rhyme just so no one hears what I mean.”', '“Thanks for listening anyway. Even to the bad ones.”'],
      6: ['Orrin plays a little concert by your fields, just for you.', 'The song is about a farmer, a pond, and a slightly embarrassing chorus.', '“Too much? It’s too much. Encore?”'],
      8: ['Orrin, at the dock, lute down for once.', '“No rhyme this time. I like you. More than anyone. That’s all.”', '“…Well. That rhymed with ‘all’, sort of. Close enough.”']
    },
    react: { love: 'Why, what a delight! You’ve got it just right!', like: 'A gift for me, how kind you can be!', neutral: 'For me? Well, how neat. Thank you, my sweet.', dislike: 'Hm, well… it’s a thing. Does it rhyme? It does… not.', hate: 'Oh no. I’m aghast. Please hide that, and fast.', birthday: 'My birthday! You knew! I could write you a song! …I will. It’ll be long.' },
    accept: { bouquet: 'A bouquet for me? Then yes, let it be!', quill: 'Yes, now and forever, as long as we’re near: I’ll rhyme with you, love, every day of the year.' }
  },
  hush: {
    name: 'Hush',
    title: 'Goddess of Silent Letters',
    birthday: [12, 1],
    loves: ['lavender', 'perch', 'squid', 'shell'],
    likes: ['thyme', 'inkcap', 'dandelion', 'minnow'],
    dislikes: ['punkin', 'corn'],
    hates: ['page'],
    word: (w) => (SILENT.test(w) ? 'love' : 'neutral'),
    wordHint: 'loves words with a silent letter: knight, write, gnome, lamb',
    lines: {
      t0: ['…Oh. Hello.', 'I’m the k in knife. Nobody notices. It’s fine.', '…The pond is quiet today. I like it.'],
      t1: ['You noticed me. Most people look straight through.', 'Every silent letter remembers how it used to sound.', '…I left some lavender by your door. In case you didn’t notice.'],
      t2: ['It’s nice, being quiet with you.', 'I hum sometimes. Only when no one is around. …And you.', 'You don’t have to say anything. I can hear you anyway.'],
      dating: ['…I like when you visit. My heart gets loud.', 'Sit with me by the pond tonight? We don’t have to talk.', 'I wrote your name and left out every silent letter. Then I put them back. They belong.'],
      married: ['Good morning. …I made tea. It’s still warm.', 'The house is quiet in the best way.', 'I left you something on the windowsill. You’ll find it.']
    },
    events: {
      2: ['Hush is at the edge of the pond at night, watching the moths.', '“…They don’t make a sound either. We get along.”'],
      4: ['Hush is crossing out letters in an old book.', '“They want to cut the silent letters. To ‘modernize’.”', 'You tell her the k in knight is the best part.', '“…Really? …Thank you.”'],
      6: ['You find a little silence on your doorstep: a jar of evening, sealed.', 'The tag says: “For when it’s too loud. —H”'],
      8: ['Hush finds you at dusk and takes your hand, saying nothing for a long time.', '“…I’d like to be the quiet part of your life. If you’d let me.”']
    },
    react: { love: '…Oh. Oh. Thank you. Really.', like: '…That’s nice. Thank you.', neutral: '…Thank you.', dislike: '…It’s very loud.', hate: '…Please, no.', birthday: '…You remembered. Nobody remembers.' },
    accept: { bouquet: '…Yes. Quietly, completely yes.', quill: '…Yes. I’ve been yes for a while now.' }
  },
  pip: {
    name: 'Pip',
    title: 'God of Puns',
    birthday: [4, 1],
    loves: ['punkin', 'carp', 'corn', 'minnow'],
    likes: ['syllabeet', 'sunflower', 'sunfish', 'clover'],
    dislikes: ['thyme', 'lavender'],
    hates: ['page'],
    word: (w) => (/(.)\1/.test(w) ? 'love' : w.length <= 4 ? 'like' : 'neutral'),
    wordHint: 'loves words with double letters, and anything short and punchy',
    lines: {
      t0: ['Hey there! I’m Pip. I’d tell you a farming joke, but it’s still growing on me.', 'Did you hear about the scarecrow who won an award? Outstanding in his field.', 'I’m reading a book about anti-gravity. Can’t put it down.'],
      t1: ['You laugh at my jokes! Even the bad ones! Especially the bad ones!', 'Why did the tomato blush? It saw the salad dressing. …I’ll see myself out.', 'I tried to catch fog this morning. Mist.'],
      t2: ['You’re one in a melon. I mean it. Literally, I checked.', 'Lettuce be friends forever. Okay, that one was sincere.', 'Some days I make puns so nobody sees I’m nervous. Not with you, though.'],
      dating: ['You’re the apple of my pie. I’ll workshop it.', 'I love you a latte. I don’t even drink coffee. That’s how much.', 'Every joke I tell is secretly about how much I like you. Even the fish ones.'],
      married: ['Good morning! I made pancakes. They’re flat out delicious.', 'Marriage is great. It’s like a pun that keeps getting better.', 'I watered the pun-kins. They’re gourd to go.']
    },
    events: {
      2: ['Pip is juggling three pun-kins near your field.', '“Watch this! …I’m going to drop one. I’m going to drop— gourd night.”'],
      4: ['Pip is sitting alone, unusually still.', '“Sometimes nobody laughs and I feel like a joke. Not in the good way.”', 'You laugh at the next pun he tells, and mean it.', '“…Thanks. That one was terrible, too.”'],
      6: ['Pip has left a joke book on your porch, every page signed “—P”.', 'The last page just says: “No joke: you’re my favourite.”'],
      8: ['Pip meets you at the dock, bells on his cap jingling.', '“I had a pun ready. I’m not going to use it.”', '“I really, really like you. No punchline.”']
    },
    react: { love: 'Oh wow! This is un-be-leaf-able!', like: 'Nice! You’re a real gift. Literally.', neutral: 'For me? I’m touched. Not literally.', dislike: 'Oof. That’s a bit of a groaner. Not the good kind.', hate: 'Yikes. That’s pun-ishment.', birthday: 'A birthday gift?! Present company definitely included!' },
    accept: { bouquet: 'Yes! I’m bouquet-ching with joy! …Sorry. Yes!', quill: 'Yes! I do! No joke, the best yes of my life.' }
  },
  thea: {
    name: 'Thea',
    title: 'Goddess of Synonyms',
    birthday: [2, 18],
    loves: ['thyme', 'sunflower', 'koi', 'sunfish'],
    likes: ['melon', 'inkplant', 'clover', 'trout'],
    dislikes: ['eel'],
    hates: ['page'],
    word: (w) => (w.length >= 10 ? 'love' : 'like'),
    wordHint: 'likes every word, and loves long ones',
    lines: {
      t0: ['Hello! Hi! Greetings! I’m Thea. Pleased, delighted, glad to meet you.', 'Lovely, beautiful, gorgeous day, isn’t it?', 'I’m reading, perusing, studying. Mostly the same book, three times.'],
      t1: ['You’re kind, gentle, considerate. All three, honestly.', 'Every word has a sibling or two. Nobody should be alone.', 'Have you tried the thesaurus thyme? Tasty, flavourful, scrumptious.'],
      t2: ['I like you. Fancy you. Adore you, maybe. Oh dear.', 'You make me lose my words. I have so many, too!', 'Being with you is easy, simple, effortless.'],
      dating: ['Darling, dearest, sweetheart. I couldn’t pick one.', 'I’ve been happy, joyful, giddy all week.', 'Stay, linger, remain a little longer?'],
      married: ['Good morning, love, dear, heart!', 'I’ve labeled every jar in the kitchen with three names. Find, locate, discover the sugar.', 'Home, house, hearth. With you, they all mean the same thing.']
    },
    events: {
      2: ['Thea is surrounded by little paper slips, sorting them.', '“Synonyms! Big ones with small ones. Happy with glad. Everyone needs a match.”'],
      4: ['Thea is frowning at a single slip of paper.', '“This word has no synonym. It’s all alone.”', 'You suggest it doesn’t need one. Some things are just themselves.', '“…Unique. Singular. One of a kind. Like you.”'],
      6: ['Thea has filled your mailbox with notes.', 'Each one says the same thing a different way: you matter to her.'],
      8: ['Thea finds you in the grove, notes scattered by the wind.', '“I’ve looked everywhere for the right word for how I feel.”', '“There isn’t one. There’s just you.”']
    },
    react: { love: 'Oh! Wonderful, marvellous, perfect!', like: 'How nice, sweet, thoughtful!', neutral: 'Thank you, thanks, cheers!', dislike: 'Oh. Hm. That’s… unusual, odd, peculiar.', hate: 'Oh dear. Awful, dreadful, no thank you.', birthday: 'My birthday, anniversary-of-birth, special day! You remembered!' },
    accept: { bouquet: 'Yes! Absolutely, certainly, definitely yes!', quill: 'Yes. No synonyms needed. Just yes.' }
  },
  glyph: {
    name: 'Glyph',
    title: 'God of Letters and Ink',
    birthday: [10, 30],
    loves: ['squid', 'inkplant', 'inkcap', 'eel'],
    likes: ['salmon', 'perch', 'thyme', 'shell'],
    dislikes: ['dandelion', 'sunflower'],
    hates: ['page'],
    word: (w) => (/[qxzj]/i.test(w) ? 'love' : 'neutral'),
    wordHint: 'loves words with rare letters: q, x, z, j',
    lines: {
      t0: ['Careful. Ink’s still wet.', 'Every letter was drawn by hand, once. I remember drawing them.', 'The Q was my favourite. Nobody uses it enough.'],
      t1: ['You have nice handwriting. I can tell from how you hold a hoe.', 'I’m designing a new letter. It’s for the sound of rain on a pond.', 'The squid in that pond write better than most scholars.'],
      t2: ['I drew your initial this morning. Forty times. To get it right.', 'Some letters are only beautiful next to the right one. Like us.', 'Sit for a portrait? I’ll draw you in ink. Slowly.'],
      dating: ['I’ve been writing your name in the margins of everything.', 'Ink fades. This won’t.', 'I designed a ligature for our names. It’s very elegant.'],
      married: ['Good morning. I wrote today’s date in gold. It felt important.', 'The house smells like ink and bread. Perfect.', 'I fed the squid in the pond. They asked about you.']
    },
    events: {
      2: ['Glyph is at the dock, drawing in the air with a quill made of ink.', '“Letters are just pictures that learned to talk.”'],
      4: ['Glyph is staring at a smudged page.', '“One slip. Hours of work.”', 'You point out the smudge looks like a little fish.', '“…So it does. I’ll keep it.”'],
      6: ['Glyph presents you with a sign for your farm, hand-lettered in ink.', 'Your farm’s name, in a script nobody else will ever have.'],
      8: ['Glyph writes something on your palm, very carefully.', 'It’s a letter you’ve never seen. “It means you,” he says. “I made it for you.”']
    },
    react: { love: 'Exquisite. Thank you.', like: 'Very nice. Thank you.', neutral: 'Thank you.', dislike: 'Hm. Not quite my style.', hate: 'That’s been rained on, hasn’t it.', birthday: 'You remembered. I’ll write it down so I never forget.' },
    accept: { bouquet: 'Yes. Let me write that down. Yes.', quill: 'A quill. Of course. Yes, with every letter I’ve got.' }
  }
}
export const GOD_IDS = Object.keys(GODS)

// How a god feels about a gift.
export function taste (godId, itemId) {
  const g = GODS[godId]
  const info = itemInfo(itemId)
  if (!g || !info) return 'neutral'
  if (info.kind === 'word') return g.word(info.word)
  if (info.kind === 'seed' || info.kind === 'wordseed') return 'neutral'
  for (const k of ['loves', 'likes', 'dislikes', 'hates']) if (g[k].includes(itemId)) return { loves: 'love', likes: 'like', dislikes: 'dislike', hates: 'hate' }[k]
  return 'neutral'
}

export const isBirthday = (godId, t) => { const d = new Date(t); const [m, day] = GODS[godId].birthday; return d.getMonth() + 1 === m && d.getDate() === day }
export const heartsOf = (points) => Math.floor(points / HEART)

// --- the map -------------------------------------------------------------------------------
// 32 × 20 tiles. Letters: T tree, . grass, , path, W water, H house, S stall,
// B shipping bin, F fence, P plot, D dock, A altar stone, R rock, f flowers.
export const MAP = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'T..f....................f.....TT',
  'T.HHHHH...SSS.......WWWWWW....TT',
  'T.HHHHH...SSS.....WWWWWWWWW...TT',
  'T.HHHHH..f,,,....WWWWWWWWWWW..TT',
  'T.HHHHHB..,......WWWWWWWWWWW...T',
  'T....,,,,,,,,,,,DWWWWWWWWWWW...T',
  'T....,..........,WWWWWWWWWW..f.T',
  'T.FFF,FFFFFFFFFF.WWWWWWWWW.....T',
  'T.FPPPPPPPPPPPPF..WWWWWWW....R.T',
  'T.FPPPPPPPPPPPPF........,......T',
  'T.FPPPPPPPPPPPPF.......,,......T',
  'T.FFFFFF,FFFFFFF......,....TT..T',
  'T.......,.....f......,..A...A..T',
  'T..f....,,,,,,,,,,,,,,.........T',
  'T..R....................A...A..T',
  'T.......f.........f.......A....T',
  'TT...........TT...........f....T',
  'TTT.....f...TTTT.......f......TT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT'
]
export const MAP_W = MAP[0].length
export const MAP_H = MAP.length
export const tileAt = (x, y) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? 'T' : MAP[y][x])
export const SOLID = new Set(['T', 'W', 'H', 'S', 'B', 'F', 'R', 'A'])
export const PLOTS = []
for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (MAP[y][x] === 'P') PLOTS.push([x, y])
export const plotIndex = (x, y) => PLOTS.findIndex(([px, py]) => px === x && py === y)
export const DOOR = [4, 6]

// Where each god spends each part of the day (tile x, y).
export const SPOTS = {
  vela: { morning: [17, 10], day: [21, 13], evening: [16, 8], night: [26, 14] },
  kip: { morning: [11, 6], day: [8, 13], evening: [12, 14], night: [24, 14] },
  etyma: { morning: [25, 12], day: [26, 17], evening: [22, 16], night: [27, 16] },
  orrin: { morning: [15, 4], day: [16, 13], evening: [15, 7], night: [25, 13] },
  hush: { morning: [30, 8], day: [29, 4], evening: [28, 10], night: [26, 9] },
  pip: { morning: [8, 7], day: [12, 7], evening: [6, 14], night: [24, 16] },
  thea: { morning: [20, 11], day: [5, 16], evening: [10, 16], night: [28, 16] },
  glyph: { morning: [27, 8], day: [16, 5], evening: [26, 8], night: [16, 9] }
}

// Forage for the day: a few things on the grass, the same all day.
export function forageFor (day) {
  const r = rng(hash32(`forage|${day}`))
  const kinds = Object.keys(FORAGE)
  const out = []
  const used = new Set()
  for (let tries = 0; out.length < 5 && tries < 400; tries++) {
    const x = 1 + Math.floor(r() * (MAP_W - 2))
    const y = 1 + Math.floor(r() * (MAP_H - 2))
    const t = tileAt(x, y)
    if ((t !== '.' && t !== 'f') || used.has(`${x},${y}`)) continue
    if (Object.values(SPOTS).some((s) => Object.values(s).some(([sx, sy]) => sx === x && sy === y))) continue
    const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tileAt(x + dx, y + dy) === 'W')
    const kind = nearWater ? 'shell' : kinds.filter((k) => k !== 'shell')[Math.floor(r() * 4)]
    used.add(`${x},${y}`)
    out.push({ id: `${x},${y}`, x, y, kind })
  }
  return out
}
