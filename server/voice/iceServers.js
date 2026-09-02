// Public STUN, used on its own unless a relay is configured. It still connects the majority of
// player pairs; only those behind symmetric NAT need TURN.
const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']

function parseUrlList(value, fallback = []) {
   if (!value) {
      return fallback
   }

   return value
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean)
}

/**
 * WebRTC only reaches peers behind symmetric NAT through a TURN relay. Building the list on the
 * server keeps credentials out of the client bundle and lets them rotate without a rebuild.
 */
export function getIceServers() {
   const iceServers = [{ urls: parseUrlList(process.env.STUN_URLS, DEFAULT_STUN_URLS) }]
   const turnUrls = parseUrlList(process.env.TURN_URLS)

   if (turnUrls.length > 0) {
      iceServers.push({
         urls: turnUrls,
         username: process.env.TURN_USERNAME,
         credential: process.env.TURN_CREDENTIAL,
      })
   }

   return iceServers
}
