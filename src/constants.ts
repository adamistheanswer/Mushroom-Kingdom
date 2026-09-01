export const SIGNAL_OFFER = 'signalOffer'
export const SIGNAL_ANSWER = 'signalAnswer'
export const SIGNAL_ICE_CANDIDATE = 'signalIceCandidate'

export const WORLD_SIZE = 1000
export const WORLD_HALF_SIZE = WORLD_SIZE / 2
export const PLAYER_WORLD_BOUNDARY_PADDING = 15
export const PLAYER_WORLD_LIMIT = WORLD_HALF_SIZE - PLAYER_WORLD_BOUNDARY_PADDING

// Direction the moonlight arrives from. Shared so the moon in the sky and the light that
// casts the shadows can never drift out of agreement.
export const MOONLIGHT_OFFSET: [number, number, number] = [-240, 300, 0]
