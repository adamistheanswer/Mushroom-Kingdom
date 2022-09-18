import React from 'react'
import { Vector3 } from 'three'
import { useFBX } from '@react-three/drei'

const Forest = ({ largeScenery, smallScenery }) => {
   let largeObjects = largeScenery.current
   let smallObjects = smallScenery.current

   const objectsLRG: JSX.Element[] = []
   const objectsSML: JSX.Element[] = []

   function FBXHandler(url, scale) {
      let model = useFBX(url)
      model.scale.setScalar(scale)
      model.traverse(
         (mesh: { castShadow: boolean; receiveShadow: boolean }) => {
            mesh.castShadow = true
            mesh.receiveShadow = true
         }
      )
      return model.clone()
   }

   largeObjects.forEach((_, i) => {
      let scale = 0.5
      let entity = largeObjects[i]
      const idx = entity[0]
      const pos = new Vector3(entity[1], 0, entity[2])

      const model = (
         <primitive
            key={largeObjects[i].toString()}
            position={pos}
            object={
               idx === 1
                  ? FBXHandler('../Models/Forest/BirchTree_1.fbx', scale)
                  : idx === 2
                  ? FBXHandler('../Models/Forest/BirchTree_2.fbx', scale)
                  : idx === 3
                  ? FBXHandler('../Models/Forest/BirchTree_3.fbx', scale)
                  : idx === 4
                  ? FBXHandler('../Models/Forest/BirchTree_4.fbx', scale)
                  : idx === 5
                  ? FBXHandler('../Models/Forest/BirchTree_5.fbx', scale)
                  : idx === 6
                  ? FBXHandler('../Models/Forest/CommonTree_1.fbx', scale)
                  : idx === 7
                  ? FBXHandler('../Models/Forest/CommonTree_2.fbx', scale)
                  : idx === 8
                  ? FBXHandler('../Models/Forest/CommonTree_3.fbx', scale)
                  : idx === 9
                  ? FBXHandler('../Models/Forest/CommonTree_4.fbx', scale)
                  : idx === 10
                  ? FBXHandler('../Models/Forest/CommonTree_5.fbx', scale)
                  : idx === 11
                  ? FBXHandler('../Models/Forest/Plant_1.fbx', scale)
                  : FBXHandler('../Models/Forest/BirchTree_1.fbx', scale)
            }
         />
      )

      objectsLRG.push(model)
   })

   smallObjects.forEach((_, i) => {
      let scale = 0.1
      let entity = smallObjects[i]
      const idx = entity[0]
      const pos = new Vector3(entity[1], 0, entity[2])

      const model = (
         <primitive
            key={smallObjects[i].toString()}
            position={pos}
            object={
               idx === 1
                  ? FBXHandler('../Models/Forest/WoodLog.fbx', scale)
                  : idx === 2
                  ? FBXHandler('../Models/Forest/Rock_5.fbx', 0.15)
                  : idx === 3
                  ? FBXHandler('../Models/Forest/TreeStump_Moss.fbx', scale)
                  : idx === 4
                  ? FBXHandler('../Models/Forest/TreeStump.fbx', scale)
                  : idx === 5
                  ? FBXHandler('../Models/Forest/Plant_1.fbx', scale)
                  : idx === 6
                  ? FBXHandler('../Models/Forest/Plant_2.fbx', scale)
                  : idx === 7
                  ? FBXHandler('../Models/Forest/Plant_3.fbx', scale)
                  : idx === 8
                  ? FBXHandler('../Models/Forest/Plant_4.fbx', scale)
                  : idx === 9
                  ? FBXHandler('../Models/Forest/Plant_4.fbx', scale)
                  : idx === 10
                  ? FBXHandler('../Models/Forest/Rock_7.fbx', 0.2)
                  : idx === 11
                  ? FBXHandler('../Models/Forest/Plant_1.fbx', scale)
                  : idx === 12
                  ? FBXHandler('../Models/Forest/Grass_2.fbx', scale)
                  : idx === 13
                  ? FBXHandler('../Models/Forest/Grass_2.fbx', scale)
                  : idx === 14
                  ? FBXHandler('../Models/Forest/Grass_2.fbx', scale)
                  : idx === 15
                  ? FBXHandler('../Models/Forest/Grass_Short.fbx', scale)
                  : idx === 16
                  ? FBXHandler('../Models/Forest/Grass_Short.fbx', scale)
                  : idx === 17
                  ? FBXHandler('../Models/Forest/Grass.fbx', scale)
                  : idx === 18
                  ? FBXHandler('../Models/Forest/Flowers.fbx', 0.05)
                  : idx === 19
                  ? FBXHandler('../Models/Forest/Grass.fbx', 0.05)
                  : idx === 20
                  ? FBXHandler('../Models/Forest/Flowers.fbx', scale)
                  : FBXHandler('../Models/Forest/Grass.fbx', scale)
            }
         />
      )

      objectsSML.push(model)
   })

   return (
      <>
         {objectsLRG.flat()}
         {objectsSML.flat()}
      </>
   )
}

export default Forest
