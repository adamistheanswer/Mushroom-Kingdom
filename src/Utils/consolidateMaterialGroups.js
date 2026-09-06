import { mergeGroups } from 'three/addons/utils/BufferGeometryUtils.js'

// Run once during asset loading, before geometry reaches the renderer. Reordering opaque
// triangles lets repeated material groups share a draw in both colour and shadow passes.
export function consolidateMaterialGroups(model) {
   model.traverse((mesh) => {
      if (!mesh.isMesh || !Array.isArray(mesh.material)) return

      const { geometry, material } = mesh
      const { groups, drawRange } = geometry
      if (material.some((entry) => entry.transparent)) return
      if (drawRange.start !== 0 || drawRange.count !== Infinity) return
      if (groups.length <= new Set(groups.map((group) => group.materialIndex)).size) return

      // Leave partial/overlapping groups alone: mergeGroups rebuilds the index from groups.
      const count = geometry.index?.count ?? geometry.attributes.position.count
      let end = 0
      for (const group of [...groups].sort((a, b) => a.start - b.start)) {
         if (group.start !== end || group.count % 3 !== 0 || !material[group.materialIndex]) return
         end += group.count
      }
      if (end !== count) return

      mergeGroups(geometry)
   })
   return model
}
