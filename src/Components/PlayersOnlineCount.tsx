import React from 'react'
import { usePlayerPositionsStore } from '../State/playerPositionsStore'
import useUserStore from '../State/userStore'

const PlayersOnlineCount: React.FC = () => {
   const remotePlayerCount = usePlayerPositionsStore((state) => state.playerPositions.size)
   const localClientId = useUserStore((state) => state.localClientId)
   const playersOnline = remotePlayerCount + (localClientId ? 1 : 0)
   const playerLabel = playersOnline === 1 ? 'player' : 'players'

   return (
      <aside className="players-online-count" aria-live="polite" aria-label={`${playersOnline} ${playerLabel} online`}>
         <span className="players-online-count__value">{playersOnline}</span>
         <span className="players-online-count__label">online</span>
      </aside>
   )
}

export default PlayersOnlineCount
