export function playerActionsToIndexes(playerActions) {
   let indexArr = playerActions.map((action) => {
      switch (action) {
         case 'Dance':
            return 0
         case 'Dance2':
            return 1
         case 'Excited':
            return 2
         case 'Idle':
            return 3
         case 'Punch':
            return 4
         case 'Salute':
            return 5
         case 'StrafeLeft':
            return 6
         case 'StrafeRight':
            return 7
         case 'Walking':
            return 8
         case 'WalkingB':
            return 9
         case 'Waving':
            return 10
      }
   })

   return indexArr
}

export const actionsArr = [
   'Dance',
   'Dance2',
   'Excited',
   'Idle',
   'Punch',
   'Salute',
   'StrafeLeft',
   'StrafeRight',
   'Walking',
   'WalkingB',
   'Waving',
]
