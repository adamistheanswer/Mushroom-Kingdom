import React, { useMemo } from 'react'
import { Merged } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
const Forest = ({ largeScenery, smallScenery }) => {
   let largeObjects = largeScenery.current
   let smallObjects = smallScenery.current

   const [
      birch1,
      birch2,
      birch3,
      birch4,
      birch5,
      common1,
      common2,
      common3,
      common4,
      common5,
      plant1,
      plant2,
      plant3,
      plant4,
      grass,
      grass2,
      grassShort,
      flowers,
      rock5,
      rock7,
      woodlog,
      treeStump,
      treeStumpMoss,
   ] = useLoader(FBXLoader, [
      '../Models/Forest/BirchTree_1.fbx',
      '../Models/Forest/BirchTree_2.fbx',
      '../Models/Forest/BirchTree_3.fbx',
      '../Models/Forest/BirchTree_4.fbx',
      '../Models/Forest/BirchTree_5.fbx',
      '../Models/Forest/CommonTree_1.fbx',
      '../Models/Forest/CommonTree_2.fbx',
      '../Models/Forest/CommonTree_3.fbx',
      '../Models/Forest/CommonTree_4.fbx',
      '../Models/Forest/CommonTree_5.fbx',
      '../Models/Forest/Plant_1.fbx',
      '../Models/Forest/Plant_2.fbx',
      '../Models/Forest/Plant_3.fbx',
      '../Models/Forest/Plant_4.fbx',
      '../Models/Forest/Grass.fbx',
      '../Models/Forest/Grass_2.fbx',
      '../Models/Forest/Grass_Short.fbx',
      '../Models/Forest/Flowers.fbx',
      '../Models/Forest/Rock_5.fbx',
      '../Models/Forest/Rock_7.fbx',
      '../Models/Forest/WoodLog.fbx',
      '../Models/Forest/TreeStump.fbx',
      '../Models/Forest/TreeStump_Moss.fbx',
   ])

   const meshes = useMemo(
      () => [
         birch1.children[0],
         birch2.children[0],
         birch3.children[0],
         birch4.children[0],
         birch5.children[0],
         common1.children[0],
         common2.children[0],
         common3.children[0],
         common4.children[0],
         common5.children[0],
         plant1.children[0],
         plant2.children[0],
         plant3.children[0],
         plant4.children[0],
         grass.children[0],
         grass2.children[0],
         grassShort.children[0],
         flowers.children[0],
         rock5.children[0],
         rock7.children[0],
         woodlog.children[0],
         treeStump.children[0],
         treeStumpMoss.children[0],
      ],
      [
         birch1,
         birch2,
         birch3,
         birch4,
         birch5,
         common1,
         common2,
         common3,
         common4,
         common5,
         plant1,
         plant2,
         plant3,
         plant4,
         grass,
         grass2,
         grassShort,
         flowers,
         rock5,
         rock7,
         woodlog,
         treeStump,
         treeStumpMoss,
      ]
   )

   return (
      <Merged castShadow receiveShadow meshes={meshes}>
         {(
            Birch1,
            Birch2,
            Birch3,
            Birch4,
            Birch5,
            Common1,
            Common2,
            Common3,
            Common4,
            Common5,
            Plant1,
            Plant2,
            Plant3,
            Plant4,
            Grass,
            Grass2,
            GrassShort,
            Flowers,
            Rock5,
            Rock7,
            Woodlog,
            TreeStump,
            TreeStumpMoss
         ) => (
            <>
               {largeObjects.map((entity) => {
                  const idx = entity[0]
                  switch (idx) {
                     case 1:
                        return (
                           <Birch1
                              scale={40}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 2:
                        return (
                           <Birch2
                              scale={40}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 3:
                        return (
                           <Birch3
                              scale={40}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 4:
                        return (
                           <Birch4
                              scale={40}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 5:
                        return (
                           <Birch5
                              scale={40}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 6:
                        return (
                           <Common1
                              scale={40}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 7:
                        return (
                           <Common2
                              scale={40}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 8:
                        return (
                           <Common3
                              scale={40}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 9:
                        return (
                           <Common4
                              scale={40}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 10:
                        return (
                           <Common5
                              scale={40}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     default:
                        return (
                           <Plant1
                              scale={40}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                  }
               })}
               {smallObjects.map((entity) => {
                  const idx = entity[0]
                  switch (idx) {
                     case 1:
                        return (
                           <Woodlog
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 2:
                        return (
                           <Rock5
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 3:
                        return (
                           <TreeStumpMoss
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 4:
                        return (
                           <TreeStump
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 5:
                        return (
                           <Plant1
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 6:
                        return (
                           <Plant2
                              scale={20}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 7:
                        return (
                           <Plant3
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 8:
                        return (
                           <Plant4
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 9:
                        return (
                           <Plant4
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 10:
                        return (
                           <Rock7
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 11:
                        return (
                           <Grass
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 12:
                        return (
                           <Grass2
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 13:
                        return (
                           <Grass2
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 14:
                        return (
                           <Grass2
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 15:
                        return (
                           <GrassShort
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 16:
                        return (
                           <Grass
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 17:
                        return (
                           <Grass
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 18:
                        return (
                           <Flowers
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 19:
                        return (
                           <Grass
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     case 20:
                        return (
                           <GrassShort
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                     default:
                        return (
                           <Flowers
                              scale={10}
                              rotation={[-Math.PI / 2, 0, Number(entity[3])]}
                              position={[entity[1], 0, entity[2]]}
                           />
                        )
                  }
               })}
            </>
         )}
      </Merged>
   )
}

export default Forest
