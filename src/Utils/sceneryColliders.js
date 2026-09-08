import { Box3, Matrix4, Quaternion, Vector3 } from 'three'
import { setInstanceScale } from './sceneryTransforms.js'

export const isSolidScenery = (id) => id < 9 || [10, 11, 12, 16, 17].includes(id)

// Measure in the same model-local space used by Forest's instanced meshes.
export function measureScenery(model, tree) {
   model.updateMatrixWorld(true)
   const inverse = new Matrix4().copy(model.matrixWorld).invert()
   const points = []
   const indices = []
   const bounds = new Box3()
   model.traverse((child) => {
      if (!child.isMesh) return
      const matrix = new Matrix4().multiplyMatrices(inverse, child.matrixWorld)
      const positions = child.geometry.getAttribute('position')
      const offset = points.length
      for (let i = 0; i < positions.count; i++) {
         const point = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix)
         points.push(point)
         bounds.expandByPoint(point)
      }
      if (!tree) {
         const index = child.geometry.getIndex()
         const count = index ? index.count : positions.count
         const mirrored = matrix.determinant() < 0
         for (let i = 0; i < count; i += 3) {
            const a = offset + (index ? index.getX(i) : i)
            const b = offset + (index ? index.getX(i + 1) : i + 1)
            const c = offset + (index ? index.getX(i + 2) : i + 2)
            // Preserve outward-facing triangles for mirrored model parts.
            if (mirrored) indices.push(a, c, b)
            else indices.push(a, b, c)
         }
      }
   })
   if (!tree || bounds.isEmpty()) return { bounds, points, indices }

   // Only the base of a tree is solid: canopy bounds would block open space.
   const trunk = new Box3()
   const cutoff = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.1
   for (const point of points) {
      if (point.y <= cutoff) trunk.expandByPoint(point)
   }
   return { bounds: trunk }
}

export function sceneryCollider(entity, measurement) {
   const { bounds, points, indices } = measurement
   if (bounds.isEmpty()) return null
   const scale = new Vector3()
   setInstanceScale(entity, scale)
   const center = bounds.getCenter(new Vector3()).multiply(scale)
   const half = bounds.getSize(new Vector3()).multiply(scale).multiplyScalar(0.5)
   const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), entity[4])
   if (entity[0] >= 9) {
      const vertices = new Float32Array(points.length * 3)
      points.forEach((point, index) => {
         vertices[index * 3] = point.x * scale.x
         vertices[index * 3 + 1] = point.y * scale.y
         vertices[index * 3 + 2] = point.z * scale.z
      })
      return {
         type: 'trimesh',
         x: entity[1],
         y: 0,
         z: entity[2],
         vertices,
         indices: new Uint32Array(indices),
         rotation,
      }
   }
   center.applyQuaternion(rotation)
   // Trees still use simple trunk cylinders, leaving the canopy passable.
   return {
      type: entity[0] < 9 ? 'cylinder' : 'box',
      x: entity[1] + center.x,
      z: entity[2] + center.z,
      halfX: Math.max(half.x, 0.1),
      halfZ: Math.max(half.z, 0.1),
      rotation,
   }
}
