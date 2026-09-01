import { create } from 'zustand'

interface UserStoreState {
   localClientId: string
   userName: string
}

interface UserStoreActions {
   setClientId: (id: string) => void
   setUserName: (userName: string) => void
}

type UserStore = UserStoreState & UserStoreActions

const useUserStore = create<UserStore>((set) => ({
   localClientId: '',
   userName: '',
   setClientId: (id) =>
      set(() => ({
         localClientId: id,
      })),
   setUserName: (userName) =>
      set(() => ({
         userName,
      })),
}))

export default useUserStore
