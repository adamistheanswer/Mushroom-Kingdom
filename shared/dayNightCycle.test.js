import test from 'node:test'
import assert from 'node:assert/strict'
import { encode, decode } from '@msgpack/msgpack'
import { CYCLE_DURATION_MS, CYCLE_EPOCH_MS, getDayNightState } from './dayNightCycle.js'
import { routeClientMessage } from '../server/websockets/messageRouter.js'
import { getWorldTime } from '../server/world/dayNightCycle.js'

const at = (elapsed) => getDayNightState(CYCLE_EPOCH_MS + elapsed)

test('day and night each last five minutes, repeating without a midnight discontinuity', () => {
   assert.equal(CYCLE_DURATION_MS, 600000)
   assert.equal(at(150000).daylight, 1)
   assert.equal(at(450000).daylight, 0)
   assert.equal(at(299999).primaryIsSun, true)
   assert.equal(at(300001).primaryIsSun, false)
   assert.deepEqual(at(0), at(600000))
   assert.deepEqual(at(-150000), at(450000))
   for (const time of [0, 300000, 600000]) {
      assert.ok(Math.abs(at(time - 1).daylight - at(time + 1).daylight) < 0.001)
      assert.ok(at(time).directStrength < 1e-12)
      assert.ok(at(time).twilight > 0.999)
   }
})

test('both bodies remain on low normalized arcs and primary light stays above the horizon', () => {
   for (let ms = 0; ms < 600000; ms += 1000) {
      const state = at(ms)
      for (const direction of [state.sunDirection, state.moonDirection]) {
         assert.ok(Math.abs(Math.hypot(...direction) - 1) < 1e-12)
         assert.ok((Math.asin(direction[1]) * 180) / Math.PI <= 25.000001)
         assert.ok(direction[2] < 0)
      }
      assert.ok((state.primaryIsSun ? state.sunDirection : state.moonDirection)[1] >= -1e-12)
   }
})

test('time snapshots use the same fixed epoch and actual server clock', () => {
   const before = Date.now()
   const snapshot = getWorldTime(123)
   assert.ok(snapshot.serverTimeMs >= before && snapshot.serverTimeMs <= Date.now())
   assert.equal(snapshot.epochMs, CYCLE_EPOCH_MS)
   assert.equal(snapshot.cycleDurationMs, 600000)
   assert.equal(snapshot.clientSentAt, 123)
})

test('heartbeat returns server time and echoes only a finite timing sample', () => {
   const messages = []
   const socket = { readyState: 1, bufferedAmount: 0, send: (data) => messages.push(decode(data)) }
   routeClientMessage('clock-test', socket, encode({ type: 'heartbeat', payload: 42 }))
   assert.equal(messages[0].type, 'worldTime')
   assert.equal(messages[0].payload.clientSentAt, 42)
   assert.ok(Math.abs(messages[0].payload.serverTimeMs - Date.now()) < 1000)
   routeClientMessage('clock-test', socket, encode({ type: 'heartbeat', payload: { serverTimeMs: 0 } }))
   assert.ok(messages[1].payload.clientSentAt == null)
   assert.ok(messages[1].payload.serverTimeMs > CYCLE_EPOCH_MS)
})
