import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync } from 'node:fs'
import { createAssetBatch } from './createAssetBatch.js'
import { sceneAssetUrls } from './sceneAssetManifest.js'

test('fixed total, parallel requests, and cached results survive out-of-order completion', async () => {
   const requests = new Map()
   const batch = createAssetBatch(
      ['tree', 'avatar', 'tree'],
      (url) => new Promise((resolve) => requests.set(url, resolve))
   )
   assert.equal(batch.getState().total, 2)
   const pending = batch.start()
   assert.equal(batch.start(), pending)
   assert.equal(requests.size, 2)
   assert.throws(
      () => batch.read('tree'),
      (thrown) => thrown === pending
   )
   requests.get('avatar')({ name: 'avatar' })
   await Promise.resolve()
   assert.equal(batch.getState().progress, 50)
   assert.equal(batch.getState().total, 2)
   assert.equal(batch.getState().active, true)
   requests.get('tree')({ name: 'tree' })
   await pending
   assert.equal(batch.getState().progress, 100)
   assert.equal(batch.getState().active, false)
   assert.equal(batch.read('tree'), batch.read('tree'))
})

test('failed models never count as successful or produce 100 percent', async () => {
   const batch = createAssetBatch(['tree', 'avatar'], async (url) => {
      if (url === 'tree') throw new Error('Texture failed')
      return { name: url }
   })
   await batch.start()
   assert.equal(batch.getState().progress, 50)
   assert.equal(batch.getState().total, 2)
   assert.equal(batch.getState().loaded, 1)
   assert.deepEqual(batch.getState().errors, ['tree'])
   assert.throws(() => batch.read('tree'), /Unable to load/)
   assert.throws(() => batch.read('unknown'), /Unregistered/)
})

test('every registered scene model exists and is counted only once', () => {
   assert.equal(new Set(sceneAssetUrls).size, sceneAssetUrls.length)
   for (const url of sceneAssetUrls) {
      assert.ok(existsSync(new URL(`../../public/${url.replace('../', '')}`, import.meta.url)), url)
   }
})
