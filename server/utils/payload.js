/**
 * `ws` hands a message over as a Buffer, an ArrayBuffer or - for a text frame - a string, and the
 * byte length is read differently from each. Both rate limiting and metrics need it.
 */
export function getPayloadByteLength(data) {
   if (typeof data === 'string') {
      return Buffer.byteLength(data)
   }

   if (data?.byteLength !== undefined) {
      return data.byteLength
   }

   if (data?.length !== undefined) {
      return data.length
   }

   return 0
}
