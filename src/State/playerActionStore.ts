import { create } from 'zustand'

interface PlayerActionStore {
   selectedMenuAction: string | null
   setSelectedMenuAction: (action: string | null) => void
}

const usePlayerActionStore = create<PlayerActionStore>((set) => ({
   selectedMenuAction: null,
   setSelectedMenuAction: (action) => set({ selectedMenuAction: action }),
}))

export default usePlayerActionStore
