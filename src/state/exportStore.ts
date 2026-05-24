import { create } from "zustand";

type ActionStore = {
  action: boolean;
  fleetSpaceId: string;
  exportType: "glb" | "fleet";
  includeGroundPlane: boolean;

  setAction: (action: boolean) => void;
  setFleet: (fleetSpaceId: string, exportType: "glb" | "fleet") => void;
  setIncludeGroundPlane: (v: boolean) => void;
};

export const useActionStore = create<ActionStore>((set) => ({
  action: false,
  fleetSpaceId: "",
  exportType: "glb",
  includeGroundPlane: true,
  setAction: (action) => set(() => ({ action: action })),
  setFleet: (fleetSpaceId, exportType) =>
    set(() => ({ fleetSpaceId: fleetSpaceId, exportType: exportType })),
  setIncludeGroundPlane: (v) => set(() => ({ includeGroundPlane: v })),
}));
