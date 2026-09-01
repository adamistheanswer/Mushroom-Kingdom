import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { decode, encode } from '@msgpack/msgpack'
import { usePlayerPositionsStore } from '../State/playerPositionsStore'
import useClientAudioStore from '../State/clientsAudioStore'
import { useChatStore } from '../State/chatStore'
import { getNameplateDebugMetrics } from '../Utils/nameplateDebugMetrics'

export interface NetworkDebugStats {
   incomingMessages: number
   incomingBytes: number
   outgoingMessages: number
   outgoingBytes: number
   droppedOutgoing: number
   decodeErrors: number
   server?: ServerDebugStats
}

export interface SceneDebugStats {
   fps: number
   frameMs: number
   drawCalls: number
   triangles: number
   lines: number
   points: number
   geometries: number
   textures: number
   programs: number
   dpr: number
   width: number
   height: number
}

interface ServerDebugStats {
   connectedClients: number
   inboundMessages: number
   inboundBytes: number
   outboundMessages: number
   outboundBytes: number
   outboundBytesPerSecond: number
   droppedOutbound: number
   decodeErrors: number
   clientUpdateTicks: number
   clientUpdateMsAvg: number
   clientUpdateMsMax: number
   lastClientUpdateCount: number
   lastClientUpdateRecipients: number
   lastClientUpdateEntriesSent: number
   lastClientUpdateBytes: number
   lastAverageVisiblePlayersPerClient: number
   dirtyClients: number
   uptimeSeconds: number
}

interface BotStats {
   targetCount: number
   connectedCount: number
   incomingMessages: number
   incomingBytes: number
   outgoingMessages: number
   outgoingBytes: number
   errors: number
}

interface DebugOverlayProps {
   socket: WebSocket | null
   networkStatsRef: React.MutableRefObject<NetworkDebugStats>
   sceneStatsRef: React.MutableRefObject<SceneDebugStats>
}

export function createNetworkDebugStats(): NetworkDebugStats {
   return {
      incomingMessages: 0,
      incomingBytes: 0,
      outgoingMessages: 0,
      outgoingBytes: 0,
      droppedOutgoing: 0,
      decodeErrors: 0,
   }
}

export function createSceneDebugStats(): SceneDebugStats {
   return {
      fps: 0,
      frameMs: 0,
      drawCalls: 0,
      triangles: 0,
      lines: 0,
      points: 0,
      geometries: 0,
      textures: 0,
      programs: 0,
      dpr: 1,
      width: 0,
      height: 0,
   }
}

export function getSocketPayloadByteLength(data: unknown): number {
   if (typeof data === 'string') {
      return data.length
   }

   if (data instanceof ArrayBuffer) {
      return data.byteLength
   }

   if (ArrayBuffer.isView(data)) {
      return data.byteLength
   }

   if (typeof Blob !== 'undefined' && data instanceof Blob) {
      return data.size
   }

   return 0
}

export function instrumentSocketSend(
   socket: WebSocket,
   networkStatsRef: React.MutableRefObject<NetworkDebugStats>
) {
   const originalSend = socket.send.bind(socket)

   ;(socket as any).send = (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
      networkStatsRef.current.outgoingMessages += 1
      networkStatsRef.current.outgoingBytes += getSocketPayloadByteLength(data)
      return originalSend(data)
   }

   return () => {
      ;(socket as any).send = originalSend
   }
}

export const SceneDebugSampler: React.FC<{
   sceneStatsRef: React.MutableRefObject<SceneDebugStats>
}> = ({ sceneStatsRef }) => {
   const gl = useThree((state) => state.gl)
   const size = useThree((state) => state.size)
   const frames = useRef(0)
   const accumulatedSeconds = useRef(0)
   const accumulatedFrameMs = useRef(0)

   useFrame((_, delta) => {
      frames.current += 1
      accumulatedSeconds.current += delta
      accumulatedFrameMs.current += delta * 1000

      if (accumulatedSeconds.current < 0.25) {
         return
      }

      const info = gl.info
      sceneStatsRef.current = {
         fps: frames.current / accumulatedSeconds.current,
         frameMs: accumulatedFrameMs.current / frames.current,
         drawCalls: info.render.calls,
         triangles: info.render.triangles,
         lines: info.render.lines,
         points: info.render.points,
         geometries: info.memory.geometries,
         textures: info.memory.textures,
         programs: info.programs?.length ?? 0,
         dpr: gl.getPixelRatio(),
         width: size.width,
         height: size.height,
      }

      frames.current = 0
      accumulatedSeconds.current = 0
      accumulatedFrameMs.current = 0
   })

   return null
}

function createDebugSocket() {
   const protocol = window.location.protocol.includes('https') ? 'wss' : 'ws'
   const socket = new WebSocket(`${protocol}://${location.host}`)
   socket.binaryType = 'arraybuffer'
   return socket
}

function makeBotPosition(index: number, elapsedSeconds: number, moving: boolean) {
   const ring = Math.floor(index / 18)
   const slot = index % 18
   const radius = 42 + ring * 24
   const speed = moving ? 0.18 + (index % 5) * 0.025 : 0
   const angle = slot * ((Math.PI * 2) / 18) + elapsedSeconds * speed
   const wobble = moving ? Math.sin(elapsedSeconds * 0.55 + index) * 8 : 0
   const x = Math.round((Math.cos(angle) * (radius + wobble)) * 100) / 100
   const z = Math.round((Math.sin(angle) * (radius + wobble)) * 100) / 100
   const rotationY = Math.round((-angle + Math.PI / 2) * 10000) / 10000

   return {
      position: [x, 0, z],
      rotation: [0, rotationY, 0],
      action: moving ? '8' : '3',
   }
}

function useDebugBotSwarm(targetCount: number, updateMs: number, moving: boolean) {
   const botsRef = useRef<Array<{ socket: WebSocket; index: number }>>([])
   const statsRef = useRef<BotStats>({
      targetCount,
      connectedCount: 0,
      incomingMessages: 0,
      incomingBytes: 0,
      outgoingMessages: 0,
      outgoingBytes: 0,
      errors: 0,
   })
   const [connectedCount, setConnectedCount] = useState(0)

   useEffect(() => {
      statsRef.current.targetCount = targetCount

      while (botsRef.current.length < targetCount) {
         const index = botsRef.current.length
         const socket = createDebugSocket()
         const bot = { socket, index }

         socket.addEventListener('open', () => {
            const message = encode({
               type: 'state_set_username',
               payload: `Bot ${index + 1}`,
            })

            statsRef.current.outgoingMessages += 1
            statsRef.current.outgoingBytes += message.byteLength
            socket.send(message)
            setConnectedCount(botsRef.current.filter(({ socket }) => socket.readyState === WebSocket.OPEN).length)
         })

         socket.addEventListener('message', (event) => {
            statsRef.current.incomingMessages += 1
            statsRef.current.incomingBytes += getSocketPayloadByteLength(event.data)

            if (statsRef.current.incomingMessages < 4) {
               try {
                  decode(event.data)
               } catch {
                  statsRef.current.errors += 1
               }
            }
         })

         socket.addEventListener('close', () => {
            setConnectedCount(botsRef.current.filter(({ socket }) => socket.readyState === WebSocket.OPEN).length)
         })

         socket.addEventListener('error', () => {
            statsRef.current.errors += 1
         })

         botsRef.current.push(bot)
      }

      while (botsRef.current.length > targetCount) {
         const bot = botsRef.current.pop()
         bot?.socket.close()
      }

      setConnectedCount(botsRef.current.filter(({ socket }) => socket.readyState === WebSocket.OPEN).length)
   }, [targetCount])

   useEffect(() => {
      const interval = window.setInterval(() => {
         const elapsedSeconds = performance.now() / 1000

         botsRef.current.forEach(({ socket, index }) => {
            if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 128 * 1024) {
               return
            }

            const message = encode({
               type: 'move',
               payload: makeBotPosition(index, elapsedSeconds, moving),
            })

            statsRef.current.outgoingMessages += 1
            statsRef.current.outgoingBytes += message.byteLength
            socket.send(message)
         })
      }, updateMs)

      return () => window.clearInterval(interval)
   }, [moving, updateMs])

   useEffect(() => {
      statsRef.current.connectedCount = connectedCount
   }, [connectedCount])

   useEffect(
      () => () => {
         botsRef.current.forEach(({ socket }) => socket.close())
         botsRef.current = []
      },
      []
   )

   const sendChatBurst = useCallback((count: number) => {
      let sent = 0

      for (const { socket, index } of botsRef.current) {
         if (sent >= count) {
            break
         }

         if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 128 * 1024) {
            continue
         }

         const message = encode({
            type: 'chat',
            payload: { text: `bubble test ${index + 1}` },
         })

         statsRef.current.outgoingMessages += 1
         statsRef.current.outgoingBytes += message.byteLength
         socket.send(message)
         sent += 1
      }
   }, [])

   return { statsRef, sendChatBurst }
}

function formatBytes(bytes: number) {
   if (bytes < 1024) {
      return `${Math.round(bytes)} B`
   }

   if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
   }

   return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatNumber(value: number) {
   return Math.round(value).toLocaleString()
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
   return (
      <div style={styles.statRow}>
         <span style={styles.statLabel}>{label}</span>
         <span style={styles.statValue}>{value}</span>
      </div>
   )
}

const DebugOverlay: React.FC<DebugOverlayProps> = ({ socket, networkStatsRef, sceneStatsRef }) => {
   const [open, setOpen] = useState(true)
   const [targetBotCount, setTargetBotCount] = useState(0)
   const [updateMs, setUpdateMs] = useState(50)
   const [chatBurstCount, setChatBurstCount] = useState(10)
   const [moving, setMoving] = useState(true)
   const { statsRef: botStatsRef, sendChatBurst } = useDebugBotSwarm(targetBotCount, updateMs, moving)
   const remotePlayerCount = usePlayerPositionsStore((state) => state.playerPositions.size)
   const audioClientCount = useClientAudioStore((state) => Object.keys(state.clients).length)
   const chatMessageCount = useChatStore((state) => state.messages.length)
   const previousRef = useRef({
      time: performance.now(),
      network: { ...networkStatsRef.current },
      bots: { ...botStatsRef.current },
      nameplates: getNameplateDebugMetrics(),
   })
   const [snapshot, setSnapshot] = useState(() => ({
      scene: sceneStatsRef.current,
      network: networkStatsRef.current,
      bots: botStatsRef.current,
      nameplates: getNameplateDebugMetrics(),
      mainInRate: 0,
      mainOutRate: 0,
      mainInBytesRate: 0,
      mainOutBytesRate: 0,
      botInRate: 0,
      botOutRate: 0,
      botInBytesRate: 0,
      botOutBytesRate: 0,
      nameplateFrameSampleRate: 0,
      chatBubbleRenderRate: 0,
      chatBubbleTickerRate: 0,
   }))

   useEffect(() => {
      const interval = window.setInterval(() => {
         const now = performance.now()
         const seconds = Math.max(0.001, (now - previousRef.current.time) / 1000)
         const network = { ...networkStatsRef.current }
         const bots = { ...botStatsRef.current }
         const nameplates = getNameplateDebugMetrics()

         setSnapshot({
            scene: { ...sceneStatsRef.current },
            network,
            bots,
            nameplates,
            mainInRate: (network.incomingMessages - previousRef.current.network.incomingMessages) / seconds,
            mainOutRate: (network.outgoingMessages - previousRef.current.network.outgoingMessages) / seconds,
            mainInBytesRate: (network.incomingBytes - previousRef.current.network.incomingBytes) / seconds,
            mainOutBytesRate: (network.outgoingBytes - previousRef.current.network.outgoingBytes) / seconds,
            botInRate: (bots.incomingMessages - previousRef.current.bots.incomingMessages) / seconds,
            botOutRate: (bots.outgoingMessages - previousRef.current.bots.outgoingMessages) / seconds,
            botInBytesRate: (bots.incomingBytes - previousRef.current.bots.incomingBytes) / seconds,
            botOutBytesRate: (bots.outgoingBytes - previousRef.current.bots.outgoingBytes) / seconds,
            nameplateFrameSampleRate:
               (nameplates.frameSamples - previousRef.current.nameplates.frameSamples) / seconds,
            chatBubbleRenderRate:
               (nameplates.bubbleRenders - previousRef.current.nameplates.bubbleRenders) / seconds,
            chatBubbleTickerRate:
               (nameplates.tickerUpdates - previousRef.current.nameplates.tickerUpdates) / seconds,
         })

         previousRef.current = { time: now, network, bots, nameplates }
      }, 500)

      return () => window.clearInterval(interval)
   }, [botStatsRef, networkStatsRef, sceneStatsRef])

   const heapText = useMemo(() => {
      const memory = (performance as any).memory
      if (!memory) {
         return 'n/a'
      }

      return `${formatBytes(memory.usedJSHeapSize)} / ${formatBytes(memory.jsHeapSizeLimit)}`
   }, [snapshot])

   if (!open) {
      return (
         <button type="button" style={styles.closedButton} onClick={() => setOpen(true)}>
            Debug
         </button>
      )
   }

   const server = snapshot.network.server

   return (
      <aside style={styles.panel} aria-label="Debug instrumentation">
         <div style={styles.header}>
            <strong>Dev Debug</strong>
            <button type="button" style={styles.closeButton} onClick={() => setOpen(false)}>
               Hide
            </button>
         </div>

         <div style={styles.controls}>
            <label style={styles.label}>
               Bots
               <input
                  style={styles.numberInput}
                  type="number"
                  min={0}
                  max={80}
                  value={targetBotCount}
                  onChange={(event) => setTargetBotCount(Math.max(0, Math.min(80, Number(event.target.value) || 0)))}
               />
            </label>
            <label style={styles.label}>
               ms
               <input
                  style={styles.numberInput}
                  type="number"
                  min={30}
                  max={1000}
                  step={10}
                  value={updateMs}
                  onChange={(event) => setUpdateMs(Math.max(30, Math.min(1000, Number(event.target.value) || 50)))}
               />
            </label>
            <label style={styles.checkboxLabel}>
               <input type="checkbox" checked={moving} onChange={(event) => setMoving(event.target.checked)} />
               moving
            </label>
            <button type="button" style={styles.actionButton} onClick={() => setTargetBotCount(0)}>
               Clear
            </button>
            <label style={styles.label}>
               Chat
               <input
                  style={styles.numberInput}
                  type="number"
                  min={1}
                  max={80}
                  value={chatBurstCount}
                  onChange={(event) => setChatBurstCount(Math.max(1, Math.min(80, Number(event.target.value) || 10)))}
               />
            </label>
            <button type="button" style={styles.actionButton} onClick={() => sendChatBurst(chatBurstCount)}>
               Burst
            </button>
         </div>

         <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Scene</h2>
            <StatRow label="fps / frame" value={`${snapshot.scene.fps.toFixed(1)} / ${snapshot.scene.frameMs.toFixed(1)}ms`} />
            <StatRow label="draw / tris" value={`${snapshot.scene.drawCalls} / ${formatNumber(snapshot.scene.triangles)}`} />
            <StatRow label="gpu mem" value={`${snapshot.scene.geometries} geo, ${snapshot.scene.textures} tex, ${snapshot.scene.programs} prog`} />
            <StatRow label="canvas" value={`${snapshot.scene.width}x${snapshot.scene.height} @ ${snapshot.scene.dpr.toFixed(2)}x`} />
            <StatRow label="js heap" value={heapText} />
            <StatRow label="remote players" value={remotePlayerCount} />
            <StatRow label="audio/chat" value={`${audioClientCount} clients, ${chatMessageCount} msgs`} />
         </section>

         <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Nameplates</h2>
            <StatRow
               label="shown/total"
               value={`${snapshot.nameplates.visible} / ${snapshot.nameplates.mounted}`}
            />
            <StatRow
               label="culled"
               value={`${snapshot.nameplates.culledDistance} far, ${snapshot.nameplates.culledFrustum} offscreen`}
            />
            <StatRow
               label="samples"
               value={`${snapshot.nameplateFrameSampleRate.toFixed(0)}/s`}
            />
            <StatRow
               label="bubbles"
               value={`${snapshot.nameplates.activeBubbles} active, ${snapshot.chatBubbleRenderRate.toFixed(1)} renders/s`}
            />
            <StatRow
               label="bubble ids"
               value={`${snapshot.nameplates.uniqueBubbleMessages} unique, ${snapshot.nameplates.bubbleMounts} mounts`}
            />
            <StatRow label="ticker" value={`${snapshot.chatBubbleTickerRate.toFixed(1)}/s`} />
         </section>

         <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Main Socket</h2>
            <StatRow label="in" value={`${snapshot.mainInRate.toFixed(1)}/s, ${formatBytes(snapshot.mainInBytesRate)}/s`} />
            <StatRow label="out" value={`${snapshot.mainOutRate.toFixed(1)}/s, ${formatBytes(snapshot.mainOutBytesRate)}/s`} />
            <StatRow label="totals" value={`${formatBytes(snapshot.network.incomingBytes)} in, ${formatBytes(snapshot.network.outgoingBytes)} out`} />
            <StatRow label="buffer" value={socket ? formatBytes(socket.bufferedAmount) : 'closed'} />
            <StatRow label="decode/drop" value={`${snapshot.network.decodeErrors} / ${snapshot.network.droppedOutgoing}`} />
         </section>

         <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Bot Swarm</h2>
            <StatRow label="connected" value={`${snapshot.bots.connectedCount} / ${snapshot.bots.targetCount}`} />
            <StatRow label="in" value={`${snapshot.botInRate.toFixed(1)}/s, ${formatBytes(snapshot.botInBytesRate)}/s`} />
            <StatRow label="out" value={`${snapshot.botOutRate.toFixed(1)}/s, ${formatBytes(snapshot.botOutBytesRate)}/s`} />
            <StatRow label="totals" value={`${formatBytes(snapshot.bots.incomingBytes)} in, ${formatBytes(snapshot.bots.outgoingBytes)} out`} />
            <StatRow label="errors" value={snapshot.bots.errors} />
         </section>

         {server && (
            <section style={styles.section}>
               <h2 style={styles.sectionTitle}>Server</h2>
               <StatRow label="clients" value={server.connectedClients} />
               <StatRow label="in/out" value={`${formatBytes(server.inboundBytes)} / ${formatBytes(server.outboundBytes)}`} />
               <StatRow label="out rate" value={`${formatBytes(server.outboundBytesPerSecond)}/s`} />
               <StatRow label="messages" value={`${server.inboundMessages} in, ${server.outboundMessages} out`} />
               <StatRow label="dropped/decode" value={`${server.droppedOutbound} / ${server.decodeErrors}`} />
               <StatRow
                  label="updates"
                  value={`${server.lastClientUpdateCount} dirty, ${server.lastClientUpdateEntriesSent} sent`}
               />
               <StatRow label="recipients" value={`${server.lastClientUpdateRecipients} sockets`} />
               <StatRow label="visible avg" value={`${server.lastAverageVisiblePlayersPerClient.toFixed(1)} players/client`} />
               <StatRow label="update bytes" value={formatBytes(server.lastClientUpdateBytes)} />
               <StatRow label="tick avg/max" value={`${server.clientUpdateMsAvg.toFixed(2)} / ${server.clientUpdateMsMax.toFixed(2)}ms`} />
            </section>
         )}
      </aside>
   )
}

const styles: Record<string, React.CSSProperties> = {
   panel: {
      position: 'fixed',
      left: 12,
      top: 12,
      width: 310,
      maxHeight: 'calc(100vh - 24px)',
      overflowY: 'auto',
      zIndex: 1000,
      padding: 12,
      border: '1px solid rgba(179, 255, 198, 0.32)',
      borderRadius: 8,
      background: 'rgba(3, 10, 14, 0.88)',
      color: '#edf8ef',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 12,
      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.32)',
      backdropFilter: 'blur(8px)',
   },
   closedButton: {
      position: 'fixed',
      left: 12,
      top: 12,
      zIndex: 1000,
      border: '1px solid rgba(179, 255, 198, 0.36)',
      borderRadius: 8,
      background: 'rgba(3, 10, 14, 0.88)',
      color: '#edf8ef',
      padding: '8px 10px',
      cursor: 'pointer',
   },
   header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
   },
   closeButton: {
      border: '1px solid rgba(255, 255, 255, 0.18)',
      borderRadius: 6,
      background: 'rgba(255, 255, 255, 0.08)',
      color: '#edf8ef',
      padding: '4px 7px',
      cursor: 'pointer',
   },
   controls: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
      marginBottom: 12,
   },
   label: {
      display: 'grid',
      gap: 4,
      color: '#b8c9be',
   },
   checkboxLabel: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      color: '#b8c9be',
   },
   numberInput: {
      width: '100%',
      boxSizing: 'border-box',
      border: '1px solid rgba(255, 255, 255, 0.18)',
      borderRadius: 6,
      background: 'rgba(0, 0, 0, 0.28)',
      color: '#edf8ef',
      padding: '5px 6px',
      font: 'inherit',
   },
   actionButton: {
      border: '1px solid rgba(179, 255, 198, 0.28)',
      borderRadius: 6,
      background: 'rgba(77, 154, 101, 0.18)',
      color: '#edf8ef',
      cursor: 'pointer',
      font: 'inherit',
   },
   section: {
      borderTop: '1px solid rgba(255, 255, 255, 0.12)',
      paddingTop: 9,
      marginTop: 9,
   },
   sectionTitle: {
      margin: '0 0 6px',
      color: '#9dffb4',
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0,
   },
   statRow: {
      display: 'grid',
      gridTemplateColumns: '92px 1fr',
      gap: 8,
      lineHeight: 1.45,
   },
   statLabel: {
      color: '#93a69a',
   },
   statValue: {
      color: '#edf8ef',
      overflowWrap: 'anywhere',
   },
}

export default DebugOverlay
