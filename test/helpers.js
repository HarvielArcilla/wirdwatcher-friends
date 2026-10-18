import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import DHT from 'hyperdht'
import createTestnet from 'hyperdht/testnet.js'
import { WirdApp } from '../src/core/app.js'

export const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ww-test-'))

export async function until (fn, { timeout = 20000, every = 50 } = {}) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await new Promise((resolve) => setTimeout(resolve, every))
  }
  throw new Error('timed out waiting')
}

// A local DHT, and apps that use it (internet only, unless lan is given).
export async function network (t, n = 3) {
  const testnet = await createTestnet(n)
  const apps = []
  const make = async (opts = {}) => {
    const app = new WirdApp({
      dataDir: opts.dataDir || tmp(),
      swarm: () => ({ dht: new DHT({ bootstrap: testnet.bootstrap, host: '127.0.0.1' }) }),
      lan: opts.lan || {},
      settings: { lan: Boolean(opts.lan), ...(opts.settings || {}) },
      now: opts.now
    })
    await app.start()
    apps.push(app)
    return app
  }
  t.after(async () => {
    for (const a of apps) await a.stop().catch(() => {})
    await testnet.destroy()
  })
  return { make, testnet }
}
