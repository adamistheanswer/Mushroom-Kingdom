import ShortUniqueId from 'short-unique-id'

const shortUniqueId = new ShortUniqueId({ length: 10 })

export function uid() {
   return shortUniqueId()
}
