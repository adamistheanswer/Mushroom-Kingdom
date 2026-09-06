import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial } from 'three'
import { FBXLoader } from 'three-stdlib'
import { consolidateMaterialGroups } from './consolidateMaterialGroups.js'
import { modelUrlMap } from './sceneAssetManifest.js'

function verticesByMaterial(geometry) {
   const result = new Map()
   for (const group of geometry.groups) {
      if (!result.has(group.materialIndex)) result.set(group.materialIndex, [])
      const vertices = result.get(group.materialIndex)
      for (let i = group.start; i < group.start + group.count; i++) {
         vertices.push(geometry.index ? geometry.index.getX(i) : i)
      }
   }
   return result
}

test('forest assets keep every triangle, winding and material assignment', (t) => {
   let before = 0
   let after = 0
   for (const path of new Set(Object.values(modelUrlMap))) {
      const bytes = readFileSync(new URL(`../../public/${path.slice(3)}`, import.meta.url))
      const model = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
      const snapshots = new Map()
      model.traverse((mesh) => {
         if (!mesh.isMesh) return
         snapshots.set(mesh, {
            vertices: verticesByMaterial(mesh.geometry),
            attributes: { ...mesh.geometry.attributes },
            material: mesh.material,
         })
         before += mesh.geometry.groups.length
      })

      consolidateMaterialGroups(model)
      for (const [mesh, snapshot] of snapshots) {
         assert.deepEqual(verticesByMaterial(mesh.geometry), snapshot.vertices, path)
         assert.equal(mesh.material, snapshot.material)
         for (const [name, attribute] of Object.entries(snapshot.attributes)) {
            assert.equal(mesh.geometry.attributes[name], attribute)
         }
         after += mesh.geometry.groups.length
         const index = mesh.geometry.index
         const groups = mesh.geometry.groups.map((group) => ({ ...group }))
         consolidateMaterialGroups(model)
         assert.equal(mesh.geometry.index, index, 'repeat preparation does not rebuild buffers')
         assert.deepEqual(mesh.geometry.groups, groups)
      }
   }
   assert.ok(after < before / 2, 'consolidation substantially reduces forest groups')
   t.diagnostic(`Forest material groups: ${before} -> ${after}`)
})

function indexedMesh() {
   const geometry = new BufferGeometry()
   geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3))
   geometry.setIndex([0, 1, 2, 2, 1, 3, 3, 2, 0])
   geometry.addGroup(0, 3, 0)
   geometry.addGroup(3, 3, 1)
   geometry.addGroup(6, 3, 0)
   return new Mesh(geometry, [new MeshBasicMaterial(), new MeshBasicMaterial()])
}

test('indexed geometry retains its vertex references and winding', () => {
   const mesh = indexedMesh()
   const before = verticesByMaterial(mesh.geometry)
   consolidateMaterialGroups(mesh)
   assert.equal(mesh.geometry.groups.length, 2)
   assert.deepEqual(verticesByMaterial(mesh.geometry), before)
})

test('transparent materials, partial draw ranges and incomplete groups are left unchanged', () => {
   for (const setup of [
      (mesh) => { mesh.material[0].transparent = true },
      (mesh) => { mesh.geometry.setDrawRange(3, 6) },
      (mesh) => { mesh.geometry.groups[0].count = 0 },
   ]) {
      const mesh = indexedMesh()
      setup(mesh)
      const index = mesh.geometry.index
      const groups = mesh.geometry.groups.map((group) => ({ ...group }))
      consolidateMaterialGroups(mesh)
      assert.equal(mesh.geometry.index, index)
      assert.deepEqual(mesh.geometry.groups, groups)
   }
})
