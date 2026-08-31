import { PLAYER_WORLD_LIMIT } from '../constants'

export function isWithinWorldBounds(position) {
   return Math.abs(position.x) <= PLAYER_WORLD_LIMIT && Math.abs(position.z) <= PLAYER_WORLD_LIMIT
}
