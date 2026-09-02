// Public STUN, used on its own whenever Cloudflare is unreachable. It still connects the majority
// of player pairs; only those behind symmetric NAT need the relay.
const STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']

const CLOUDFLARE_TURN_ENDPOINT = 'https://rtc.live.cloudflare.com/v1/turn/keys'

/**
 * `/ice-servers` is public - it has to be, the page fetches it before anyone has a session - so a
 * credential handed out there is a credential anyone can take. Relay traffic is billed by the
 * gigabyte, so the mitigation is a short life rather than a secret: two hours outlasts any play
 * session while leaving a lifted credential nearly worthless.
 */
const CREDENTIAL_TTL_SECONDS = 2 * 60 * 60
const REFRESH_MARGIN_MS = 15 * 60 * 1000
const FETCH_TIMEOUT_MS = 4000

// A failing credential fetch must not turn into a request-rate stampede against Cloudflare, and
// the client falls back to STUN on its own in the meantime.
const FAILURE_BACKOFF_MS = 30 * 1000

let cached = null
let cachedExpiresAt = 0
let failedUntil = 0
let inFlight = null

function getStunOnlyServers() {
   return [{ urls: STUN_URLS }]
}

/** Whether a relay is configured at all, regardless of whether it can currently be reached. */
function isTurnConfigured() {
   return Boolean(process.env.TURN_TOKEN_ID && process.env.TURN_API_TOKEN)
}

async function fetchCloudflareIceServers() {
   const response = await fetch(
      `${CLOUDFLARE_TURN_ENDPOINT}/${process.env.TURN_TOKEN_ID}/credentials/generate-ice-servers`,
      {
         method: 'POST',
         headers: {
            Authorization: `Bearer ${process.env.TURN_API_TOKEN}`,
            'Content-Type': 'application/json',
         },
         body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
         signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
   )

   if (!response.ok) {
      throw new Error(`Cloudflare TURN responded ${response.status}`)
   }

   const body = await response.json()
   const servers = Array.isArray(body?.iceServers) ? body.iceServers : [body?.iceServers]
   const usable = servers.filter((server) => server?.urls)

   if (usable.length === 0) {
      throw new Error('Cloudflare TURN returned no usable ICE servers')
   }

   // Cloudflare returns its own STUN alongside the relay, so nothing needs padding out here.
   return usable
}

/**
 * Resolves the ICE server list for a client. Never rejects and never blocks for long: a Cloudflare
 * outage degrades to STUN rather than taking voice chat - and the game - down with it.
 */
export async function getIceServers() {
   if (!isTurnConfigured()) {
      return getStunOnlyServers()
   }

   const now = Date.now()

   if (cached && now < cachedExpiresAt - REFRESH_MARGIN_MS) {
      return cached
   }

   if (now < failedUntil) {
      return cached ?? getStunOnlyServers()
   }

   if (!inFlight) {
      inFlight = fetchCloudflareIceServers()
         .then((iceServers) => {
            cached = iceServers
            cachedExpiresAt = Date.now() + CREDENTIAL_TTL_SECONDS * 1000
            failedUntil = 0
            return iceServers
         })
         .catch((error) => {
            failedUntil = Date.now() + FAILURE_BACKOFF_MS
            console.warn('Could not mint Cloudflare TURN credentials, falling back', error?.message ?? error)
            // An expired credential is worse than none: it makes the client believe it has a relay.
            return getStunOnlyServers()
         })
         .finally(() => {
            inFlight = null
         })
   }

   return inFlight
}

/**
 * WebRTC only reaches peers behind symmetric NAT through a TURN relay, and without one voice fails
 * in the least diagnosable way possible: both players hold a live microphone and simply never hear
 * each other. Worth saying once at boot rather than leaving it to be discovered in production.
 */
export function warnAboutTurnConfiguration() {
   if (isTurnConfigured()) {
      console.log('Voice chat will mint short-lived TURN credentials from Cloudflare.')
      return
   }

   if (process.env.TURN_TOKEN_ID || process.env.TURN_API_TOKEN) {
      console.warn('Cloudflare TURN needs both TURN_TOKEN_ID and TURN_API_TOKEN - only one is set.')
      return
   }

   console.warn(
      'No TURN relay configured - voice chat will only connect between players whose networks allow a direct peer-to-peer path. See .env.example.'
   )
}
