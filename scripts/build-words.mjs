// Builds data/words.json.gz, the word list wirdwatcher deals from, out of
// Open English WordNet 2025 (CC BY 4.0, https://en-word.net).
//
//   node scripts/build-words.mjs [path/to/english-wordnet-2025.xml.gz]
//
// With no path it downloads the release from GitHub (into .cache/). The
// result is committed, so nobody needs to run this to play.
//
// What's kept:
//   - single lowercase words made only of letters (no names, phrases,
//     numbers or abbreviations)
//   - every sense of each word: part of speech, topic (WordNet's lexicographer
//     file), definition, up to three examples, and synonyms that are also
//     playable words
//   - IPA pronunciations where WordNet has them
//
// What's left out, so the game stays friendly:
//   - any word with a sense WordNet marks as an ethnic slur or racism
//   - senses marked as obscene, vulgar, disparaging or offensive (the word
//     stays if it has other senses: "pig" the animal, "screw" the fastener)
//   - any word on the LDNOOBW English list (CC BY 4.0), plus a few extras,
//     except everyday words in ALLOWED that the list catches for a slang use

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cache = path.join(root, '.cache')
const OEWN_URL = 'https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025.xml.gz'
const BLOCK_URL = 'https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en'

// Usage markers in WordNet ("this sense exemplifies ...").
const DROP_WORD_MARKERS = new Set(['oewn-06731706-n', 'oewn-01157531-n']) // ethnic slur, racism
const DROP_SENSE_MARKERS = new Set(['oewn-07139048-n', 'oewn-06730109-n', 'oewn-derogation__1.10.00..']) // obscenity, disparagement
const DROP_WORD_DEFINITION = /\b(slur|ethnic slur)\b/i
const DROP_SENSE_DEFINITION = /\b(vulgar|obscene|obscenity|taboo|offensive|derogatory|disparaging|uncomplimentary|insulting|abusive|contemptuous term|slang for (a )?(penis|vagina|breasts?|buttocks|sex))\b/i
const EXTRA_BLOCKED = ['nigger', 'nigga', 'faggot', 'fag', 'retard', 'tranny', 'spic', 'chink', 'kike', 'gook', 'wetback', 'cunt', 'twat', 'wank', 'wanker', 'bollocks', 'shite', 'arse', 'arsehole', 'bugger', 'skank', 'slut', 'whore', 'tits', 'boob', 'boobs', 'jizz', 'cum', 'dildo', 'pussy', 'cock', 'dick', 'prick', 'bastard', 'bitch', 'piss', 'shit', 'fuck', 'damn', 'crap', 'bullshit', 'horseshit', 'motherfucker', 'ass', 'asshole', 'jackass', 'dyke', 'homo', 'coon', 'darky', 'paki', 'raghead', 'towelhead', 'redskin', 'squaw', 'gypsy', 'gyp', 'retarded', 'retard']

// Everyday words the lists above catch only for a slang meaning.
const ALLOWED = new Set(['tool', 'screw', 'bang', 'cracker', 'hump', 'bloody', 'hell', 'queer', 'sex', 'poop', 'knockers', 'pecker', 'beaver', 'pussycat', 'cocktail', 'hooker', 'nipple', 'snatch', 'tit', 'rubber', 'woody', 'pawn', 'pansy', 'faggoting'])

const POS = { n: 'n', v: 'v', a: 'a', s: 'a', r: 'r' } // satellites are adjectives

async function download (url, file) {
  if (fs.existsSync(file)) return
  fs.mkdirSync(path.dirname(file), { recursive: true })
  console.log(`Downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
}

const unescape = (s) => s.replace(/&(apos|quot|amp|lt|gt);/g, (_, e) => ({ apos: "'", quot: '"', amp: '&', lt: '<', gt: '>' }[e]))
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? unescape(m[1]) : null }

async function main () {
  const xmlFile = process.argv[2] || path.join(cache, 'english-wordnet-2025.xml.gz')
  if (!process.argv[2]) await download(OEWN_URL, xmlFile)
  const blockFile = path.join(cache, 'ldnoobw-en.txt')
  await download(BLOCK_URL, blockFile)
  const blocked = new Set([...fs.readFileSync(blockFile, 'utf8').split('\n'), ...EXTRA_BLOCKED].map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]+$/.test(w)))

  const xml = zlib.gunzipSync(fs.readFileSync(xmlFile)).toString('utf8')

  // Synsets: definition, examples, members, topic.
  const synsets = new Map()
  for (const m of xml.matchAll(/<Synset ([^>]*)>([\s\S]*?)<\/Synset>/g)) {
    const head = m[1]
    const body = m[2]
    const def = body.match(/<Definition>([\s\S]*?)<\/Definition>/)
    synsets.set(attr(head, 'id'), {
      members: (attr(head, 'members') || '').split(' ').filter(Boolean),
      lexfile: attr(head, 'lexfile'),
      def: def ? unescape(def[1]).trim() : '',
      ex: [...body.matchAll(/<Example[^>]*>([\s\S]*?)<\/Example>/g)].map((e) => unescape(e[1]).trim()).slice(0, 3),
      markers: [...body.matchAll(/relType="exemplifies" target="([^"]+)"/g)].map((r) => r[1])
    })
  }

  // Lexical entries: one per (written form, part of speech).
  const entries = new Map() // entry id -> written form
  const words = new Map() // written form -> { ipa:Set, senses:[], drop }
  for (const m of xml.matchAll(/<LexicalEntry id="([^"]+)">([\s\S]*?)<\/LexicalEntry>/g)) {
    const body = m[2]
    const lemma = body.match(/<Lemma ([^>]*?)\/?>/)
    const form = attr(lemma[1], 'writtenForm')
    entries.set(m[1], form)
    if (!/^[a-z]{2,}$/.test(form)) continue
    const pos = POS[attr(lemma[1], 'partOfSpeech')]
    const w = words.get(form) || { ipa: new Set(), senses: [], drop: false }
    words.set(form, w)
    for (const p of body.matchAll(/<Pronunciation([^>]*)>([^<]+)<\/Pronunciation>/g)) {
      const variety = attr(p[1], 'variety')
      if (!variety || variety === 'US') w.ipa.add(p[2].trim())
    }
    if (!w.ipa.size) for (const p of body.matchAll(/<Pronunciation[^>]*>([^<]+)<\/Pronunciation>/g)) w.ipa.add(p[1].trim())
    for (const s of body.matchAll(/<Sense ([^>]*?)(\/>|>([\s\S]*?)<\/Sense>)/g)) {
      const markers = [...(s[3] || '').matchAll(/relType="exemplifies" target="([^"]+)"/g)].map((r) => r[1])
      w.senses.push({ pos, synset: attr(s[1], 'synset'), markers })
    }
  }

  const stats = { droppedWords: 0, droppedSenses: 0 }
  const out = []
  for (const [form, w] of words) {
    if (!ALLOWED.has(form) && (blocked.has(form) || (form.endsWith('s') && blocked.has(form.slice(0, -1))))) { stats.droppedWords++; continue }
    const senses = []
    let drop = false
    for (const s of w.senses) {
      const syn = synsets.get(s.synset)
      if (!syn) continue
      const markers = [...s.markers, ...syn.markers]
      const slur = markers.some((x) => DROP_WORD_MARKERS.has(x)) || DROP_WORD_DEFINITION.test(syn.def)
      if (slur && !ALLOWED.has(form)) { drop = true; break }
      if (slur || markers.some((x) => DROP_SENSE_MARKERS.has(x)) || DROP_SENSE_DEFINITION.test(syn.def)) { stats.droppedSenses++; continue }
      senses.push({ pos: s.pos, syn })
    }
    if (drop || !senses.length) { stats.droppedWords++; continue }
    out.push({ form, ipa: [...w.ipa].slice(0, 2), senses })
  }

  const playable = new Set(out.map((o) => o.form))
  const lexfiles = []
  const lexIndex = (name) => { let i = lexfiles.indexOf(name); if (i < 0) { i = lexfiles.length; lexfiles.push(name) } return i }

  // Compact format: every word is
  //   [word, [ipa...], [[pos, topic, definition, [examples], [synonyms]], ...]]
  const list = out.sort((a, b) => a.form.localeCompare(b.form)).map(({ form, ipa, senses }) => [
    form,
    ipa,
    senses.map(({ pos, syn }) => [
      pos,
      lexIndex(syn.lexfile),
      syn.def,
      syn.ex,
      [...new Set(syn.members.map((id) => entries.get(id)).filter((m) => m && m !== form && playable.has(m)))]
    ])
  ])

  const data = { source: 'Open English WordNet 2025 (CC BY 4.0), https://en-word.net', built: new Date().toISOString().slice(0, 10), topics: lexfiles, words: list }
  fs.mkdirSync(path.join(root, 'data'), { recursive: true })
  const gz = zlib.gzipSync(JSON.stringify(data), { level: 9 })
  fs.writeFileSync(path.join(root, 'data', 'words.json.gz'), gz)
  const withIpa = list.filter((w) => w[1].length).length
  console.log(`${list.length} words (${withIpa} with pronunciations), ${stats.droppedWords} words and ${stats.droppedSenses} senses left out, ${(gz.length / 1048576).toFixed(1)} MB`)
}

main().catch((err) => { console.error(err); process.exit(1) })
