export const CLIENT_UPDATE_PROTOCOL_VERSION = 3

export const CLIENT_UPDATE_FIELDS = Object.freeze({
   ACTION: 1,
   USERNAME: 2,
   MICROPHONE: 4,
})

const POSITION_SCALE = 100
const ROTATION_Y_SCALE = 10000
const HAS_OWN = Object.prototype.hasOwnProperty

function hasField(update, fieldName) {
   return HAS_OWN.call(update, fieldName)
}

/**
 * Client update batch wire format:
 *
 * clientMotionUpdates payload:
 *
 * [version, motionUpdates]
 *
 * Motion updates are high frequency and always have the same shape:
 *
 * [id, seq, xCentimeters, zCentimeters, rotationYTenThousandths]
 *
 * Y is intentionally omitted; players are grounded. Position and rotation are quantized because
 * the client already rounds them before sending.
 *
 * clientMetadataUpdates payload:
 *
 * [version, metadataUpdates]
 *
 * Metadata updates are low frequency and sparse:
 *
 * [id, seq, mask, ...values]
 *
 * The mask declares which values are present. Values are appended in this fixed order:
 * action, userName, microphone.
 */
function quantize(value, scale) {
   return Math.round(Number(value ?? 0) * scale)
}

function dequantize(value, scale) {
   return Number(value ?? 0) / scale
}

export function encodeClientMotionUpdate(update) {
   return [
      update.id,
      update.seq ?? 0,
      quantize(update.position?.[0], POSITION_SCALE),
      quantize(update.position?.[2], POSITION_SCALE),
      quantize(update.rotation?.[1], ROTATION_Y_SCALE),
   ]
}

export function encodeClientMetadataUpdate(update) {
   let mask = 0
   const values = []

   if (hasField(update, 'action')) {
      mask |= CLIENT_UPDATE_FIELDS.ACTION
      values.push(update.action)
   }

   if (hasField(update, 'userName')) {
      mask |= CLIENT_UPDATE_FIELDS.USERNAME
      values.push(update.userName)
   }

   if (hasField(update, 'microphone')) {
      mask |= CLIENT_UPDATE_FIELDS.MICROPHONE
      values.push(update.microphone === true)
   }

   return [update.id, update.seq ?? 0, mask, ...values]
}

export function hasClientMotionUpdate(update) {
   return hasField(update, 'position') || hasField(update, 'rotation')
}

export function hasClientMetadataUpdate(update) {
   return hasField(update, 'action') || hasField(update, 'userName') || hasField(update, 'microphone')
}

export function encodeClientMotionUpdateBatch(updates) {
   return [CLIENT_UPDATE_PROTOCOL_VERSION, updates.filter(hasClientMotionUpdate).map(encodeClientMotionUpdate)]
}

export function encodeClientMetadataUpdateBatch(updates) {
   return [CLIENT_UPDATE_PROTOCOL_VERSION, updates.filter(hasClientMetadataUpdate).map(encodeClientMetadataUpdate)]
}

function isClientUpdateTupleBatch(payload) {
   return (
      Array.isArray(payload) &&
      payload[0] === CLIENT_UPDATE_PROTOCOL_VERSION &&
      Array.isArray(payload[1])
   )
}

export function decodeClientMotionUpdate(tuple) {
   const [id, seq, xCentimeters, zCentimeters, rotationYTenThousandths] = tuple

   return {
      id,
      seq,
      position: [dequantize(xCentimeters, POSITION_SCALE), 0, dequantize(zCentimeters, POSITION_SCALE)],
      rotation: [0, dequantize(rotationYTenThousandths, ROTATION_Y_SCALE), 0],
   }
}

export function decodeClientMetadataUpdate(tuple) {
   const [id, seq, mask] = tuple
   const update = { id, seq }
   let valueIndex = 3

   if (mask & CLIENT_UPDATE_FIELDS.ACTION) {
      update.action = tuple[valueIndex]
      valueIndex += 1
   }

   if (mask & CLIENT_UPDATE_FIELDS.USERNAME) {
      update.userName = tuple[valueIndex]
      valueIndex += 1
   }

   if (mask & CLIENT_UPDATE_FIELDS.MICROPHONE) {
      update.microphone = tuple[valueIndex]
   }

   return update
}

export function decodeClientMotionUpdateBatch(payload) {
   if (!isClientUpdateTupleBatch(payload)) {
      return []
   }

   return payload[1].map(decodeClientMotionUpdate)
}

export function decodeClientMetadataUpdateBatch(payload) {
   if (!isClientUpdateTupleBatch(payload)) {
      return []
   }

   return payload[1].map(decodeClientMetadataUpdate)
}
