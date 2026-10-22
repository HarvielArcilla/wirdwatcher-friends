// Wird Slots: five reels of letters, weighted like English. Spell a word and
// it pays: the longest real word anywhere in the five, read left to right.
// A full five-letter word is the jackpot.
//
// The paytable is set so the machine pays back about 95% of what goes in
// (test/casino.test.js works it out exactly over every possible spin), so
// it slowly wins, like a real one. Winnings never count toward ink.

// How often each letter turns up on a reel, out of 10,000.
export const LETTER_WEIGHTS = { e: 1200, t: 910, a: 820, o: 750, i: 700, n: 670, s: 630, h: 610, r: 600, d: 430, l: 400, c: 280, u: 280, m: 240, w: 240, f: 220, g: 200, y: 200, p: 190, b: 150, v: 100, k: 80, j: 15, x: 15, q: 10, z: 7 }
export const LETTERS = Object.keys(LETTER_WEIGHTS)
export const WEIGHT_TOTAL = LETTERS.reduce((a, k) => a + LETTER_WEIGHTS[k], 0)
export const PAYS = { 3: 1.2, 4: 5, 5: 100 } // with everyday forms counted (cats, ran), this pays back about 95%

// The letter for a number from 0 to WEIGHT_TOTAL - 1.
export function letterAt (n) {
  for (const k of LETTERS) { n -= LETTER_WEIGHTS[k]; if (n < 0) return k }
  return 'e'
}

// What five letters pay: the longest word in them (the leftmost of ties).
export function evaluate (reels, isWord) {
  const s = reels.join('')
  if (isWord(s)) return { len: 5, word: s, at: 0, mult: PAYS[5] }
  for (const len of [4, 3]) {
    for (let at = 0; at + len <= 5; at++) {
      const w = s.slice(at, at + len)
      if (isWord(w)) return { len, word: w, at, mult: PAYS[len] }
    }
  }
  return { len: 0, word: null, at: -1, mult: 0 }
}

// The words the machine knows: plain letters, three to five of them.
export const slotWord = (w) => /^[a-z]{3,5}$/.test(w)

// The word list has base forms only ("cat", "run"), so the machine also
// knows their everyday forms: plurals and -s ("cats", "boxes", "flies"),
// past tenses ("baked", "tried"), and the common irregular ones ("ran",
// "went", "mice"). has(w): is w in the word list.
const IRREGULAR = { ran: 'run', went: 'go', gone: 'go', seen: 'see', saw: 'see', ate: 'eat', eaten: 'eat', men: 'man', women: 'woman', feet: 'foot', mice: 'mouse', teeth: 'tooth', geese: 'goose', did: 'do', done: 'do', does: 'do', made: 'make', said: 'say', took: 'take', came: 'come', gave: 'give', given: 'give', knew: 'know', known: 'know', grew: 'grow', drew: 'draw', threw: 'throw', flew: 'fly', wrote: 'write', rode: 'ride', spoke: 'speak', woke: 'wake', broke: 'break', froze: 'freeze', chose: 'choose', sang: 'sing', sung: 'sing', rang: 'ring', swam: 'swim', drank: 'drink', sank: 'sink', began: 'begin', stole: 'steal', wore: 'wear', tore: 'tear', bore: 'bear', swore: 'swear', hid: 'hide', bit: 'bite', slid: 'slide', fled: 'flee', fell: 'fall', held: 'hold', told: 'tell', sold: 'sell', felt: 'feel', kept: 'keep', slept: 'sleep', wept: 'weep', left: 'leave', lent: 'lend', sent: 'send', spent: 'spend', built: 'build', meant: 'mean', dealt: 'deal', found: 'find', bound: 'bind', wound: 'wind', ground: 'grind', fought: 'fight', bought: 'buy', paid: 'pay', laid: 'lay', had: 'have', has: 'have', was: 'be', were: 'be', been: 'be', is: 'be', are: 'be', got: 'get', lost: 'lose', shot: 'shoot', stood: 'stand', sat: 'sit', led: 'lead', fed: 'feed', bled: 'bleed', met: 'meet', won: 'win', spun: 'spin', dug: 'dig', hung: 'hang', stuck: 'stick', struck: 'strike', shook: 'shake', drove: 'drive', dove: 'dive', lay: 'lie', oxen: 'ox', lice: 'louse', dice: 'die' }
export function withForms (has) {
  const base = (b) => b.length >= 3 && has(b)
  return (w) => {
    if (!slotWord(w)) return false
    if (has(w)) return true
    if (IRREGULAR[w] && has(IRREGULAR[w])) return true
    if (w.endsWith('ies') && base(`${w.slice(0, -3)}y`)) return true
    if (w.endsWith('es') && /(s|x|z|ch|sh|o)$/.test(w.slice(0, -2)) && base(w.slice(0, -2))) return true
    if (w.endsWith('s') && !w.endsWith('ss') && base(w.slice(0, -1))) return true
    if (w.endsWith('ied') && base(`${w.slice(0, -3)}y`)) return true
    if (w.endsWith('ed') && (base(w.slice(0, -2)) || base(w.slice(0, -1)))) return true
    return false
  }
}
