import React, { useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import { modelUrlMap } from '../Utils/sceneAssetManifest.js'
import { readSceneAsset } from '../Utils/sceneAssets'
import useSceneryStore from '../State/SceneryStore'

const Y_AXIS = new Vector3(0, 1, 0)

function seededUnit(seed: number) {
   return (Math.sin(seed * 127.1) * 43758.5453123) % 1
}

function randomUnit(seed: number) {
   const value = seededUnit(seed)
   return value < 0 ? value + 1 : value
}

function setInstanceScale(entity, scale: Vector3) {
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

function softenSceneryMaterial(material) {
   if (Array.isArray(material)) {
      material.forEach(softenSceneryMaterial)
      return
   }

   if (!material || material.userData?.scenerySoftened) {
      return
   }

   material.userData = {
      ...material.userData,
      scenerySoftened: true,
   }

   if ('metalness' in material) {
      material.metalness = 0
   }

   if ('roughness' in material) {
      material.roughness = Math.max(material.roughness ?? 0.75, 0.9)
   }

   if ('shininess' in material) {
      material.shininess = Math.min(material.shininess ?? 12, 4)
   }

   if (material.specular?.setScalar) {
      material.specular.setScalar(0.06)
   }

   if ('envMapIntensity' in material) {
      material.envMapIntensity = Math.min(material.envMapIntensity ?? 0.25, 0.12)
   }

   material.needsUpdate = true
}

const SceneryInstances = ({ geometry, material, localMatrix, entities, castsShadow }) => {
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
         setInstanceScale(entity, scale)

         mesh.setMatrixAt(index, matrix.compose(position, rotation, scale).multiply(localMatrix))
      })

      mesh.instanceMatrix.needsUpdate = true

      mesh.computeBoundingSphere()
   }, [entities, localMatrix])

   return <instancedMesh ref={meshRef} args={args} castShadow={castsShadow} receiveShadow />
}

const SceneryModelGroup = ({ modelUrl, entities }) => {
   const model = readSceneAsset(modelUrl)

   const parts = useMemo(() => {
      model.updateMatrixWorld(true)

      const rootInverse = new Matrix4().copy(model.matrixWorld).invert()
      const found = []

      model.traverse((child) => {
         if (!child.isMesh) return

         softenSceneryMaterial(child.material)

         found.push({
            geometry: child.geometry,
            material: child.material,
            localMatrix: new Matrix4().multiplyMatrices(rootInverse, child.matrixWorld),
         })
      })

      return found
   }, [model])

   const castsShadow = entities.some((entity) => entity[0] < 10 || entity[0] === 10 || entity[0] === 12)

   return (
      <>
         {parts.map((part, index) => (
            <SceneryInstances
               key={index}
               geometry={part.geometry}
               material={part.material}
               localMatrix={part.localMatrix}
               entities={entities}
               castsShadow={castsShadow}
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
