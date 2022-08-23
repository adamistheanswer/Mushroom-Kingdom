import create from "zustand";

const useAppStore = create((set) => ({
  userId: "",
  localPositions: {},
  spawnX: Math.random() * 4 - 2,
  spawnZ: Math.random() * 4 - 2,

  setSpawnX: (spawn: number) =>
    set(() => ({
      spawnX: spawn,
    })),

  setSpawnZ: (spawn: number) =>
    set(() => ({
      spawnY: spawn,
    })),

  setUserId: (id: string) =>
    set(() => ({
      userId: id,
    })),

  setLocalPositions: (updatedLocalPositions: { [id: string]: any }) =>
    set(() => {
      return {
        localPositions: { ...updatedLocalPositions },
      };
    }),
}));

export default useAppStore;
