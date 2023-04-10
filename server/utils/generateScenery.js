function randomBetween(min, max) {
   return Math.random() * (max - min) + min
}

export function generateLargeScenery() {
   return Array.from({ length: 100 }, () => {
      return [
         Math.floor(Math.random() * 10),
         Math.ceil(Math.random() * 475) * (Math.round(Math.random()) ? 1 : -1),
         Math.ceil(Math.random() * 475) * (Math.round(Math.random()) ? 1 : -1),
         randomBetween(0.4, 0.7),
         randomBetween(0, 3),
      ]
   })
}

export function generateSmallScenery() {
   return Array.from({ length: 400 }, () => {
      return [
         10 + Math.floor(Math.random() * 17),
         Math.ceil(Math.random() * 500) * (Math.round(Math.random()) ? 1 : -1),
         Math.ceil(Math.random() * 500) * (Math.round(Math.random()) ? 1 : -1),
         randomBetween(0.2, 0.32),
         randomBetween(0, 3),
      ]
   })
}
