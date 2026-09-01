import { isHandheldDevice } from '../Utils/isHandheldDevice'

/**
 * Every setting the scene trades away on a handheld, in one place.
 *
 * These live here rather than in constants.ts because they are decided from the device rather
 * than being fixed facts about the world, and because they are the dials worth reaching for
 * first when mobile frame times slip.
 */
export const IS_HANDHELD = isHandheldDevice()

export const FOG_NEAR = 50
export const SCENE_BACKGROUND_COLOR = '#01030a'
export const SCENE_FOG_COLOR = '#050c16'

/**
 * Fog distance is the highest leverage mobile dial in the scene: it sets how wide the shadow
 * frustum has to be to hide its own cut-off, how far the far grass ring reaches, and how much
 * scenery is worth drawing at all. Pulling it in on a handheld costs view distance and gains
 * back roughly half the shadow pass.
 *
 * Do not drop this below ~175 without revisiting Grass: the far ring fades from FOG_FAR * 0.7,
 * which has to stay outside FAR_INNER_RADIUS + FAR_INNER_RAMP or a bald band opens up between
 * the two grass layers.
 */
export const FOG_FAR = IS_HANDHELD ? 220 : 300

/**
 * 4096 is what pays for a shadow frustum wide enough to reach the fog while keeping texels as
 * tight as they were when shadows only covered the player's immediate surroundings. Handhelds
 * stay at 2048: the extra depth buffer is tens of megabytes, and their screens cannot resolve
 * the difference anyway.
 */
export const SHADOW_MAP_SIZE = IS_HANDHELD ? 2048 : 4096
