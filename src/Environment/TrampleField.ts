import {
   BufferAttribute,
   BufferGeometry,
   Camera,
   ClampToEdgeWrapping,
   Color,
   CustomBlending,
   InstancedBufferAttribute,
   InstancedBufferGeometry,
   LinearFilter,
   MaxEquation,
   Mesh,
   NoBlending,
   NoColorSpace,
   OneFactor,
   RGBAFormat,
   Scene,
   ShaderMaterial,
   UnsignedByteType,
   Vector2,
   Vector3,
   WebGLRenderer,
   WebGLRenderTarget,
} from 'three'
import type { RemotePlayerPosition } from '../State/playerPositionsStore'

/**
 * A persistent, world space record of where the grass has been walked on.
 *
 * The field is a small RGBA8 texture covering a window of the world that follows the local
 * player. Every frame it is decayed by one full screen pass - that is the grass springing back
 * up - and then every nearby player stamps a single instanced quad into it. Nothing about the
 * cost depends on how many people are on the server: the texture is a fixed size, the decay is
 * one draw, and all the stamps together are one instanced draw. The grass shader reads the
 * result with a single texture fetch, replacing the fixed length displacer loop it used to run
 * for every blade.
 *
 * Channel encoding. Direction has to survive `max` blending, which rules out storing a signed
 * vector in two channels, so the push is split across four unsigned axes:
 *
 *    R = push towards +X   G = push towards -X   B = push towards +Z   A = push towards -Z
 *
 * so `push = vec2(R - G, B - A)` and `bend = length(push)`. Because a push only ever lights up
 * one channel of each opposing pair, the smallest of the four channels is whatever was added to
 * all four equally - an isotropic press with no direction at all, which is exactly what a foot
 * landing does. So `crush = min(R, G, B, A)` falls out of the same fetch for free, and the two
 * can then be given different recovery rates: blades shoved aside stand back up in about a
 * second, while the crushed core of a footprint takes the better part of a minute.
 */

const TRAMPLE_WORLD_SIZE = 160
const TRAMPLE_WORLD_HALF_SIZE = TRAMPLE_WORLD_SIZE / 2

// The quad a single player stamps. It has to cover the clearance disc, both planted feet and
// the outward rim around them, and nothing more - every unit of radius here is fill rate.
const STAMP_RADIUS = 9

// Sized against the avatar, which is far bigger than it first looks: nameplates float at y=13,
// player collision keeps a ten unit gap, and the spawn ring opens to about nine. Against a
// character that size a three unit push leaves a whole standing ring of blades - themselves up
// to about seven tall - intersecting the legs and torso. This term exists purely to clear that
// silhouette, so it is kept separate from the wake dimensions below and can be sized to the
// body without lengthening or widening the trail.
const CLEARANCE_RADIUS = 5.6
// Travelling stretches the disc along the direction of movement, since the leading shoulder
// reaches further ahead than a standing character does, and tightens it overall: a standing
// character has to hold blades off it in every direction at once, where a moving one is only
// ever passing through, and the wake behind carries what it leaves.
const CLEARANCE_MOVING_STRETCH = 1.2
const CLEARANCE_MOVING_SCALE = 0.9
// How much of the disc holds full strength before it starts falling off.
const BODY_PLATEAU = 0.5

const BODY_LENGTH = 3.6
const PARTING_WIDTH = 3.9
const PARTING_STRENGTH = 1.0
const SHOVE_STRENGTH = 0.85
const SPLAY_STRENGTH = 3

const FOOT_SPACING = 0.85
const FOOT_LEAD = 1.15
const FOOT_RADIUS = 1.75
const FOOT_CRUSH = 0.92
const FOOT_RIM = 0.5
const STRIDE_LENGTH = 5.5
const FOOT_RESET_DISTANCE = 3.4

// Recovery, per second. The exponential term is the visible spring back; the linear floor is
// what actually gets the last few percent to zero, since an exponential alone leaves a faint
// permanent ghost of every path ever walked.
const BEND_RECOVERY = 2.1
const BEND_FLOOR = 0.06
const CRUSH_RECOVERY = 0.2
const CRUSH_FLOOR = 0.015

// Remote avatars are lerped towards their last network position at this rate in RemotePlayers,
// so stamping has to use the same rate or the trail will not line up with the feet drawing it.
const REMOTE_POSITION_LERP_RATE = 16
const MOVING_SPEED_THRESHOLD = 0.35
const FULL_SPEED = 18

const MAX_STAMPS = 64

const glsl = {
   stampRadius: STAMP_RADIUS.toFixed(2),
   bodyLength: BODY_LENGTH.toFixed(2),
   clearanceRadius: CLEARANCE_RADIUS.toFixed(2),
   clearanceStretch: CLEARANCE_MOVING_STRETCH.toFixed(2),
   clearanceMovingScale: CLEARANCE_MOVING_SCALE.toFixed(2),
   bodyPlateau: BODY_PLATEAU.toFixed(2),
   partingWidth: PARTING_WIDTH.toFixed(2),
   partingStrength: PARTING_STRENGTH.toFixed(2),
   shoveStrength: SHOVE_STRENGTH.toFixed(2),
   splayStrength: SPLAY_STRENGTH.toFixed(2),
   footRadius: FOOT_RADIUS.toFixed(2),
   footCrush: FOOT_CRUSH.toFixed(2),
   footRim: FOOT_RIM.toFixed(2),
   bendRecovery: BEND_RECOVERY.toFixed(3),
   bendFloor: BEND_FLOOR.toFixed(3),
   crushRecovery: CRUSH_RECOVERY.toFixed(3),
   crushFloor: CRUSH_FLOOR.toFixed(3),
}

const fullScreenVertexShader = `
   void main() {
      gl_Position = vec4(position.xy, 0.0, 1.0);
   }
`

/**
 * Decay and reprojection in one pass. The window centre is snapped to whole texels on the CPU,
 * so the shift below is an exact integer texel offset and the copy is lossless. An unsnapped
 * window would resample the whole field every frame and smear the footprints into mush inside
 * of a second.
 */
const decayFragmentShader = `
   precision highp float;

   uniform sampler2D uPrevious;
   uniform vec2 uShift;
   uniform vec2 uTexelSize;
   uniform float uDelta;
   uniform float uNoiseSeed;

   void main() {
      vec2 uv = gl_FragCoord.xy * uTexelSize + uShift;

      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
         gl_FragColor = vec4(0.0);
         return;
      }

      vec4 previous = texture2D(uPrevious, uv);
      float crush = min(min(previous.r, previous.g), min(previous.b, previous.a));
      vec4 bend = previous - crush;

      bend = max(vec4(0.0), bend * exp(-uDelta * ${glsl.bendRecovery}) - uDelta * ${glsl.bendFloor});
      crush = max(0.0, crush * exp(-uDelta * ${glsl.crushRecovery}) - uDelta * ${glsl.crushFloor});

      // Eight bits cannot express a slow decay: a footprint fading over half a minute moves by
      // well under one 255th per frame, the write rounds back to the value it started from, and
      // the print never fades at all. Dithering by half a quantisation step makes the rounding
      // go the right way often enough that the average matches the intended rate.
      float dither = fract(sin(dot(gl_FragCoord.xy + uNoiseSeed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;

      gl_FragColor = max(vec4(0.0), bend + crush + dither / 255.0);
   }
`

const stampVertexShader = `
   attribute vec2 aCentre;
   attribute vec2 aForward;
   attribute vec4 aFeet;
   attribute vec2 aParams;

   uniform vec2 uWindowCentre;
   uniform float uInverseHalfSize;

   varying vec2 vWorld;
   varying vec2 vCentre;
   varying vec2 vForward;
   varying vec4 vFeet;
   varying vec2 vParams;

   void main() {
      vec2 world = aCentre + position.xy * ${glsl.stampRadius};

      vWorld = world;
      vCentre = aCentre;
      vForward = aForward;
      vFeet = aFeet;
      vParams = aParams;

      gl_Position = vec4((world - uWindowCentre) * uInverseHalfSize, 0.0, 1.0);
   }
`

/**
 * One player's mark on the field. Three body effects, all in world units around the player: the
 * body parts blades out to either side of the line of travel, shoves the ones directly ahead of
 * it forwards, and splays the ones it is standing over outwards. Each planted foot then presses
 * its own patch flat, with an outward rim around the edge of the print.
 */
const stampFragmentShader = `
   precision highp float;

   varying vec2 vWorld;
   varying vec2 vCentre;
   varying vec2 vForward;
   varying vec4 vFeet;
   varying vec2 vParams;

   float footPress(vec2 foot, out vec2 rim) {
      vec2 fromFoot = vWorld - foot;
      float distanceFromFoot = length(fromFoot);
      float press = 1.0 - smoothstep(${glsl.footRadius} * 0.35, ${glsl.footRadius}, distanceFromFoot);

      // The rim peaks at the edge of the print rather than its centre: blades directly under a
      // foot go straight down, and it is the ones at the boundary that get shouldered aside.
      rim = normalize(fromFoot + vec2(0.0001, -0.0002)) *
         press * smoothstep(0.0, ${glsl.footRadius} * 0.7, distanceFromFoot);

      return press;
   }

   void main() {
      vec2 forward = vForward;
      vec2 right = vec2(-forward.y, forward.x);
      vec2 fromCentre = vWorld - vCentre;
      float alongTravel = dot(fromCentre, forward);
      float acrossTravel = dot(fromCentre, right);
      float speed = vParams.x;
      float strength = vParams.y;

      // Parting is the dominant effect of walking through long grass and the one that leaves a
      // corridor behind. Blades go sideways away from the line of travel, so the two halves of
      // the trail hold opposite directions and the gap between them reads as an opening.
      float alongFade = 1.0 - smoothstep(${glsl.bodyLength} * 0.35, ${glsl.bodyLength} * 1.55, abs(alongTravel));
      float acrossFade = 1.0 - smoothstep(0.25, ${glsl.partingWidth}, abs(acrossTravel));
      // Parting is sideways relative to a heading, and a standing player has no meaningful
      // heading - only the last one they happened to stop on. Backing it right off at rest
      // leaves the radial splay below to set the direction on its own, so idle grass leans
      // straight away from the character rather than off at whatever angle they last faced.
      float parting = alongFade * acrossFade * mix(0.2, 1.0, speed) * ${glsl.partingStrength};

      float ahead = smoothstep(-0.4, 1.1, alongTravel) *
         (1.0 - smoothstep(${glsl.bodyLength} * 0.5, ${glsl.bodyLength} * 1.7, alongTravel)) * acrossFade;
      float shove = ahead * speed * ${glsl.shoveStrength};

      // The clearance disc: a plain circle when someone is standing, so they push evenly all
      // round rather than along whichever way they last happened to be facing, stretching along
      // the direction of travel once they move.
      float clearanceAcross = ${glsl.clearanceRadius} * mix(1.0, ${glsl.clearanceMovingScale}, speed);
      float clearanceAlong = clearanceAcross * mix(1.0, ${glsl.clearanceStretch}, speed);
      float bodyDistance = length(vec2(alongTravel / clearanceAlong, acrossTravel / clearanceAcross));
      float body = 1.0 - smoothstep(${glsl.bodyPlateau}, 1.0, bodyDistance);
      // This is the only term holding blades out of the character, standing or moving, so it
      // stays strong at speed rather than handing over to the wake. It overdrives well past a
      // full push on purpose: the push is clamped to one further down, so the excess does not
      // bend anything harder, it just widens the band that reaches full bend before the falloff
      // starts.
      float splay = body * mix(1.0, 0.62, speed) * ${glsl.splayStrength};

      vec2 leftRim;
      vec2 rightRim;
      float leftPress = footPress(vFeet.xy, leftRim);
      float rightPress = footPress(vFeet.zw, rightRim);
      float press = max(leftPress, rightPress);

      vec2 push =
         right * sign(acrossTravel) * parting +
         forward * shove +
         normalize(fromCentre + vec2(0.0001, -0.0002)) * splay +
         (leftRim + rightRim) * ${glsl.footRim};

      float pushLength = length(push);
      vec2 bendVector = push / max(pushLength, 0.0001) * min(1.0, pushLength) * strength;
      float crush = press * ${glsl.footCrush} * strength;

      gl_FragColor = min(
         vec4(1.0),
         vec4(max(0.0, bendVector.x), max(0.0, -bendVector.x), max(0.0, bendVector.y), max(0.0, -bendVector.y)) +
            crush
      );
   }
`

interface Walker {
   position: Vector2
   velocity: Vector2
   direction: Vector2
   leftFoot: Vector2
   rightFoot: Vector2
   strideDistance: number
   nextFootIsLeft: boolean
   seenFrame: number
   initialised: boolean
}

function smoothstep(edge0: number, edge1: number, value: number) {
   const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0 || 1)))

   return t * t * (3 - 2 * t)
}

function createWalker(x: number, z: number): Walker {
   return {
      position: new Vector2(x, z),
      velocity: new Vector2(0, 0),
      direction: new Vector2(0.72, 0.42).normalize(),
      leftFoot: new Vector2(x, z),
      rightFoot: new Vector2(x, z),
      strideDistance: 0,
      nextFootIsLeft: true,
      seenFrame: -1,
      initialised: false,
   }
}

function plantFoot(walker: Walker, foot: Vector2, side: number) {
   foot.set(
      walker.position.x - walker.direction.y * FOOT_SPACING * side + walker.direction.x * FOOT_LEAD,
      walker.position.y + walker.direction.x * FOOT_SPACING * side + walker.direction.y * FOOT_LEAD
   )
}

/**
 * Advances one player's gait. The feet are the only piece of state that really matters here: a
 * foot stays put in the world for the half stride it is on the ground, so stamping it every
 * frame lands on exactly the same texels and leaves a crisp print, where following the body
 * would only smear a band.
 */
function stepWalker(walker: Walker, targetX: number, targetZ: number, delta: number, snapToTarget: boolean) {
   const previousX = walker.position.x
   const previousZ = walker.position.y

   if (snapToTarget || !walker.initialised) {
      walker.position.set(targetX, targetZ)
   } else {
      const smoothing = 1 - Math.exp(-REMOTE_POSITION_LERP_RATE * delta)

      walker.position.x += (targetX - walker.position.x) * smoothing
      walker.position.y += (targetZ - walker.position.y) * smoothing
   }

   if (!walker.initialised) {
      walker.initialised = true
      walker.velocity.set(0, 0)
      plantFoot(walker, walker.leftFoot, 1)
      plantFoot(walker, walker.rightFoot, -1)
      return
   }

   const movedX = walker.position.x - previousX
   const movedZ = walker.position.y - previousZ
   const moved = Math.hypot(movedX, movedZ)
   const safeDelta = Math.max(delta, 1 / 240)
   const instantSpeed = moved / safeDelta
   // Attack faster than release, so blades react the moment someone starts moving but the trail
   // does not snap to a new direction the instant they stop.
   const lerp = Math.min(1, instantSpeed > walker.velocity.length() ? delta * 14 : delta * 4)

   walker.velocity.x += (movedX / safeDelta - walker.velocity.x) * lerp
   walker.velocity.y += (movedZ / safeDelta - walker.velocity.y) * lerp

   const speed = walker.velocity.length()

   if (speed > MOVING_SPEED_THRESHOLD) {
      walker.direction.set(walker.velocity.x / speed, walker.velocity.y / speed)
   }

   walker.strideDistance += moved

   if (walker.strideDistance >= STRIDE_LENGTH) {
      walker.strideDistance %= STRIDE_LENGTH
      plantFoot(walker, walker.nextFootIsLeft ? walker.leftFoot : walker.rightFoot, walker.nextFootIsLeft ? 1 : -1)
      walker.nextFootIsLeft = !walker.nextFootIsLeft
   }

   // Catches teleports, spawns and anyone who has drifted away from their own prints. Without
   // it a player who respawns across the map drags one stamp between their old feet and their
   // new body.
   if (walker.leftFoot.distanceTo(walker.position) > FOOT_RESET_DISTANCE) {
      plantFoot(walker, walker.leftFoot, 1)
   }

   if (walker.rightFoot.distanceTo(walker.position) > FOOT_RESET_DISTANCE) {
      plantFoot(walker, walker.rightFoot, -1)
   }
}

export function createTrampleField(mapSize: number) {
   const texelWorldSize = TRAMPLE_WORLD_SIZE / mapSize

   const createTarget = () => {
      const target = new WebGLRenderTarget(mapSize, mapSize, {
         format: RGBAFormat,
         type: UnsignedByteType,
         minFilter: LinearFilter,
         magFilter: LinearFilter,
         wrapS: ClampToEdgeWrapping,
         wrapT: ClampToEdgeWrapping,
         depthBuffer: false,
         stencilBuffer: false,
         generateMipmaps: false,
      })

      target.texture.colorSpace = NoColorSpace

      return target
   }

   let currentTarget = createTarget()
   let previousTarget = createTarget()
   let cleared = false

   const camera = new Camera()

   const fullScreenGeometry = new BufferGeometry()
   fullScreenGeometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
   )

   const decayMaterial = new ShaderMaterial({
      uniforms: {
         uPrevious: { value: previousTarget.texture },
         uShift: { value: new Vector2(0, 0) },
         uTexelSize: { value: new Vector2(1 / mapSize, 1 / mapSize) },
         uDelta: { value: 0 },
         uNoiseSeed: { value: 0 },
      },
      vertexShader: fullScreenVertexShader,
      fragmentShader: decayFragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
   })

   const decayMesh = new Mesh(fullScreenGeometry, decayMaterial)
   decayMesh.frustumCulled = false

   const stampGeometry = new InstancedBufferGeometry()
   stampGeometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3)
   )
   stampGeometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1))

   const centres = new InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 2), 2)
   const forwards = new InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 2), 2)
   const feet = new InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 4), 4)
   const params = new InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 2), 2)

   stampGeometry.setAttribute('aCentre', centres)
   stampGeometry.setAttribute('aForward', forwards)
   stampGeometry.setAttribute('aFeet', feet)
   stampGeometry.setAttribute('aParams', params)
   stampGeometry.instanceCount = 0

   const windowCentre = new Vector2(0, 0)

   const stampMaterial = new ShaderMaterial({
      uniforms: {
         uWindowCentre: { value: windowCentre },
         uInverseHalfSize: { value: 1 / TRAMPLE_WORLD_HALF_SIZE },
      },
      vertexShader: stampVertexShader,
      fragmentShader: stampFragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendEquation: MaxEquation,
      blendSrc: OneFactor,
      blendDst: OneFactor,
   })

   const stampMesh = new Mesh(stampGeometry, stampMaterial)
   stampMesh.frustumCulled = false

   const decayScene = new Scene().add(decayMesh)
   const stampScene = new Scene().add(stampMesh)

   const walkers = new Map<string, Walker>()
   const localWalker = createWalker(0, 0)
   const previousCentre = new Vector2(0, 0)
   const clearColor = new Color()

   // xy - window centre in world space, z - one over its world size.
   const windowUniform = new Vector3(0, 0, 1 / TRAMPLE_WORLD_SIZE)

   let frame = 0

   function writeStamp(index: number, walker: Walker, strength: number) {
      const speed = Math.min(1, walker.velocity.length() / FULL_SPEED)

      centres.array[index * 2] = walker.position.x
      centres.array[index * 2 + 1] = walker.position.y
      forwards.array[index * 2] = walker.direction.x
      forwards.array[index * 2 + 1] = walker.direction.y
      feet.array[index * 4] = walker.leftFoot.x
      feet.array[index * 4 + 1] = walker.leftFoot.y
      feet.array[index * 4 + 2] = walker.rightFoot.x
      feet.array[index * 4 + 3] = walker.rightFoot.y
      params.array[index * 2] = speed
      params.array[index * 2 + 1] = strength
   }

   /**
    * A player only earns a stamp if their quad actually overlaps the window, and they fade out
    * over the last few units so that nobody's trail pops into existence at the boundary.
    */
   function stampStrength(x: number, z: number) {
      const offset = Math.max(Math.abs(x - windowCentre.x), Math.abs(z - windowCentre.y))

      return 1 - smoothstep(TRAMPLE_WORLD_HALF_SIZE - STAMP_RADIUS - 6, TRAMPLE_WORLD_HALF_SIZE - STAMP_RADIUS, offset)
   }

   function update(
      renderer: WebGLRenderer,
      delta: number,
      localX: number,
      localZ: number,
      remotePlayers: Map<string, RemotePlayerPosition>
   ) {
      const step = Math.min(delta, 1 / 20)

      frame++

      // Snapping the window to whole texels is what keeps the reprojection in the decay pass an
      // exact copy rather than a resample.
      windowCentre.set(
         Math.round(localX / texelWorldSize) * texelWorldSize,
         Math.round(localZ / texelWorldSize) * texelWorldSize
      )

      stepWalker(localWalker, localX, localZ, step, true)
      writeStamp(0, localWalker, 1)

      let count = 1

      for (const player of remotePlayers.values()) {
         if (count >= MAX_STAMPS) {
            break
         }

         let walker = walkers.get(player.id)

         if (!walker) {
            walker = createWalker(player.targetPosition.x, player.targetPosition.z)
            walkers.set(player.id, walker)
         }

         walker.seenFrame = frame

         const strength = stampStrength(player.targetPosition.x, player.targetPosition.z)

         // Someone outside the window costs nothing beyond the map entry. Their gait restarts
         // when they walk back in, which is invisible - there is no history there to match.
         if (strength <= 0.001) {
            walker.initialised = false
            continue
         }

         stepWalker(walker, player.targetPosition.x, player.targetPosition.z, step, false)
         writeStamp(count, walker, strength)
         count++
      }

      for (const [id, walker] of walkers) {
         if (walker.seenFrame !== frame) {
            walkers.delete(id)
         }
      }

      centres.needsUpdate = true
      forwards.needsUpdate = true
      feet.needsUpdate = true
      params.needsUpdate = true
      stampGeometry.instanceCount = count

      const restoreTarget = renderer.getRenderTarget()
      const restoreAutoClear = renderer.autoClear
      const restoreClearAlpha = renderer.getClearAlpha()

      renderer.getClearColor(clearColor)
      renderer.autoClear = false

      if (!cleared) {
         renderer.setClearColor(0x000000, 0)
         renderer.setRenderTarget(currentTarget)
         renderer.clear(true, false, false)
         renderer.setRenderTarget(previousTarget)
         renderer.clear(true, false, false)
         previousCentre.copy(windowCentre)
         cleared = true
      }

      decayMaterial.uniforms.uPrevious.value = previousTarget.texture
      decayMaterial.uniforms.uDelta.value = step
      decayMaterial.uniforms.uNoiseSeed.value = (frame % 512) * 1.618
      decayMaterial.uniforms.uShift.value.set(
         (windowCentre.x - previousCentre.x) / TRAMPLE_WORLD_SIZE,
         (windowCentre.y - previousCentre.y) / TRAMPLE_WORLD_SIZE
      )

      renderer.setRenderTarget(currentTarget)
      renderer.render(decayScene, camera)
      renderer.render(stampScene, camera)

      renderer.setRenderTarget(restoreTarget)
      renderer.setClearColor(clearColor, restoreClearAlpha)
      renderer.autoClear = restoreAutoClear

      previousCentre.copy(windowCentre)
      windowUniform.set(windowCentre.x, windowCentre.y, 1 / TRAMPLE_WORLD_SIZE)

      const swap = previousTarget

      previousTarget = currentTarget
      currentTarget = swap

      return previousTarget.texture
   }

   function dispose() {
      currentTarget.dispose()
      previousTarget.dispose()
      fullScreenGeometry.dispose()
      stampGeometry.dispose()
      decayMaterial.dispose()
      stampMaterial.dispose()
      walkers.clear()
   }

   return { update, dispose, window: windowUniform, texture: () => previousTarget.texture }
}

export type TrampleField = ReturnType<typeof createTrampleField>
export { TRAMPLE_WORLD_HALF_SIZE, TRAMPLE_WORLD_SIZE }
