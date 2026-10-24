// Builds Catchword's map (src/renderer/catchword/map.json) from Natural
// Earth's world, via world-atlas (ISC). Each country becomes an SVG path in
// its region's group; each region gets a centre (for flights) and dots
// scattered over its land, more for more people (they fill in as a word
// spreads). Run it after changing src/shared/catchword/regions.js.

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { geoNaturalEarth1, geoPath, geoContains, geoBounds, geoCentroid } from 'd3-geo'
import { feature } from 'topojson-client'
import { REGIONS } from '../src/shared/catchword/regions.js'

const require = createRequire(import.meta.url)
const world = require('world-atlas/countries-110m.json')
const W = 1000
const H = 500
const countries = feature(world, world.objects.countries).features
const projection = geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: 'FeatureCollection', features: countries.filter((f) => f.properties.name !== 'Antarctica') })
const path = geoPath(projection).digits(1)

const byName = new Map(countries.map((f) => [f.properties.name, f]))
const used = new Set()
let seed = 12345
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

const regions = {}
for (const r of REGIONS) {
  const feats = r.countries.map((n) => { const f = byName.get(n); if (!f) throw new Error(`No country called ${n}`); used.add(n); return f })
  const [cx, cy] = projection(geoCentroid(feats.sort((a, b) => geoArea(b) - geoArea(a))[0]))
  // Dots: more for more people, scattered over the land.
  const want = Math.round(Math.max(14, Math.min(130, 10 + Math.sqrt(r.pop) * 2.6)))
  const dots = []
  let tries = 0
  const big = feats.slice().sort((a, b) => geoArea(b) - geoArea(a))
  while (dots.length < want && tries < 40000) {
    tries++
    const f = big[Math.floor(Math.pow(rand(), 1.6) * big.length)]
    const [[x0, y0], [x1, y1]] = geoBounds(f)
    const lon = x0 + rand() * ((x1 < x0 ? x1 + 360 : x1) - x0)
    const lat = y0 + rand() * (y1 - y0)
    const pt = [lon > 180 ? lon - 360 : lon, lat]
    if (!geoContains(f, pt)) continue
    const [px, py] = projection(pt)
    dots.push([Math.round(px * 10) / 10, Math.round(py * 10) / 10])
  }
  regions[r.id] = { paths: feats.map((f) => path(f)), c: [Math.round(cx), Math.round(cy)], dots }
}
function geoArea (f) { const [[x0, y0], [x1, y1]] = geoBounds(f); return Math.abs((x1 - x0) * (y1 - y0)) }

// Countries not in any region (Antarctica and the like), drawn as plain land.
const other = countries.filter((f) => !used.has(f.properties.name) && f.properties.name !== 'Antarctica').map((f) => path(f))
const out = { w: W, h: H, regions, other }
fs.mkdirSync('src/renderer/catchword', { recursive: true })
fs.writeFileSync('src/renderer/catchword/map.json', JSON.stringify(out))
console.log('map.json', (JSON.stringify(out).length / 1024).toFixed(0), 'KB;', 'unassigned:', countries.filter((f) => !used.has(f.properties.name)).map((f) => f.properties.name).join(', '))
