import React from 'react'
import { Vector3 } from 'three'
import { useFBX } from '@react-three/drei'

const Forest = ({ objectPositions }) => {
   let forestObjects = objectPositions.current

   let forestScale = 0.35

   function FBXHandler(url) {
      let model = useFBX(url)
      model.scale.setScalar(forestScale)
      model.traverse(
         (mesh: { castShadow: boolean; receiveShadow: boolean }) => {
            mesh.castShadow = true
            mesh.receiveShadow = true
         }
      )
      return model.clone()
   }

   const objects: JSX.Element[] = []

   forestObjects.forEach((_, i) => {
      let forestObject = forestObjects[i]
      const idx = forestObject[0]
      const pos = new Vector3(forestObject[1], 0, forestObject[2])

      const model = (
         <primitive
            key={forestObjects[i].toString()}
            position={pos}
            object={
               idx === 1
                  ? FBXHandler('../Models/Forest/BirchTree_1.fbx')
                  : idx === 2
                  ? FBXHandler('../Models/Forest/BirchTree_2.fbx')
                  : idx === 3
                  ? FBXHandler('../Models/Forest/BirchTree_3.fbx')
                  : idx === 4
                  ? FBXHandler('../Models/Forest/BirchTree_4.fbx')
                  : idx === 5
                  ? FBXHandler('../Models/Forest/BirchTree_5.fbx')
                  : idx === 6
                  ? FBXHandler('../Models/Forest/CommonTree_1.fbx')
                  : idx === 7
                  ? FBXHandler('../Models/Forest/CommonTree_2.fbx')
                  : idx === 8
                  ? FBXHandler('../Models/Forest/CommonTree_3.fbx')
                  : idx === 9
                  ? FBXHandler('../Models/Forest/CommonTree_4.fbx')
                  : idx === 10
                  ? FBXHandler('../Models/Forest/CommonTree_5.fbx')
                  : idx === 11
                  ? FBXHandler('../Models/Forest/Plant_1.fbx')
                  : FBXHandler('../Models/Forest/Plant_2.fbx')
            }
         />
      )

      objects.push(model)
   })

   return (
      <>
         {objects.map((obj: JSX.Element) => {
            return obj
         })}
      </>
   )
}

export default Forest
