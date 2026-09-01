function randomBetween(min, max) {
   return Math.random() * (max - min) + min
}

const SPAWN_CLEAR_RADIUS = 30

function randomSignedCoordinate(max) {
   return Math.ceil(Math.random() * max) * (Math.round(Math.random()) ? 1 : -1)
}

function isInsideSpawnClearArea(x, z) {
   return Math.hypot(x, z) < SPAWN_CLEAR_RADIUS
}

function randomPositionOutsideSpawnClearArea(max) {
   let x
   let z

   do {
      x = randomSignedCoordinate(max)
      z = randomSignedCoordinate(max)
   } while (isInsideSpawnClearArea(x, z))

   return [x, z]
}

export function generateLargeScenery() {
   return Array.from({ length: 80 }, () => {
      const [x, z] = randomPositionOutsideSpawnClearArea(475)

      return [
         Math.floor(Math.random() * 10),
         x,
         z,
         randomBetween(0.4, 0.7),
         randomBetween(0, 3),
      ]
   })
}

export function generateSmallScenery() {
   return Array.from({ length: 400 }, () => {
      const [x, z] = randomPositionOutsideSpawnClearArea(500)

      return [
         10 + Math.floor(Math.random() * 17),
         x,
         z,
         randomBetween(0.2, 0.32),
         randomBetween(0, 3),
      ]
   })
}
