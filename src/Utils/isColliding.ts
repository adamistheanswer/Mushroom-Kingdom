import { Vector3 } from 'three'

export function isColliding(localPosition, remotePositions, direction, radius = 1) {
   const isInSpawnArea = localPosition.x >= -7 && localPosition.x <= 7 && localPosition.z >= -7 && localPosition.z <= 7
   if (isInSpawnArea) {
      return false
   }
   const localVector = new Vector3().copy(localPosition)
   const remoteVector = new Vector3()
   const offset = -1
   const radiusSquared = radius * radius * 4

   for (const [, data] of remotePositions.entries()) {
      const isInSpawnArea =
         data.position.x >= -7 && data.position.x <= 7 && data.position.z >= -7 && data.position.z <= 7
      if (isInSpawnArea) {
         return false
      }
      remoteVector.set(data.position.x + offset, data.position.y, data.position.z + offset)

      const directionVector = remoteVector.clone().sub(localVector).normalize()
      const dotProduct = directionVector.dot(direction)

      if (dotProduct <= 0) {
         continue
      }

      const distanceSquared = localVector.distanceToSquared(remoteVector)
      if (distanceSquared < radiusSquared) {
         return true
      }
   }
   return false
}
