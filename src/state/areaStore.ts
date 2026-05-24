import { create } from "zustand";

/**
 * All values needed to project lat/lon → Three.js scene units.
 * Frozen once per generation — never derived from canvas or viewport.
 *
 *   x = (lng - refLng) * scaleX
 *   y = (lat - refLat) * scaleY
 */
export type Projection = {
  refLat: number;
  refLng: number;
  /** scale * cos(refLat * PI / 180) — pre-computed longitude scale */
  scaleX: number;
  /** scale (51 000) — latitude scale */
  scaleY: number;
  bbox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
};

type AreaStore = {
  areas: any;
  roads: any[];
  center: {
    lat: number;
    lng: number;
  }[];
  projection: Projection | null;

  appendAreas: (areas: any[]) => void;
  setRoads: (roads: any[]) => void;
  setCenter: (center: any[]) => void;
  setProjection: (p: Projection) => void;
};

export const useAreaStore = create<AreaStore>((set) => ({
  areas: [],
  roads: [],
  center: [
    { lat: 40.8,  lng: -73.95 },
    { lat: 40.83, lng: -73.88 },
  ],
  projection: null,
  appendAreas:    (areas)  => set(() => ({ areas: [...areas] })),
  setRoads:       (roads)  => set(() => ({ roads: [...roads] })),
  setCenter:      (center) => set(() => ({ center: [...center] })),
  setProjection:  (p)      => set(() => ({ projection: p })),
}));
