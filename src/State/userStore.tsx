import { create } from 'zustand'

interface UserStoreState {
   localClientId: string
}

interface UserStoreActions {
   setClientId: (id: string) => void
}

type UserStore = UserStoreState & UserStoreActions

const useUserStore = create<UserStore>((set) => ({
   localClientId: '',
   setClientId: (id) =>
      set(() => ({
         localClientId: id,
      })),
}))

export default useUserStore
