function seededUnit(seed) {
   return (Math.sin(seed * 127.1) * 43758.5453123) % 1
}

function randomUnit(seed) {
   const value = seededUnit(seed)
   return value < 0 ? value + 1 : value
}

export function setInstanceScale(entity, scale) {
   const modelId = entity[0]
   const baseScale = entity[3]
   const seed = modelId * 131 + entity[1] * 0.11 + entity[2] * 0.19

   if (modelId >= 16 && modelId <= 17) {
      scale.set(
         baseScale * (0.9 + randomUnit(seed + 1) * 0.18),
         baseScale * (0.82 + randomUnit(seed + 2) * 0.16),
         baseScale * (0.9 + randomUnit(seed + 3) * 0.18)
      )
      return
   }

   if (modelId < 10) {
      scale.set(
         baseScale * (0.94 + randomUnit(seed + 1) * 0.12),
         baseScale * (0.92 + randomUnit(seed + 2) * 0.2),
         baseScale * (0.94 + randomUnit(seed + 3) * 0.12)
      )
      return
   }

   scale.set(
      baseScale * (0.9 + randomUnit(seed + 1) * 0.18),
      baseScale * (0.94 + randomUnit(seed + 2) * 0.16),
      baseScale * (0.9 + randomUnit(seed + 3) * 0.18)
   )
}
