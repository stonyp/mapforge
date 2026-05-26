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

/** A single closed polygon ring extracted from an OSM way or relation. */
export type PolygonRing = {
  key: string;
  ring: Array<{ lat: number; lon: number }>;
  tags: any;
};

/** A single polyline element (road, river, railway, etc.) from an OSM way. */
export type PolylineElem = {
  id: number | string;
  tags: any;
  geometry: Array<{ lat: number; lon: number }>;
};

type AreaStore = {
  areas: any;
  roads: any[];
  parks: PolygonRing[];
  waterPolygons: PolygonRing[];
  rivers: PolylineElem[];
  streams: PolylineElem[];
  forests: PolygonRing[];
  railways: PolylineElem[];
  center: {
    lat: number;
    lng: number;
  }[];
  projection: Projection | null;

  appendAreas: (areas: any[]) => void;
  setRoads: (roads: any[]) => void;
  setParks: (parks: PolygonRing[]) => void;
  setWaterPolygons: (waterPolygons: PolygonRing[]) => void;
  setRivers: (rivers: PolylineElem[]) => void;
  setStreams: (streams: PolylineElem[]) => void;
  setForests: (forests: PolygonRing[]) => void;
  setRailways: (railways: PolylineElem[]) => void;
  setCenter: (center: any[]) => void;
  setProjection: (p: Projection) => void;
};

export const useAreaStore = create<AreaStore>((set) => ({
  areas: [],
  roads: [],
  parks: [],
  waterPolygons: [],
  rivers: [],
  streams: [],
  forests: [],
  railways: [],
  center: [
    { lat: 40.8,  lng: -73.95 },
    { lat: 40.83, lng: -73.88 },
  ],
  projection: null,
  appendAreas:      (areas)         => set(() => ({ areas: [...areas] })),
  setRoads:         (roads)         => set(() => ({ roads: [...roads] })),
  setParks:         (parks)         => set(() => ({ parks: [...parks] })),
  setWaterPolygons: (waterPolygons) => set(() => ({ waterPolygons: [...waterPolygons] })),
  setRivers:        (rivers)        => set(() => ({ rivers: [...rivers] })),
  setStreams:       (streams)       => set(() => ({ streams: [...streams] })),
  setForests:       (forests)       => set(() => ({ forests: [...forests] })),
  setRailways:      (railways)      => set(() => ({ railways: [...railways] })),
  setCenter:        (center)        => set(() => ({ center: [...center] })),
  setProjection:    (p)             => set(() => ({ projection: p })),
}));
