import create from 'zustand'

const useUserStore = create((set) => ({
   localClientId: null,

   setClientId: (id) =>
      set(() => ({
        localClientId: id,
      })),
}))

export default useUserStore
