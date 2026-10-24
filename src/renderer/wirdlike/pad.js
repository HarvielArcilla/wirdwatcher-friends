// Controllers (an Xbox pad, or anything the browser maps the same way). In a
// run: left stick moves, right stick or A/B/X/Y shoots (Y up, A down, X left,
// B right), LB or LT sets off a bang, RB or RT uses your verb, View holds the
// map, Menu pauses. In the menus: the D-pad or left stick moves, A picks, B
// goes back.

import { useEffect, useRef, useState } from 'react'

const B = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, menu: 9, up: 12, down: 13, left: 14, right: 15 }
const DEAD = 0.25

export function readPad () {
  const list = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : []
  const gp = list.find((g) => g && g.connected)
  if (!gp) return null
  const btn = (i) => { const x = gp.buttons[i]; return Boolean(x && (x.pressed || x.value > 0.4)) }
  const dz = (v) => (Math.abs(v || 0) > DEAD ? v : 0)
  const s = { gp, lx: dz(gp.axes[0]), ly: dz(gp.axes[1]), rx: dz(gp.axes[2]), ry: dz(gp.axes[3]) }
  for (const [k, i] of Object.entries(B)) s[k] = btn(i)
  // The left stick doubles as a D-pad, for menus.
  s.up = s.up || (gp.axes[1] || 0) < -0.6
  s.down = s.down || (gp.axes[1] || 0) > 0.6
  s.left = s.left || (gp.axes[0] || 0) < -0.6
  s.right = s.right || (gp.axes[0] || 0) > 0.6
  return s
}

// Buttons pressed since the last read (not just held).
export class PadEdges {
  constructor () { this.prev = {} }
  read () {
    const s = readPad()
    const pressed = {}
    if (s) for (const k of Object.keys(B)) if (s[k] && !this.prev[k]) pressed[k] = true
    this.prev = s || {}
    return { s, pressed }
  }
}

// A little shake, where the controller can.
export function rumble (strong = 0.5, weak = 0.3, ms = 150) {
  try { readPad()?.gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }) } catch {}
}

// Menus: calls handlers.a(), handlers.left() and so on when those are
// pressed. Returns whether a controller is connected.
export function usePadMenu (handlers, active = true) {
  const ref = useRef(handlers)
  ref.current = handlers
  const [connected, setConnected] = useState(() => Boolean(readPad()))
  useEffect(() => {
    if (!active) return
    const edges = new PadEdges()
    edges.read()
    let raf = 0
    let was = Boolean(readPad())
    const loop = () => {
      const { s, pressed } = edges.read()
      if (Boolean(s) !== was) { was = Boolean(s); setConnected(was) }
      for (const k of Object.keys(pressed)) ref.current[k]?.()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const on = () => setConnected(Boolean(readPad()))
    window.addEventListener('gamepadconnected', on)
    window.addEventListener('gamepaddisconnected', on)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('gamepadconnected', on); window.removeEventListener('gamepaddisconnected', on) }
  }, [active])
  return connected
}
