import { Vector3 } from 'three'

function getPositionAxis(position, axisIndex, axisName) {
   return Array.isArray(position) ? position[axisIndex] : position[axisName]
}

export function isColliding(localPosition, remotePositions, direction, radius = 1) {
   const isInSpawnArea = localPosition.x >= -7 && localPosition.x <= 7 && localPosition.z >= -7 && localPosition.z <= 7
   if (isInSpawnArea) {
      return false
   }
   const localVector = new Vector3().copy(localPosition)
   const remoteVector = new Vector3()
   const directionVector = new Vector3()
   const offset = -1
   const radiusSquared = radius * radius * 4

   for (const [, data] of remotePositions.entries()) {
      const position = data.targetPosition || data.position
      const remoteX = getPositionAxis(position, 0, 'x')
      const remoteY = getPositionAxis(position, 1, 'y')
      const remoteZ = getPositionAxis(position, 2, 'z')

      if (remoteX >= -7 && remoteX <= 7 && remoteZ >= -7 && remoteZ <= 7) {
         continue
      }
      remoteVector.set(remoteX + offset, remoteY, remoteZ + offset)

      directionVector.copy(remoteVector).sub(localVector).normalize()
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
