import { LoadingManager } from 'three'
import { FBXLoader, GLTFLoader } from 'three-stdlib'
import { createAssetBatch } from './createAssetBatch.js'
import { sceneAssetUrls } from './sceneAssetManifest.js'
import { consolidateMaterialGroups } from './consolidateMaterialGroups.js'

function loadSceneAsset(url: string) {
   return new Promise((resolve, reject) => {
      // Each model owns its dependencies, including textures discovered while parsing.
      const manager = new LoadingManager()
      let result: unknown
      manager.onLoad = () => resolve(result)
      manager.onError = (item) => reject(new Error(`Unable to load ${item}`))
      const loader = url.endsWith('.fbx') ? new FBXLoader(manager) : new GLTFLoader(manager)
      loader.load(
         url,
         (asset) => {
            result = url.endsWith('.fbx') ? consolidateMaterialGroups(asset) : asset
         },
         undefined,
         reject
      )
   })
}

export const sceneAssets = createAssetBatch(sceneAssetUrls, loadSceneAsset)
export const readSceneAsset = sceneAssets.read
