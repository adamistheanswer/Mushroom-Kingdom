import React, { useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
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

const Y_AXIS = new Vector3(0, 1, 0)


const SceneryInstances = ({ geometry, material, localMatrix, entities }) => {
   const meshRef = useRef<InstancedMesh>(null!)

   const args = useMemo(() => [geometry, material, entities.length], [geometry, material, entities.length])

   useLayoutEffect(() => {
      const mesh = meshRef.current
      if (!mesh) return

      const matrix = new Matrix4()
      const position = new Vector3()
      const rotation = new Quaternion()
      const scale = new Vector3()

      entities.forEach((entity, index) => {
         position.set(entity[1], 0, entity[2])
         rotation.setFromAxisAngle(Y_AXIS, entity[4])
         scale.setScalar(entity[3])

         mesh.setMatrixAt(index, matrix.compose(position, rotation, scale).multiply(localMatrix))
      })

      mesh.instanceMatrix.needsUpdate = true

      mesh.computeBoundingSphere()
   }, [entities, localMatrix])

   return <instancedMesh ref={meshRef} args={args} castShadow receiveShadow />
}

const SceneryModelGroup = ({ modelUrl, entities }) => {
   const model = useFBX(modelUrl)


   const parts = useMemo(() => {
      model.updateMatrixWorld(true)

      const rootInverse = new Matrix4().copy(model.matrixWorld).invert()
      const found = []

      model.traverse((child) => {
         if (!child.isMesh) return

         found.push({
            geometry: child.geometry,
            material: child.material,
            localMatrix: new Matrix4().multiplyMatrices(rootInverse, child.matrixWorld),
         })
      })

      return found
   }, [model])

   return (
      <>
         {parts.map((part, index) => (
            <SceneryInstances
               key={index}
               geometry={part.geometry}
               material={part.material}
               localMatrix={part.localMatrix}
               entities={entities}
            />
         ))}
      </>
   )
}

const Forest = () => {
   const largeScenery = useSceneryStore((state) => state.largeScenery)
   const smallScenery = useSceneryStore((state) => state.smallScenery)

   const sceneryByModel = useMemo(() => {
      const groups = new Map()

      ;[...largeScenery, ...smallScenery].forEach((entity) => {
         const modelUrl = modelUrlMap[entity[0]]

         if (!modelUrl) {
            return
         }

         if (!groups.has(modelUrl)) {
            groups.set(modelUrl, [])
         }

         groups.get(modelUrl).push(entity)
      })

      return Array.from(groups.entries())
   }, [largeScenery, smallScenery])

   return (
      <>
         {sceneryByModel.map(([modelUrl, entities]) => (
            <SceneryModelGroup key={modelUrl} modelUrl={modelUrl} entities={entities} />
         ))}
      </>
   )
}

export default Forest
