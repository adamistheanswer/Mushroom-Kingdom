import { create } from 'zustand'

const useSceneryStore = create((set) => ({
   largeScenery: [],
   smallScenery: [],
   setLargeScenery: (largeScenery) => set({ largeScenery }),
   setSmallScenery: (smallScenery) => set({ smallScenery }),
}))

export default useSceneryStore
