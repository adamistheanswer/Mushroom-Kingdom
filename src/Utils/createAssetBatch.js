// A fixed set of logical assets: dependencies never increase the denominator.
export function createAssetBatch(urls, loadAsset) {
   const assets = [...new Set(urls)]
   const results = new Map()
   const listeners = new Set()
   let snapshot = { active: assets.length > 0, loaded: 0, total: assets.length, progress: 0, item: '', errors: [] }
   let pending

   function publish(update) {
      snapshot = { ...snapshot, ...update }
      listeners.forEach((listener) => listener())
   }

   function start() {
      if (!pending) {
         pending = Promise.all(
            assets.map(async (url) => {
               try {
                  const asset = await loadAsset(url)
                  results.set(url, asset)
                  const loaded = results.size
                  publish({ loaded, progress: (loaded / assets.length) * 100, item: url })
               } catch (error) {
                  publish({ errors: [...snapshot.errors, url], item: url })
               }
            })
         ).then(() => publish({ active: false }))
      }
      return pending
   }

   return {
      start,
      getState: () => snapshot,
      subscribe(listener) {
         listeners.add(listener)
         return () => listeners.delete(listener)
      },
      read(url) {
         if (!assets.includes(url)) throw new Error(`Unregistered scene asset: ${url}`)
         if (results.has(url)) return results.get(url)
         if (snapshot.errors.includes(url)) throw new Error(`Unable to load scene asset: ${url}`)
         throw start()
      },
   }
}
