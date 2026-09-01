export interface NameplateDebugMetrics {
   mounted: number
   visible: number
   culledDistance: number
   culledFrustum: number
   frameSamples: number
   tickerUpdates: number
   activeBubbles: number
   uniqueBubbleMessages: number
   bubbleMounts: number
   bubbleRenders: number
}

const mountedNameplates = new Set<string>()
const visibleNameplates = new Set<string>()
const distanceCulledNameplates = new Set<string>()
const frustumCulledNameplates = new Set<string>()

let frameSamples = 0
let tickerUpdates = 0
let bubbleMounts = 0
let bubbleRenders = 0
const activeBubbles = new Set<string>()
const uniqueBubbleMessages = new Set<string>()

function removeFromVisibilitySets(id: string) {
   visibleNameplates.delete(id)
   distanceCulledNameplates.delete(id)
   frustumCulledNameplates.delete(id)
}

export function registerNameplate(id: string) {
   mountedNameplates.add(id)

   return () => {
      mountedNameplates.delete(id)
      removeFromVisibilitySets(id)
   }
}

export function recordNameplateVisibility(id: string, state: 'visible' | 'distance' | 'frustum') {
   frameSamples += 1
   removeFromVisibilitySets(id)

   if (state === 'visible') {
      visibleNameplates.add(id)
      return
   }

   if (state === 'distance') {
      distanceCulledNameplates.add(id)
      return
   }

   frustumCulledNameplates.add(id)
}

export function recordChatBubbleTickerUpdate() {
   tickerUpdates += 1
}

export function recordChatBubbleMount() {
   bubbleMounts += 1
}

export function registerChatBubble(id: string) {
   activeBubbles.add(id)
   uniqueBubbleMessages.add(id)
   recordChatBubbleMount()

   return () => {
      activeBubbles.delete(id)
   }
}

export function recordChatBubbleRender() {
   bubbleRenders += 1
}

export function getNameplateDebugMetrics(): NameplateDebugMetrics {
   return {
      mounted: mountedNameplates.size,
      visible: visibleNameplates.size,
      culledDistance: distanceCulledNameplates.size,
      culledFrustum: frustumCulledNameplates.size,
      frameSamples,
      tickerUpdates,
      activeBubbles: activeBubbles.size,
      uniqueBubbleMessages: uniqueBubbleMessages.size,
      bubbleMounts,
      bubbleRenders,
   }
}
