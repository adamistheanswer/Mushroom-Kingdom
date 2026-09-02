import { performance } from 'node:perf_hooks'

const serverStartedAt = Date.now()

const traffic = {
   inboundMessages: 0,
   inboundBytes: 0,
   outboundMessages: 0,
   outboundBytes: 0,
   droppedOutbound: 0,
   decodeErrors: 0,
   decodeTicks: 0,
   decodeMsTotal: 0,
   decodeMsMax: 0,
}

const clientUpdates = {
   ticks: 0,
   msTotal: 0,
   msMax: 0,
   lastCount: 0,
   lastRecipients: 0,
   lastEntriesSent: 0,
   lastBytes: 0,
   lastAverageVisiblePlayersPerClient: 0,
   collectMsTotal: 0,
   encodeMsTotal: 0,
   sendMsTotal: 0,
   lastCollectMs: 0,
   lastEncodeMs: 0,
   lastSendMs: 0,
}

// Outbound throughput only means anything as a rate, and the counter behind it is monotonic, so
// each read differences against the previous one rather than keeping a rolling window.
let lastOutboundSampleTime = performance.now()
let lastOutboundSampleBytes = 0

export function recordInboundMessage(byteLength) {
   traffic.inboundMessages += 1
   traffic.inboundBytes += byteLength
}

export function recordOutboundMessage(byteLength) {
   traffic.outboundMessages += 1
   traffic.outboundBytes += byteLength
}

export function recordDroppedOutbound() {
   traffic.droppedOutbound += 1
}

export function recordDecodeError() {
   traffic.decodeErrors += 1
}

export function recordDecodeTiming(elapsedMs) {
   traffic.decodeTicks += 1
   traffic.decodeMsTotal += elapsedMs
   traffic.decodeMsMax = Math.max(traffic.decodeMsMax, elapsedMs)
}

export function startClientUpdateTick() {
   return performance.now()
}

export function recordClientUpdateTick(
   tickStart,
   {
      updateCount = 0,
      recipients = 0,
      entriesSent = 0,
      visibleEntriesSent = entriesSent,
      bytesSent = 0,
      connectedClients = 0,
      collectMs = 0,
      encodeMs = 0,
      sendMs = 0,
   } = {}
) {
   const elapsedMs = performance.now() - tickStart

   clientUpdates.ticks += 1
   clientUpdates.msTotal += elapsedMs
   clientUpdates.msMax = Math.max(clientUpdates.msMax, elapsedMs)
   clientUpdates.lastCount = updateCount
   clientUpdates.lastRecipients = recipients
   clientUpdates.lastEntriesSent = entriesSent
   clientUpdates.lastBytes = bytesSent
   clientUpdates.lastAverageVisiblePlayersPerClient = connectedClients > 0 ? visibleEntriesSent / connectedClients : 0
   clientUpdates.collectMsTotal += collectMs
   clientUpdates.encodeMsTotal += encodeMs
   clientUpdates.sendMsTotal += sendMs
   clientUpdates.lastCollectMs = collectMs
   clientUpdates.lastEncodeMs = encodeMs
   clientUpdates.lastSendMs = sendMs
}

/** Flat by design - the shape is the wire contract with the client's debug overlay. */
export function getWebSocketMetrics() {
   const now = performance.now()
   const secondsSinceLastSample = Math.max(0.001, (now - lastOutboundSampleTime) / 1000)
   const outboundBytesPerSecond = (traffic.outboundBytes - lastOutboundSampleBytes) / secondsSinceLastSample

   lastOutboundSampleTime = now
   lastOutboundSampleBytes = traffic.outboundBytes

   return {
      inboundMessages: traffic.inboundMessages,
      inboundBytes: traffic.inboundBytes,
      outboundMessages: traffic.outboundMessages,
      outboundBytes: traffic.outboundBytes,
      outboundBytesPerSecond,
      droppedOutbound: traffic.droppedOutbound,
      decodeErrors: traffic.decodeErrors,
      decodeMsAvg: traffic.decodeTicks > 0 ? traffic.decodeMsTotal / traffic.decodeTicks : 0,
      decodeMsMax: traffic.decodeMsMax,
      clientUpdateTicks: clientUpdates.ticks,
      clientUpdateMsAvg: clientUpdates.ticks > 0 ? clientUpdates.msTotal / clientUpdates.ticks : 0,
      clientUpdateMsMax: clientUpdates.msMax,
      clientUpdateCollectMsAvg: clientUpdates.ticks > 0 ? clientUpdates.collectMsTotal / clientUpdates.ticks : 0,
      clientUpdateEncodeMsAvg: clientUpdates.ticks > 0 ? clientUpdates.encodeMsTotal / clientUpdates.ticks : 0,
      clientUpdateSendMsAvg: clientUpdates.ticks > 0 ? clientUpdates.sendMsTotal / clientUpdates.ticks : 0,
      lastClientUpdateCollectMs: clientUpdates.lastCollectMs,
      lastClientUpdateEncodeMs: clientUpdates.lastEncodeMs,
      lastClientUpdateSendMs: clientUpdates.lastSendMs,
      lastClientUpdateCount: clientUpdates.lastCount,
      lastClientUpdateRecipients: clientUpdates.lastRecipients,
      lastClientUpdateEntriesSent: clientUpdates.lastEntriesSent,
      lastClientUpdateBytes: clientUpdates.lastBytes,
      lastAverageVisiblePlayersPerClient: clientUpdates.lastAverageVisiblePlayersPerClient,
      uptimeSeconds: Math.round((Date.now() - serverStartedAt) / 1000),
   }
}
