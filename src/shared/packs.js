// Card packs, in the casino: three cards of cosmetics each. Looks only, like
// everything coins buy: nothing in a pack changes a score, a rating, a duel
// or what anything pays.
//
// What a card is worth decides how likely it is, measured against what the
// pack costs. Anything worth up to half the pack is equally likely; past
// that, the chance falls with the value to the power 1.5. So the most
// expensive things in the shop are vanishingly rare in a cheap pack, and
// come within reach as your packs (which cost about fifteen minutes of the
// wirdhouse) get dearer.
//
//   Cards 1 and 2  anything, by those weights
//   Card 3         a bonus: only cards worth at least a quarter of the pack
//   Pity           after PITY packs with nothing worth the pack, the next
//                  one's third card is worth at least the whole pack
//
// A card you already have turns into scraps worth a quarter of its value,
// and crafting a card costs its full value in scraps, so duplicates are
// never wasted, and never a shortcut to the expensive things. The odds,
// worked out from these exact rules, are on the page.

import { COSMETICS } from './cosmetics.js'

export const RARITIES = ['common', 'rare', 'epic', 'legendary']
export const FLAT = 0.5 // up to this fraction of the pack price, every card is equally likely
export const STEEP = 1.5 // past it, the chance falls as (value)^-STEEP
export const BONUS_MIN = 0.25 // the third card is worth at least this much of the pack
export const PITY = 10
export const SCRAP_RATE = 0.25 // a duplicate gives this share of its value in scraps
// Pack-only cards have no shop price; this is what they're worth.
export const PACK_ONLY_VALUE = { common: 5e3, rare: 2e5, epic: 2e7, legendary: 2e10 }

// What can come out: anything the shop sells, plus the pack-only cards.
// Not level, badge or edition rewards: those stay earned.
let pool = null
export function packPool () {
  if (!pool) pool = COSMETICS.filter((c) => !c.free && RARITIES.includes(c.rarity) && (c.pack || (typeof c.price === 'number' && c.price > 0)))
  return pool
}
export const cardValue = (c) => (typeof c.price === 'number' && c.price > 0 ? c.price : PACK_ONLY_VALUE[c.rarity] || 0)
export const scrapFor = (c) => Math.max(1, Math.round(cardValue(c) * SCRAP_RATE))
export const craftCost = (c) => Math.round(cardValue(c))

// About fifteen minutes of the wirdhouse's base income, at least 10,000.
export const packPrice = (cps) => Math.max(10000, Math.round(cps * 900))

export function cardWeight (c, price) {
  const x = cardValue(c) / price
  return x <= FLAT ? 1 : (FLAT / x) ** STEEP
}

// The cards a slot can hold, with their weights.
function slot (price, min = 0) {
  const list = packPool().filter((c) => cardValue(c) >= min * price)
  return list.length ? list : packPool()
}

function pick (rand, list, price) {
  let total = 0
  for (const c of list) total += cardWeight(c, price)
  let r = rand() * total
  for (const c of list) { r -= cardWeight(c, price); if (r <= 0) return c }
  return list[list.length - 1]
}

// rand(): uniform in [0, 1). dry: packs in a row with nothing worth the pack.
export function drawPack (rand, price, dry = 0) {
  const pity = dry + 1 >= PITY
  const cards = [pick(rand, slot(price), price), pick(rand, slot(price), price), pick(rand, slot(price, pity ? 1 : BONUS_MIN), price)]
  const hit = cards.some((c) => cardValue(c) >= price)
  return { cards, dry: hit ? 0 : dry + 1, pity }
}

// The odds at a price, for the page: each rarity's chance in each slot, the
// chance of a card worth the pack or more, and each card's own chance.
export function packOdds (price) {
  const share = (list) => {
    const total = list.reduce((a, c) => a + cardWeight(c, price), 0)
    const by = Object.fromEntries(RARITIES.map((r) => [r, 0]))
    for (const c of list) by[c.rarity] += cardWeight(c, price) / total
    return { by, total }
  }
  const main = share(slot(price))
  const bonus = share(slot(price, BONUS_MIN))
  const worth = (list, total) => list.filter((c) => cardValue(c) >= price).reduce((a, c) => a + cardWeight(c, price), 0) / total
  const pMain = worth(slot(price), main.total)
  const pBonus = worth(slot(price, BONUS_MIN), bonus.total)
  return {
    price,
    main: main.by,
    bonus: bonus.by,
    worthPack: 1 - (1 - pMain) ** 2 * (1 - pBonus), // a pack with a card worth what it cost
    // One card's chance of turning up somewhere in a pack (no pity).
    cardChance: (c) => {
      const a = cardValue(c) >= 0 ? cardWeight(c, price) / main.total : 0
      const b = cardValue(c) >= BONUS_MIN * price ? cardWeight(c, price) / bonus.total : 0
      return 1 - (1 - a) ** 2 * (1 - b)
    }
  }
}
