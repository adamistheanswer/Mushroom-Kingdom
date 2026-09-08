import test from 'node:test'
import assert from 'node:assert/strict'
import { BoxGeometry, ConeGeometry, Group, Mesh, Quaternion, Vector3 } from 'three'
import { createSceneryPhysics, initializeSceneryPhysics } from './sceneryPhysics.js'
import { isSolidScenery, measureScenery, sceneryCollider } from './sceneryColliders.js'

await initializeSceneryPhysics()
const obstacle = { type: 'box', x: 20, z: 0, halfX: 2, halfZ: 10, rotation: new Quaternion() }

test('mesh colliders preserve open gaps inside model bounds and block solid parts', () => {
   const model = new Group()
   const geometry = new BoxGeometry(20, 30, 4)
   for (const z of [-12, 12]) {
      const mesh = new Mesh(geometry)
      mesh.position.set(0, 15, z)
      model.add(mesh)
   }
   const shape = sceneryCollider([11, 0, 0, 1, 0], measureScenery(model, false))
   const physics = createSceneryPhysics([shape], 2, 485)
   try {
      const gap = physics.move(new Vector3(-30, 0, 0), new Vector3(60, 0, 0), new Vector3())
      assert.ok(gap.x > 29.9, `open gap blocked at ${gap.x}`)
      const solid = physics.move(new Vector3(-30, 0, 12), new Vector3(60, 0, 0), new Vector3())
      assert.ok(solid.x < -10, `solid geometry crossed at ${solid.x}`)
   } finally {
      physics.dispose()
      geometry.dispose()
   }
})

test('sloping rock geometry blocks repeated ground-plane movement without climbing', () => {
   const model = new Group()
   const geometry = new ConeGeometry(20, 20, 8)
   const mesh = new Mesh(geometry)
   mesh.position.y = 10
   model.add(mesh)
   const shape = sceneryCollider([16, 0, 0, 1, 0.4], measureScenery(model, false))
   const physics = createSceneryPhysics([shape], 2, 485)
   try {
      const position = new Vector3(-40, 0, 0)
      for (let i = 0; i < 200; i++) physics.move(position, new Vector3(1, 0, 0), position)
      assert.ok(position.x < -10, `passed into rock: ${position.x}`)
      assert.ok(position.x > -24, `blocked outside rock: ${position.x}`)
      assert.equal(position.y, 0)
   } finally {
      physics.dispose()
      geometry.dispose()
   }
})

test('sweeps stop at scenery even when a move crosses the entire obstacle', () => {
   const physics = createSceneryPhysics([obstacle], 5, 485)
   try {
      const result = physics.move(new Vector3(), new Vector3(100, 0, 0), new Vector3())
      assert.ok(result.x > 12.8 && result.x < 13, `x=${result.x}`)
      assert.equal(result.y, 0)
   } finally {
      physics.dispose()
   }
})

test('diagonal movement slides along scenery and can move away again', () => {
   const physics = createSceneryPhysics([obstacle], 5, 485)
   try {
      const result = physics.move(new Vector3(12.9, 0, 0), new Vector3(2, 0, 2), new Vector3())
      assert.ok(result.x < 13)
      assert.ok(result.z > 1.9)
      const away = physics.move(result, new Vector3(-2, 0, 0), new Vector3())
      assert.ok(away.x < 11)
   } finally {
      physics.dispose()
   }
})

test('tree cylinders block movement and map boundaries permit sliding', () => {
   const physics = createSceneryPhysics([{ ...obstacle, type: 'cylinder', halfZ: 2 }], 5, 485)
   try {
      const tree = physics.move(new Vector3(), new Vector3(100, 0, 0), new Vector3())
      assert.ok(tree.x > 12.8 && tree.x < 13)
      const edge = physics.move(new Vector3(484, 0, 50), new Vector3(10, 0, 10), new Vector3())
      assert.ok(edge.x <= 485 && edge.x > 484)
      assert.ok(edge.z > 59.9)
   } finally {
      physics.dispose()
   }
})

test('tree measurements exclude canopy and instance transforms match rendering', () => {
   const model = new Group()
   const trunk = new Mesh(new BoxGeometry(2, 20, 2))
   trunk.position.set(3, 10, 0)
   const canopy = new Mesh(new BoxGeometry(30, 20, 30))
   canopy.position.set(3, 30, 0)
   model.add(trunk, canopy)
   const bounds = measureScenery(model, true)
   assert.equal(bounds.bounds.max.x - bounds.bounds.min.x, 2)
   const shape = sceneryCollider([0, 100, 200, 1, Math.PI / 2], bounds)
   assert.ok(Math.abs(shape.x - 100) < 0.001)
   assert.ok(shape.z < 198)
   assert.ok(shape.halfX < 1.1)
   for (const id of [0, 8, 10, 11, 12, 16, 17]) assert.equal(isSolidScenery(id), true)
   for (const id of [9, 13, 14, 15, 18, 26]) assert.equal(isSolidScenery(id), false)
   trunk.geometry.dispose()
   canopy.geometry.dispose()
})
