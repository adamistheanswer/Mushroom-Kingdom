/**
 * Decides device class once, at module load, and never revisits it.
 *
 * This deliberately does not use the viewport-width useIsMobile hook the UI uses: a phone turned
 * to landscape is wider than 640px but is still a phone, and the renderer settings that hang off
 * this answer (blade budgets, shadow map size, fog distance) all bake into buffers and shaders at
 * mount. Re-deciding mid-session would rebuild every one of them in a single frame.
 */
export function isHandheldDevice(): boolean {
   const coarsePointer = window.matchMedia('(pointer: coarse)').matches
   const shortestScreenEdge = Math.min(window.screen.width, window.screen.height)

   return coarsePointer && shortestScreenEdge <= 900
}
