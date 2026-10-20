// Card packs, in the casino: three cards of cosmetics each. Looks only, like
// everything coins buy: nothing in a pack changes a score, a rating, a duel
// or what anything pays.
//
// The odds are shown in the casino. The first two cards follow PACK_ODDS;
// the third is always rare or better (LAST_CARD_ODDS). If PITY packs in a
// row bring no epic or legendary, the next one's third card is epic or
// better. A card you already have turns into scraps, and scraps craft any
// card of your choosing, so a duplicate is never wasted.

import { COSMETICS } from './cosmetics.js'

export const PACK_ODDS = { common: 0.62, rare: 0.28, epic: 0.085, legendary: 0.015 }
export const LAST_CARD_ODDS = { rare: 0.75, epic: 0.2, legendary: 0.05 }
export const PITY = 10
export const SCRAP_FOR = { common: 1, rare: 4, epic: 15, legendary: 60 }
export const CRAFT_COST = { common: 10, rare: 30, epic: 100, legendary: 400 }
export const RARITIES = ['common', 'rare', 'epic', 'legendary']

// What can come out: anything the shop sells, plus the pack-only cards.
// Not level, badge or edition rewards: those stay earned.
let pool = null
export function packPool () {
  if (!pool) pool = COSMETICS.filter((c) => !c.free && RARITIES.includes(c.rarity) && (c.pack || (typeof c.price === 'number' && c.price > 0)))
  return pool
}

// About fifteen minutes of the wirdhouse's base income, at least 10,000.
export const packPrice = (cps) => Math.max(10000, Math.round(cps * 900))

function pickRarity (r, odds) {
  let acc = 0
  for (const [k, p] of Object.entries(odds)) { acc += p; if (r < acc) return k }
  return Object.keys(odds).pop()
}

// rand(): uniform in [0, 1). Returns the three cards and the new pity count.
export function drawPack (rand, sinceEpic = 0) {
  const cards = []
  for (let i = 0; i < 3; i++) {
    let odds = i < 2 ? PACK_ODDS : LAST_CARD_ODDS
    if (i === 2 && sinceEpic + 1 >= PITY && !cards.some((c) => c.rarity === 'epic' || c.rarity === 'legendary')) odds = { epic: 0.8, legendary: 0.2 }
    const rarity = pickRarity(rand(), odds)
    const choices = packPool().filter((c) => c.rarity === rarity)
    cards.push(choices[Math.floor(rand() * choices.length)])
  }
  const big = cards.some((c) => c.rarity === 'epic' || c.rarity === 'legendary')
  return { cards, sinceEpic: big ? 0 : sinceEpic + 1 }
}

// Chance a pack holds at least one epic or legendary, before pity.
export function epicChance () {
  const e = PACK_ODDS.epic + PACK_ODDS.legendary
  const last = LAST_CARD_ODDS.epic + LAST_CARD_ODDS.legendary
  return 1 - (1 - e) ** 2 * (1 - last)
}
