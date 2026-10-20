import test from 'node:test'
import assert from 'node:assert/strict'
import { newer, shaFor } from '../src/shared/versions.js'

test('versions compare like releases do', () => {
  assert.ok(newer('2.4.0', '2.3.0'))
  assert.ok(newer('v2.3.10', '2.3.9'))
  assert.ok(newer('3.0.0', '2.99.99'))
  assert.ok(!newer('2.3.0', '2.3.0'))
  assert.ok(!newer('2.2.9', '2.3.0'))
  assert.ok(!newer('2.4.0-beta.1', '2.4.0'), 'a pre-release is older than its release')
  assert.ok(newer('2.4.0', '2.4.0-beta.1'))
})

test('reading the checksum for a file in latest-mac.yml', () => {
  const yml = `version: 2.4.0
files:
  - url: wirdwatcher-2.4.0-arm64.zip
    sha512: AAAarm==
    size: 100
  - url: wirdwatcher-2.4.0-x64.zip
    sha512: BBBx64==
    size: 101
path: wirdwatcher-2.4.0-arm64.zip
sha512: AAAarm==
releaseDate: '2026-10-21T00:00:00.000Z'
`
  assert.equal(shaFor(yml, 'wirdwatcher-2.4.0-x64.zip'), 'BBBx64==')
  assert.equal(shaFor(yml, 'wirdwatcher-2.4.0-arm64.zip'), 'AAAarm==')
  assert.equal(shaFor(yml, 'nope.zip'), null)
})
