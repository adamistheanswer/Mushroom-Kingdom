// The scenery is a flat array of tuples rather than objects - it is sent to every client on join,
// and at 450 items the key names would dominate the payload.
// Each entry is [modelIndex, x, z, scale, rotationY].

const SPAWN_CLEAR_RADIUS = 60
const LARGE_SCENERY_COUNT = 50
const LARGE_SCENERY_RANGE = 475
const SMALL_SCENERY_COUNT = 400
const SMALL_SCENERY_RANGE = 500

let largeScenery = []
let smallScenery = []

function randomBetween(min, max) {
   return Math.random() * (max - min) + min
}

function randomSignedCoordinate(max) {
   return Math.ceil(Math.random() * max) * (Math.round(Math.random()) ? 1 : -1)
}

// Players spawn at the origin, so nothing may generate close enough to drop them inside a tree.
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

function generateLargeScenery() {
   return Array.from({ length: LARGE_SCENERY_COUNT }, () => {
      const [x, z] = randomPositionOutsideSpawnClearArea(LARGE_SCENERY_RANGE)

      return [Math.floor(Math.random() * 10), x, z, randomBetween(0.4, 0.7), randomBetween(0, 3)]
   })
}

function generateSmallScenery() {
   return Array.from({ length: SMALL_SCENERY_COUNT }, () => {
      const [x, z] = randomPositionOutsideSpawnClearArea(SMALL_SCENERY_RANGE)

      return [10 + Math.floor(Math.random() * 17), x, z, randomBetween(0.2, 0.32), randomBetween(0, 3)]
   })
}

export function getLargeScenery() {
   return largeScenery
}

export function getSmallScenery() {
   return smallScenery
}

// Generated on first arrival rather than at boot, so an idle server holds nothing and every fresh
// set of players gets a new forest.
export function ensureWorldGenerated() {
   if (largeScenery.length === 0) {
      largeScenery = generateLargeScenery()
   }

   if (smallScenery.length === 0) {
      smallScenery = generateSmallScenery()
   }
}

export function clearWorld() {
   largeScenery = []
   smallScenery = []
}
