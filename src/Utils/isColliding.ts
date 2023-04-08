import { Vector3 } from 'three'

export function isColliding(localPosition, remotePositions, radius = 1) {
   const isInSpawnArea = localPosition.x >= -7 && localPosition.x <= 7 && localPosition.z >= -7 && localPosition.z <= 7
   if (isInSpawnArea) {
      return false
   }
   const localVector = new Vector3().copy(localPosition)
   const remoteVector = new Vector3()
   const offset = -1
   const radiusSquared = radius * radius * 4

   for (const [, data] of remotePositions.entries()) {
      remoteVector.set(data.position.x + offset, data.position.y, data.position.z + offset)
      const distanceSquared = localVector.distanceToSquared(remoteVector)
      if (distanceSquared < radiusSquared) {
         return true
      }
   }
   return false
}
