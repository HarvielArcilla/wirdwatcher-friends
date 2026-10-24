// Builds Catchword's map (src/renderer/catchword/map.json) from Natural
// Earth's world, via world-atlas (ISC). Each country becomes an SVG path in
// its region's group; each region gets a centre (for flights) and dots
// scattered over its land, more for more people (they fill in as a word
// spreads). Ships get real sea lanes: the ocean is laid out as a grid, and
// the cheapest route by water between every pair of ports is kept (the map
// wraps round the Pacific, and Suez and Panama are open). Run it after
// changing src/shared/catchword/regions.js.

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { geoNaturalEarth1, geoPath, geoContains, geoBounds, geoCentroid, geoGraticule10 } from 'd3-geo'
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

// --- sea lanes ------------------------------------------------------------------------------
// Each region's port: the bit of its own coast nearest a real harbour.
const HARBOURS = {
  usa: [-74, 40.5], canada: [-63.5, 44.6], mexico: [-96.1, 19.2], caribbean: [-79.9, 9.4], andes: [-77.1, -12], brazil: [-43.2, -22.9], cone: [-58.4, -34.6],
  uk: [1.2, 51.4], france: [5.4, 43.3], iberia: [-9.1, 38.7], germany: [4.4, 51.9], nordic: [18, 59.3], italy: [14.2, 40.8], eastern: [30.7, 46.5], russia: [30.3, 59.9],
  turkey: [29, 41], mideast: [55.3, 25.3], persia: [56.3, 27.2], egypt: [32.3, 31.3], maghreb: [-7.6, 33.6], sahel: [-17.4, 14.7], westafrica: [3.4, 6.4], eastafrica: [39.7, -4],
  centralafrica: [13.2, -8.8], southafrica: [18.4, -33.9], southasia: [72.8, 18.9], china: [121.5, 31.2], korea: [129, 35.1], japan: [139.7, 35.4], seasia: [103.8, 1.3], islands: [106.8, -6.1], oceania: [151.2, -33.8]
}
const CELL = 3
const GW = Math.ceil(W / CELL)
const GH = Math.ceil(H / CELL)
const at = (x, y) => y * GW + x
// What's in each cell: -1 off the globe, 0 sea, 1 land, and which region owns it.
const grid = new Int8Array(GW * GH)
const owner = new Array(GW * GH).fill(null)
const boxes = countries.map((f) => ({ f, b: geoBounds(f), region: REGIONS.find((r) => r.countries.includes(f.properties.name))?.id || null }))
for (let gy = 0; gy < GH; gy++) {
  for (let gx = 0; gx < GW; gx++) {
    const px = gx * CELL + CELL / 2; const py = gy * CELL + CELL / 2
    const ll = projection.invert([px, py])
    const back = ll && projection(ll)
    if (!ll || !back || Math.hypot(back[0] - px, back[1] - py) > 0.5 || Math.abs(ll[1]) > 84) { grid[at(gx, gy)] = -1; continue }
    let land = null
    for (const { f, b, region } of boxes) {
      const [[x0, y0], [x1, y1]] = b
      if (ll[1] < y0 - 0.5 || ll[1] > y1 + 0.5) continue
      if (x0 <= x1 && (ll[0] < x0 - 0.5 || ll[0] > x1 + 0.5)) continue
      if (geoContains(f, ll)) { land = region || 'other'; break }
    }
    grid[at(gx, gy)] = land ? 1 : 0
    owner[at(gx, gy)] = land
  }
}
// Canals and straits that a grid this coarse closes up.
const carve = (lon0, lat0, lon1, lat1) => {
  const [x0, y0] = projection([lon0, lat0]); const [x1, y1] = projection([lon1, lat1])
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (CELL / 2))
  for (let i = 0; i <= n; i++) { const gx = Math.floor((x0 + (x1 - x0) * i / n) / CELL); const gy = Math.floor((y0 + (y1 - y0) * i / n) / CELL); if (grid[at(gx, gy)] === 1) grid[at(gx, gy)] = 0 }
}
carve(32.3, 31.4, 32.6, 29.8) // Suez
carve(32.6, 29.8, 34, 27.5) // the Gulf of Suez
carve(-79.9, 9.4, -79.5, 8.9) // Panama
carve(-5.7, 35.95, -5.3, 36) // Gibraltar
carve(28.9, 41, 29.15, 41.25) // the Bosphorus
carve(26.2, 40, 26.7, 40.4) // the Dardanelles
carve(100.5, 3.5, 103.8, 1.3) // Malacca
carve(10.5, 57.7, 12.5, 56) // Kattegat
carve(1.3, 51.1, 1.8, 50.9) // Dover
carve(56.3, 26.5, 56.7, 26) // Hormuz
carve(43.3, 12.6, 43.5, 12.4) // Bab-el-Mandeb
// The open ocean: every sea cell reachable from the middle of the Atlantic
// (so no port lands in the Caspian or a lake the grid has sealed off).
const ocean = new Uint8Array(GW * GH)
{
  const [ox, oy] = projection([-35, 20])
  const q = [at(Math.floor(ox / CELL), Math.floor(oy / CELL))]
  ocean[q[0]] = 1
  while (q.length) {
    const i = q.pop(); const gx = i % GW; const gy = (i - gx) / GW
    const nb = [[gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1], [gx + 1, gy + 1], [gx - 1, gy - 1], [gx + 1, gy - 1], [gx - 1, gy + 1]]
    const [lo, hi] = rowEnds0(gy)
    if (gx === lo) nb.push([hi, gy]); if (gx === hi) nb.push([lo, gy])
    for (const [nx, ny] of nb) { if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue; const j = at(nx, ny); if (grid[j] === 0 && !ocean[j]) { ocean[j] = 1; q.push(j) } }
  }
}
function rowEnds0 (gy) { let lo = -1; let hi = -1; for (let gx = 0; gx < GW; gx++) if (grid[at(gx, gy)] !== -1) { if (lo < 0) lo = gx; hi = gx } return [lo, hi] }
// Where each port sits: the open-sea cell next to its own coast nearest the harbour.
const ports = {}
for (const r of REGIONS.filter((x) => x.port)) {
  const [hx, hy] = projection(HARBOURS[r.id] || geoCentroid({ type: 'FeatureCollection', features: boxes.filter((b) => b.region === r.id).map((b) => b.f) }))
  let best = null
  for (let gy = 1; gy < GH - 1; gy++) {
    for (let gx = 1; gx < GW - 1; gx++) {
      if (!ocean[at(gx, gy)]) continue
      let coast = false
      for (let dy = -2; dy <= 2 && !coast; dy++) for (let dx = -2; dx <= 2; dx++) if (owner[at(gx + dx, gy + dy)] === r.id) { coast = true; break }
      if (!coast) continue
      const d = Math.hypot(gx * CELL - hx, gy * CELL - hy)
      if (!best || d < best.d) best = { gx, gy, d }
    }
  }
  if (best) ports[r.id] = best
}
// Cheapest routes by water (a little dearer hugging a coast), wrapping east-west.
const rowEnds = []
for (let gy = 0; gy < GH; gy++) {
  let lo = -1; let hi = -1
  for (let gx = 0; gx < GW; gx++) if (grid[at(gx, gy)] !== -1) { if (lo < 0) lo = gx; hi = gx }
  rowEnds.push([lo, hi])
}
const nearLand = new Uint8Array(GW * GH)
for (let gy = 1; gy < GH - 1; gy++) for (let gx = 1; gx < GW - 1; gx++) if (grid[at(gx, gy)] === 0) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (grid[at(gx + dx, gy + dy)] === 1) nearLand[at(gx, gy)] = 1
function routes (from) {
  const dist = new Float64Array(GW * GH).fill(Infinity)
  const prev = new Int32Array(GW * GH).fill(-1)
  const s = at(from.gx, from.gy)
  dist[s] = 0
  // A simple binary heap.
  const heap = [[0, s]]
  const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p } }
  const popMin = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1; const r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m } } return top }
  while (heap.length) {
    const [d, i] = popMin()
    if (d > dist[i]) continue
    const gx = i % GW; const gy = (i - gx) / GW
    const step = (nx, ny, cost) => {
      if (ny < 0 || ny >= GH || nx < 0 || nx >= GW) return
      const j = at(nx, ny)
      if (grid[j] !== 0) return
      const nd = d + cost * (nearLand[j] ? 1.6 : 1)
      if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(nd, j) }
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) step(gx + dx, gy + dy, dx && dy ? 1.414 : 1)
    // Off one edge of the map and back on the other.
    const [lo, hi] = rowEnds[gy]
    if (gx === lo) step(hi, gy, 1)
    if (gx === hi) step(lo, gy, 1)
  }
  return { dist, prev }
}
// String-pulling: from each point, head straight for the farthest later
// point you can see across open water. Grid routes zigzag at 45°; real
// ships don't.
const wet = (x, y) => { const gx = Math.floor(x / CELL); const gy = Math.floor(y / CELL); return gx >= 0 && gy >= 0 && gx < GW && gy < GH && grid[at(gx, gy)] === 0 }
function clear (a, b) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL / 3))
  for (let i = 1; i < n; i++) if (!wet(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n)) return false
  return true
}
function pull (pts) {
  const out = [pts[0]]
  let i = 0
  while (i < pts.length - 1) {
    let j = pts.length - 1
    while (j > i + 1 && !clear(pts[i], pts[j])) j--
    out.push(pts[j])
    i = j
  }
  return out
}
// Douglas–Peucker, so a lane is a handful of points.
function simplify (pts, eps) {
  if (pts.length < 3) return pts
  let idx = -1; let far = 0
  const [ax, ay] = pts[0]; const [bx, by] = pts[pts.length - 1]
  const L = Math.hypot(bx - ax, by - ay) || 1
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / L; if (d > far) { far = d; idx = i } }
  if (far <= eps) return [pts[0], pts[pts.length - 1]]
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)]
}
const sea = {}
const ids = Object.keys(ports)
for (const a of ids) {
  const { prev, dist } = routes(ports[a])
  for (const b of ids) {
    if (a >= b) continue
    let j = at(ports[b].gx, ports[b].gy)
    if (!Number.isFinite(dist[j])) { console.warn('no sea route', a, b); continue }
    const cells = []
    while (j >= 0) { cells.push(j); j = prev[j] }
    cells.reverse()
    // Split where the route wraps off the edge of the map.
    const legs = [[]]
    let last = null
    for (const c of cells) {
      const gx = c % GW; const gy = (c - gx) / GW
      if (last && Math.abs(gx - last) > GW / 2) legs.push([])
      legs[legs.length - 1].push([gx * CELL + CELL / 2, gy * CELL + CELL / 2])
      last = gx
    }
    sea[`${a}|${b}`] = legs.map((leg) => simplify(pull(leg), 0.8).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]))
  }
}
const portAt = Object.fromEntries(ids.map((id) => [id, [ports[id].gx * CELL + CELL / 2, ports[id].gy * CELL + CELL / 2]]))
const sphere = path({ type: 'Sphere' })
const graticule = path(geoGraticule10())

const out = { w: W, h: H, regions, other, sphere, graticule, ports: portAt, sea }
fs.mkdirSync('src/renderer/catchword', { recursive: true })
fs.writeFileSync('src/renderer/catchword/map.json', JSON.stringify(out))
console.log('map.json', (JSON.stringify(out).length / 1024).toFixed(0), 'KB;', 'unassigned:', countries.filter((f) => !used.has(f.properties.name)).map((f) => f.properties.name).join(', '))
