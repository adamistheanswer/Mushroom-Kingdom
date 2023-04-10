import React, { useMemo } from 'react'
import { Vector3 } from 'three'
import { useFBX } from '@react-three/drei'
import useSceneryStore from '../State/SceneryStore'

const modelUrlMap = {
   0: '../Models/Forest/BirchTree_1.fbx',
   1: '../Models/Forest/BirchTree_2.fbx',
   2: '../Models/Forest/BirchTree_3.fbx',
   3: '../Models/Forest/BirchTree_4.fbx',
   4: '../Models/Forest/CommonTree_1.fbx',
   5: '../Models/Forest/CommonTree_2.fbx',
   6: '../Models/Forest/CommonTree_3.fbx',
   7: '../Models/Forest/CommonTree_4.fbx',
   8: '../Models/Forest/CommonTree_5.fbx',
   9: '../Models/Forest/Plant_1.fbx',
   10: '../Models/Forest/WoodLog.fbx',
   11: '../Models/Forest/TreeStump_Moss.fbx',
   12: '../Models/Forest/TreeStump.fbx',
   13: '../Models/Forest/Plant_2.fbx',
   14: '../Models/Forest/Plant_3.fbx',
   15: '../Models/Forest/Plant_4.fbx',
   16: '../Models/Forest/Rock_5.fbx',
   17: '../Models/Forest/Rock_7.fbx',
   18: '../Models/Forest/Grass_2.fbx',
   19: '../Models/Forest/Grass_Short.fbx',
   20: '../Models/Forest/Grass.fbx',
   21: '../Models/Forest/Flowers.fbx',
   22: '../Models/Forest/Grass_2.fbx',
   23: '../Models/Forest/Grass_Short.fbx',
   24: '../Models/Forest/Grass.fbx',
   25: '../Models/Forest/Flowers.fbx',
   26: '../Models/Forest/Plant_2.fbx',
   27: '../Models/Forest/Plant_3.fbx',
}

const useFBXHandler = (url, scale) => {
   const model = useFBX(url)
   const clonedModel = useMemo(() => {
      const m = model.clone()
      m.scale.setScalar(scale)
      m.traverse((mesh) => {
         mesh.castShadow = true
         mesh.receiveShadow = true
      })
      return m
   }, [model, scale])
   return clonedModel
}

const Forest = () => {
   const largeScenery = useSceneryStore((state) => state.largeScenery)
   const smallScenery = useSceneryStore((state) => state.smallScenery)

   const cachedModels = useMemo(() => {
      const models = {}
      Object.values(modelUrlMap).forEach((url) => {
         const scale =
            url.includes('Plant') || url.includes('Flowers') || url.includes('Grass')
               ? 0.1
               : url.includes('Log')
               ? 0.2
               : 0.5
         models[url] = useFBXHandler(url, scale)
      })
      return models
   }, [])

   function createObjects(sceneryData) {
      return sceneryData.map((entity) => {
         const idx = entity[0]
         if (sceneryData.length === 400) idx + 13
         const pos = new Vector3(entity[1], 0, entity[2])
         const modelUrl = modelUrlMap[idx]
         return (
            <primitive
               rotation={[0, entity[4], 0]}
               scale={entity[3]}
               key={entity.toString()}
               position={pos}
               object={cachedModels[modelUrl].clone()}
            />
         )
      })
   }

   const objectsLRG = createObjects(largeScenery)
   const objectsSML = createObjects(smallScenery)

   return (
      <>
         {objectsLRG}
         {objectsSML}
      </>
   )
}

export default Forest
