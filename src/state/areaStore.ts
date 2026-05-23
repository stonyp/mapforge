import { create } from "zustand";

type AreaStore = {
  areas: any;
  roads: any[];
  center: {
    lat: number;
    lng: number;
  }[];

  appendAreas: (areas: any[]) => void;
  setRoads: (roads: any[]) => void;
  setCenter: (center: any[]) => void;
};

export const useAreaStore = create<AreaStore>((set) => ({
  areas: [],
  roads: [],
  center: [
    {
      lat: 40.8,
      lng: -73.95,
    },
    {
      lat: 40.83,
      lng: -73.88,
    },
  ],
  appendAreas: (areas) => set(() => ({ areas: [...areas] })),
  setRoads: (roads) => set(() => ({ roads: [...roads] })),
  setCenter: (center) => set(() => ({ center: [...center] })),
}));
