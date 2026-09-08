import RAPIER from '@dimforge/rapier3d-compat'

let initialization
export function initializeSceneryPhysics() {
   initialization ??= RAPIER.init()
   return initialization
}

export function createSceneryPhysics(shapes, radius, worldLimit) {
   const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
   for (const shape of shapes) {
      const descriptor =
         shape.type === 'trimesh'
            ? RAPIER.ColliderDesc.trimesh(shape.vertices, shape.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
            : shape.type === 'cylinder'
              ? RAPIER.ColliderDesc.cylinder(20, Math.max(shape.halfX, shape.halfZ))
              : RAPIER.ColliderDesc.cuboid(shape.halfX, 20, shape.halfZ)
      world.createCollider(descriptor.setTranslation(shape.x, shape.y ?? 10, shape.z).setRotation(shape.rotation))
   }
   // Walls keep the player's centre inside the existing map limit, while
   // allowing the controller to slide along the edge.
   for (const sign of [-1, 1]) {
      const edge = sign * (worldLimit + radius + 1)
      world.createCollider(RAPIER.ColliderDesc.cuboid(1, 20, worldLimit + radius + 2).setTranslation(edge, 10, 0))
      world.createCollider(RAPIER.ColliderDesc.cuboid(worldLimit + radius + 2, 20, 1).setTranslation(0, 10, edge))
   }
   const player = world.createCollider(RAPIER.ColliderDesc.capsule(2, radius).setTranslation(0, radius + 2, 0))
   const controller = world.createCharacterController(0.05)
   controller.setSlideEnabled(true)
   controller.setMaxSlopeClimbAngle(0)
   controller.disableAutostep()
   controller.disableSnapToGround()
   world.step()

   return {
      move(position, displacement, target) {
         player.setTranslation({ x: position.x, y: radius + 2, z: position.z })
         world.step()
         controller.computeColliderMovement(player, displacement)
         const movement = controller.computedMovement()
         target.set(position.x + movement.x, position.y, position.z + movement.z)
         return target
      },
      dispose() {
         world.free()
      },
   }
}
