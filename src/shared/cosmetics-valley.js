// Looks that only Wird Valley gives: never in the shop or in card packs.
// Each is earned by something done in the valley (`valley` names the goal,
// checked in src/core/valley.js). They use the same data-described styles
// as the bigger wardrobe (src/renderer/lookStyles.js).

const v = (kind, id, name, goal, desc, extra = {}) => ({ kind, id, name, price: null, rarity: 'valley', valley: goal, desc, ...extra })

export const VALLEY_GOALS = {
  harvest: { text: 'Pick 25 crops in Wird Valley', n: 25 },
  butterflies: { text: 'Catch 15 butterflies', n: 15 },
  woods: { text: 'Find 30 things in the woods', n: 30 },
  fish: { text: 'Catch 20 fish', n: 20 },
  kinds: { text: 'Catch 8 different kinds of fish', n: 8 },
  lexifish: { text: 'Catch the Great Lexifish', n: 1 },
  stars: { text: 'Trace 5 constellations', n: 5 },
  stars25: { text: 'Trace 25 constellations', n: 25 },
  outings: { text: 'Go on 20 outings with the gods', n: 20 },
  bestie: { text: 'Reach 8 hearts with a god', n: 8 },
  everyone: { text: 'Reach 4 hearts with every god', n: 4 },
  dating: { text: 'Start dating a god', n: 1 },
  married: { text: 'Marry a god', n: 1 }
}

export const VALLEY_COSMETICS = [
  v('title', 'v-greenthumb', 'Green thumb', 'harvest', 'Earned in Wird Valley.', { text: 'Green thumb' }),
  v('confetti', 'v-butterflies', 'Butterfly garden', 'butterflies', 'Earned in Wird Valley. Wings and petals.', { emoji: ['🦋', '🌼', '🍃'] }),
  v('frame', 'v-wildflowers', 'Wildflowers', 'woods', 'Earned in Wird Valley. A ring of meadow flowers.', { ring: ['#e870a0', '#f0d040', '#a080e8', '#f4f0f0', '#7ac85a', '#e870a0'] }),
  v('title', 'v-angler', 'Wird angler', 'fish', 'Earned in Wird Valley.', { text: 'Wird angler' }),
  v('cardBack', 'v-tackle', 'Tackle box', 'kinds', 'Earned in Wird Valley. Lures in a row.', { back: 'repeating-linear-gradient(90deg, #2a5a7a 0 10px, #e8c048 10px 12px, #2a5a7a 12px 22px, #e83a3a 22px 24px)' }),
  v('table', 'v-lakeside', 'Lakeside', 'lexifish', 'Earned in Wird Valley by landing the Great Lexifish. Still water at dawn.', { felt: 'radial-gradient(ellipse at 50% 30%, #7ab8e8, #3a7ab8 55%, #1e4a7a)', rim: '#a8784a', dark: true }),
  v('cardBack', 'v-starmap', 'Star map', 'stars', 'Earned in Wird Valley. The sky over the hill.', { back: 'radial-gradient(circle at 30% 30%, #fff 0 1px, transparent 2px) 0 0 / 14px 14px, radial-gradient(circle at 70% 60%, #fff6c0 0 1px, transparent 2px) 0 0 / 22px 22px, linear-gradient(160deg, #0b1030, #2a2a68)' }),
  v('name', 'v-starlit', 'Starlit', 'stars25', 'Earned in Wird Valley. Your name in starlight.', { grad: ['#fff6c0', '#b8c8ff', '#7a5ad8', '#fff6c0'], move: true }),
  v('title', 'v-outdoorsy', 'Outdoorsy', 'outings', 'Earned in Wird Valley.', { text: 'Outdoorsy' }),
  v('title', 'v-godsfriend', 'Friend of the gods', 'bestie', 'Earned in Wird Valley.', { text: 'Friend of the gods' }),
  v('frame', 'v-pantheon', 'Pantheon', 'everyone', 'Earned in Wird Valley. A ring in every god’s colours.', { ring: ['#f0c850', '#c8502a', '#5a9a4a', '#7a3ab8', '#2a3a6a', '#4ab84a', '#2aa89a', '#262636', '#f0c850'], spin: true }),
  v('title', 'v-headoverheels', 'Head over heels', 'dating', 'Earned in Wird Valley.', { text: 'Head over heels' }),
  v('confetti', 'v-wedding', 'Wedding day', 'married', 'Earned in Wird Valley. Rings, bouquets and doves.', { emoji: ['💍', '💐', '🕊️', '💌'] })
]
