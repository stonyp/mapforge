import { useEffect, useRef, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useAreaStore } from "@/state/areaStore";
import { Html, Sky, Environment } from "@react-three/drei";
import * as THREE from "three";
import { useActionStore } from "@/state/exportStore";
import { GLTFExporter } from "three/examples/jsm/Addons.js";
import Car from "./Car";
import instanceFleet from "@/api/axios";

const scale = 51000;

const ROAD_MAT = new THREE.MeshStandardMaterial({ color: "#3d3d3d" });
const PATH_MAT = new THREE.MeshStandardMaterial({ color: "#888888" });
const BUILDING_MAT = new THREE.MeshStandardMaterial({ color: "#9da0a3" });
const BUILDING_ACTIVE_MAT = new THREE.MeshStandardMaterial({ color: "#007bff" });
// Opaque ground material used in GLB export
const GROUND_MAT = new THREE.MeshStandardMaterial({ color: "#888888", roughness: 1, metalness: 0 });
// Ghost version shown in the browser preview — same colour, barely visible
const GROUND_PREVIEW_MAT = new THREE.MeshStandardMaterial({ color: "#888888", roughness: 1, metalness: 0, transparent: true, opacity: 0.15, depthWrite: false });

function Building({
  shape,
  extrudeSettings,
  tags,
}: {
  shape: THREE.Shape;
  extrudeSettings: any;
  tags: any;
}) {
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [hoverPos, setHoverPos] = useState<THREE.Vector3 | null>(null);
  const [showTranslations, setShowTranslations] = useState(false);
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false);
  return (
    <mesh
      onPointerOver={(e) => {
        setHovered(true);
        e.stopPropagation();
      }}
      onPointerOut={(e) => {
        setHovered(false);
        e.stopPropagation();
      }}
      onPointerMove={(e) => {
        setHoverPos(e.point.clone());
        e.stopPropagation();
      }}
      onClick={(e) => {
        setClicked(!clicked);
        e.stopPropagation();
      }}
      rotation={[-Math.PI / 2, 0, 0]}
      material={hovered || clicked ? BUILDING_ACTIVE_MAT : BUILDING_MAT}
      userData={{ exportToGLB: true }}
    >
      <extrudeGeometry args={[shape, extrudeSettings]} />
      {(hovered || clicked) && hoverPos && (
        <Html position={[hoverPos.x, hoverPos.y + extrudeSettings.depth + 0.5, hoverPos.z]} center>
          <div
            role="dialog"
            aria-label={tags.name || "Building Information"}
            style={{
              color: "#000000",
              backgroundColor: "#ffffff96",
              backdropFilter: "blur(8px)",
              border: "none",
              padding: "14px",
              borderRadius: "10px",
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontSize: "13px",
              width: "200px",
              boxShadow: "0 2px 14px rgba(0, 0, 0, 0.16)",
              transition: "all 0.2s ease-in-out",
            }}
          >
            <div
              style={{
                fontWeight: "600",
                fontSize: "15px",
                borderBottom: tags.name ? "1px solid rgba(0, 0, 0, 0.08)" : "none",
                paddingBottom: tags.name ? "6px" : "0",
                marginBottom: tags.name ? "8px" : "4px",
              }}
            >
              {tags.name || "Building Information"}
            </div>
            {["building", "height", "building:levels", "amenity", "denomination"].map(
              (key) =>
                tags[key] &&
                (key !== "building" || tags[key] !== "yes") && (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      margin: "4px 0",
                    }}
                  >
                    <span style={{ fontWeight: "500", color: "#5f6368" }}>
                      {key === "building"
                        ? "Type"
                        : key === "height"
                        ? "Height"
                        : key === "building:levels"
                        ? "Levels"
                        : key === "amenity"
                        ? "Facility"
                        : key === "denomination"
                        ? "Denomination"
                        : key.replace(/_/g, " ")}
                      :
                    </span>
                    <span style={{ textTransform: "capitalize" }}>
                      {key === "height" ? `${tags[key]} m` : tags[key]}
                    </span>
                  </div>
                )
            )}
            {[
              "addr:street",
              "addr:housenumber",
              "addr:district",
              "addr:city",
              "addr:postcode",
            ].some((key) => tags[key]) && (
              <div
                style={{
                  margin: "10px 0 8px",
                  borderTop: "1px solid rgba(0, 0, 0, 0.08)",
                  paddingTop: "8px",
                }}
              >
                <div style={{ fontWeight: "500", marginBottom: "4px", color: "#5f6368" }}>
                  Address
                </div>
                <div style={{ marginLeft: "4px", fontSize: "12px", color: "#5f6368" }}>
                  {[
                    [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "),
                    tags["addr:district"],
                    tags["addr:city"],
                    tags["addr:postcode"],
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              </div>
            )}
            {Object.entries(tags).filter(
              ([key]) =>
                ![
                  "building",
                  "name",
                  "height",
                  "building:levels",
                  "source",
                  "amenity",
                  "denomination",
                ].includes(key) &&
                !key.startsWith("addr:") &&
                !key.startsWith("name:") &&
                !key.startsWith("alt_name:")
            ).length > 0 && (
              <div
                style={{
                  margin: "10px 0 4px",
                  borderTop: "1px solid rgba(0, 0, 0, 0.08)",
                  paddingTop: "8px",
                }}
              >
                <div
                  style={{
                    fontWeight: "500",
                    marginBottom: "4px",
                    color: "#5f6368",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  onClick={() => setShowAdditionalInfo(!showAdditionalInfo)}
                >
                  Additional Information
                  <span>{showAdditionalInfo ? "▲" : "▼"}</span>
                </div>
                {showAdditionalInfo && (
                  <div>
                    {Object.entries(tags)
                      .filter(
                        ([key]) =>
                          ![
                            "building",
                            "name",
                            "height",
                            "building:levels",
                            "source",
                            "amenity",
                            "denomination",
                          ].includes(key) &&
                          !key.startsWith("addr:") &&
                          !key.startsWith("name:") &&
                          !key.startsWith("alt_name:")
                      )
                      .map(([key, value]) => {
                        if (
                          key === "description" ||
                          (typeof value === "string" && value.length > 80)
                        ) {
                          return (
                            <div key={key} style={{ margin: "8px 0" }}>
                              <div
                                style={{ fontWeight: "500", color: "#5f6368", marginBottom: "4px" }}
                              >
                                {key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ")}
                              </div>
                              <div
                                style={{
                                  textAlign: "left",
                                  fontSize: "12px",
                                  color: "#5f6368",
                                  fontWeight: "400",
                                  textWrap: "wrap",
                                  whiteSpace: "pre-wrap",
                                  lineHeight: "1.4",
                                  backgroundColor: "rgba(0,0,0,0.02)",
                                  padding: "6px 8px",
                                  borderRadius: "4px",
                                }}
                              >
                                {String(value)}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={key}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              margin: "4px 0",
                            }}
                          >
                            <span
                              style={{
                                fontWeight: "700",
                                color: "#5f6368",
                                textAlign: "left",
                              }}
                            >
                              {key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ")}:
                            </span>
                            <span
                              style={{
                                textTransform: "capitalize",
                                fontWeight: "400",
                                textAlign: "right",
                              }}
                            >
                              {String(value)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
            {Object.entries(tags).filter(([key]) => key.startsWith("name:")).length > 0 && (
              <div
                style={{
                  margin: "10px 0 4px",
                  borderTop: "1px solid rgba(0, 0, 0, 0.08)",
                  paddingTop: "8px",
                  textAlign: "right",
                }}
              >
                <div
                  style={{
                    fontWeight: "500",
                    marginBottom: "4px",
                    color: "#5f6368",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  onClick={() => setShowTranslations(!showTranslations)}
                >
                  Name Translations
                  <span>{showTranslations ? "▲" : "▼"}</span>
                </div>
                {showTranslations && (
                  <div>
                    {Object.entries(tags)
                      .filter(([key]) => key.startsWith("name:"))
                      .map(([key, value]) => (
                        <div
                          key={key}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            margin: "4px 0",
                          }}
                        >
                          <span style={{ fontWeight: "500", color: "#5f6368" }}>
                            {key.replace("name:", "").toUpperCase()}:
                          </span>
                          <span style={{ textTransform: "capitalize" }}>{String(value)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Html>
      )}
    </mesh>
  );
}

// Highway types rendered as pedestrian paths (lighter material, narrower).
const PEDESTRIAN_TYPES = new Set([
  "footway", "path", "steps", "pedestrian", "track", "cycleway",
]);

// Half-widths in scene units (1 unit ≈ 2 m at mid-latitudes).
// Keyed by OSM highway tag value.
const ROAD_HALF_WIDTH: Record<string, number> = {
  motorway: 4.5,
  motorway_link: 2.5,
  trunk: 3.5,
  trunk_link: 2.0,
  primary: 3.0,
  primary_link: 2.0,
  secondary: 2.5,
  secondary_link: 1.8,
  tertiary: 2.0,
  tertiary_link: 1.5,
  residential: 1.8,
  living_street: 1.6,
  unclassified: 1.8,
  service: 1.2,
  // Pedestrian / non-vehicle — narrow
  pedestrian: 0.5,
  footway: 0.4,
  cycleway: 0.4,
  path: 0.35,
  track: 0.45,
  steps: 0.3,
};
const DEFAULT_ROAD_HALF_WIDTH = 1.5;

// Build a flat ribbon THREE.Shape from a projected 2-D polyline.
// Returns null if the polyline is degenerate.
function buildRoadShape(pts: THREE.Vector2[], halfW: number): THREE.Shape | null {
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    // Perpendicular unit vector (90° CCW)
    const nx = (-dy / len) * halfW;
    const ny = (dx / len) * halfW;

    if (left.length === 0) {
      left.push(new THREE.Vector2(a.x + nx, a.y + ny));
      right.push(new THREE.Vector2(a.x - nx, a.y - ny));
    }
    left.push(new THREE.Vector2(b.x + nx, b.y + ny));
    right.push(new THREE.Vector2(b.x - nx, b.y - ny));
  }

  if (left.length < 2) return null;

  const shape = new THREE.Shape();
  shape.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) shape.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) shape.lineTo(right[i].x, right[i].y);
  shape.closePath();
  return shape;
}

const ROAD_EXTRUDE = { steps: 1, depth: 0.1, bevelEnabled: false } as const;

// ── Polyline clipping ─────────────────────────────────────────────────────────

/**
 * Liang-Barsky parametric segment clip against an axis-aligned rectangle.
 * Works in any 2-D coordinate system (lat/lon here).
 * Returns [x0,y0, x1,y1] of the clipped segment, or null if fully outside.
 */
function clipSegment(
  x0: number, y0: number,
  x1: number, y1: number,
  xmin: number, ymin: number,
  xmax: number, ymax: number
): [number, number, number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;

  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;        // parallel edge — outside if q < 0
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else       { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };

  if (
    !clip(-dx, x0 - xmin) ||
    !clip( dx, xmax - x0) ||
    !clip(-dy, y0 - ymin) ||
    !clip( dy, ymax - y0)
  ) return null;

  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

type LatLon = { lat: number; lon: number };

/**
 * Clips a lat/lon polyline to the given bounding box.
 * Returns one or more contiguous sub-polylines (a road crossing a bbox corner
 * may produce two separate segments).
 */
function clipPolylineToBbox(
  pts: LatLon[],
  minLat: number, maxLat: number,
  minLng: number, maxLng: number
): LatLon[][] {
  const result: LatLon[][] = [];
  let current: LatLon[] = [];

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const seg = clipSegment(
      p0.lon, p0.lat, p1.lon, p1.lat,
      minLng, minLat, maxLng, maxLat
    );
    if (!seg) {
      if (current.length >= 2) result.push(current);
      current = [];
      continue;
    }
    const [x0, y0, x1, y1] = seg;
    const cp0: LatLon = { lat: y0, lon: x0 };
    const cp1: LatLon = { lat: y1, lon: x1 };

    if (current.length === 0) {
      current.push(cp0, cp1);
    } else {
      const last = current[current.length - 1];
      // If the clipped start equals the last accumulated point, extend;
      // otherwise the segment was clipped at entry — start a new chain.
      if (Math.abs(last.lat - cp0.lat) < 1e-10 && Math.abs(last.lon - cp0.lon) < 1e-10) {
        current.push(cp1);
      } else {
        result.push(current);
        current = [cp0, cp1];
      }
    }
  }
  if (current.length >= 2) result.push(current);
  return result;
}

function RoadMesh({ shape, material }: { shape: THREE.Shape; material: THREE.MeshStandardMaterial }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  useEffect(() => {
    meshRef.current.userData.exportToGLB = true;
  }, []);
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <extrudeGeometry args={[shape, ROAD_EXTRUDE]} />
    </mesh>
  );
}

function RoadMeshes() {
  const roads = useAreaStore((state) => state.roads);
  const center = useAreaStore((state) => state.center);

  const refLat = (center[1].lat + center[0].lat) / 2;
  const refLng = (center[1].lng + center[0].lng) / 2;

  // Bounding box in lat/lon — center[0] is NE, center[1] is SW
  const minLat = Math.min(center[0].lat, center[1].lat);
  const maxLat = Math.max(center[0].lat, center[1].lat);
  const minLng = Math.min(center[0].lng, center[1].lng);
  const maxLng = Math.max(center[0].lng, center[1].lng);

  const roadShapes = useMemo(() => {
    return roads.flatMap((road, i) => {
      if (!road.geometry || road.geometry.length < 2) return [];
      const highwayType: string = road.tags?.highway ?? "";
      const halfW = ROAD_HALF_WIDTH[highwayType] ?? DEFAULT_ROAD_HALF_WIDTH;
      const material = PEDESTRIAN_TYPES.has(highwayType) ? PATH_MAT : ROAD_MAT;

      // Clip the polyline to the selection bbox before projecting
      const clippedChains = clipPolylineToBbox(
        road.geometry as LatLon[],
        minLat, maxLat, minLng, maxLng
      );

      return clippedChains.flatMap((chain, ci) => {
        const pts2d = chain.map((pt) => {
          const x = (pt.lon - refLng) * scale * Math.cos((refLat * Math.PI) / 180);
          const y = (pt.lat - refLat) * scale;
          return new THREE.Vector2(x, y);
        });
        const shape = buildRoadShape(pts2d, halfW);
        if (!shape) return [];
        return [{ shape, material, key: `${road.id ?? i}-${ci}` }];
      });
    });
  }, [roads, refLat, refLng, minLat, maxLat, minLng, maxLng]);

  return (
    <>
      {roadShapes.map(({ shape, material, key }) => (
        <RoadMesh key={key} shape={shape} material={material} />
      ))}
    </>
  );
}

// sceneWidth / sceneDepth are computed in Space using the same refLat/refLng
// as buildings, so the ground plane always shares the same coordinate origin.
function GroundPlane({ sceneWidth, sceneDepth }: { sceneWidth: number; sceneDepth: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const includeGroundPlane = useActionStore((state) => state.includeGroundPlane);

  useEffect(() => {
    if (!meshRef.current) return;
    meshRef.current.userData.exportToGLB = true;
    meshRef.current.userData.groundPlane = true;
  }, []);

  if (!includeGroundPlane) return null;

  // Box sits with its top face at y = 0, flush with building bases.
  // X = longitudinal span (world X), Z = latitudinal span (world Z after building rotation).
  return (
    <mesh ref={meshRef} position={[0, -0.25, 0]} material={GROUND_PREVIEW_MAT}>
      <boxGeometry args={[sceneWidth, 0.5, sceneDepth]} />
    </mesh>
  );
}

export function Export() {
  const { scene } = useThree();
  const action = useActionStore((state) => state.action);
  const fleetSpaceId = useActionStore((state) => state.fleetSpaceId);

  const exportType = useActionStore((state) => state.exportType);

  const setAction = useActionStore((state) => state.setAction);

  useEffect(() => {
    if (action === true) {
      setAction(false);
      exportGLB();
    }
  }, [action, setAction, scene]);

  const uploadFleet = async (blob) => {
    const formData = new FormData();

    formData.append("object", blob, "box3d.glb");
    formData.append("title", "New Object");
    formData.append("description", "");
    formData.append("spaceId", fleetSpaceId);

    await instanceFleet.post("space/file/mesh", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  };

  const exportGLB = () => {
    const exportRoot = new THREE.Group();
    scene.traverse((child) => {
      if (child.userData?.exportToGLB === true) {
        const clone = child.clone(true);
        // Swap preview material → opaque export material on the ground plane
        if (child.userData?.groundPlane === true && clone instanceof THREE.Mesh) {
          clone.material = GROUND_MAT;
        }
        exportRoot.add(clone);
      }
    });
    const exporter = new GLTFExporter();
    const options = { binary: true, embedImages: true };
    exporter.parse(
      exportRoot,
      (result) => {
        if (result instanceof ArrayBuffer) {
          const blob = new Blob([result], { type: "model/gltf-binary" });

          if (exportType == "glb") {
            const link = document.createElement("a");
            link.style.display = "none";
            document.body.appendChild(link);
            link.href = URL.createObjectURL(blob);
            link.download = "scene.glb";
            link.click();
            document.body.removeChild(link);
          }

          if (exportType == "fleet") {
            uploadFleet(blob);
          }
        } else {
          console.error("GLB export failed: unexpected result", result);
        }
      },
      (error) => {
        console.error("An error occurred during export", error);
      },
      options
    );
  };
  return null;
}

export function Space() {
  const areas = useAreaStore((state) => state.areas);
  const center = useAreaStore((state) => state.center);
  const refLat = (center[1].lat + center[0].lat) / 2;
  const refLng = (center[1].lng + center[0].lng) / 2;

  // Ground plane dimensions — derived from the same bbox + projection as buildings.
  // +10% margin each side (×1.2) so the plane extends slightly beyond the building edges.
  const minLat = Math.min(center[0].lat, center[1].lat);
  const maxLat = Math.max(center[0].lat, center[1].lat);
  const minLng = Math.min(center[0].lng, center[1].lng);
  const maxLng = Math.max(center[0].lng, center[1].lng);
  const groundSceneWidth = (maxLng - minLng) * scale * Math.cos((refLat * Math.PI) / 180) * 1.2;
  const groundSceneDepth = (maxLat - minLat) * scale * 1.2;

  function project(lat: number, lng: number) {
    const x = (lng - refLng) * scale * Math.cos((refLat * Math.PI) / 180);
    const y = (lat - refLat) * scale;
    return new THREE.Vector2(x, y);
  }

  const buildingsData = useMemo(() => {
    const result: Array<{ shape: THREE.Shape; extrudeSettings: any; tags: any }> = [];
    areas.forEach((bld: any) => {
      if (!bld.geometry || bld.geometry.length < 3) return;
      const shapePoints = bld.geometry.map((pt: any) => project(pt.lat, pt.lng));
      if (!shapePoints[0].equals(shapePoints[shapePoints.length - 1]))
        shapePoints.push(shapePoints[0]);
      const shape = new THREE.Shape(shapePoints);
      let heightValue = parseFloat(bld.tags.height || "");
      const heightLevels = parseFloat(bld.tags["building:levels"] || "");
      if (isNaN(heightValue)) heightValue = 10;
      if (!isNaN(heightLevels)) heightValue = heightLevels * 2.2;
      result.push({ shape, extrudeSettings: { steps: 1, depth: heightValue, bevelEnabled: false }, tags: bld.tags });
    });
    return result;
  }, [areas, refLat, refLng]);

  return (
    <Canvas camera={{ fov: 90, near: 0.1, far: 7000 }}>
      <ambientLight intensity={Math.PI / 2} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} decay={0} intensity={Math.PI} />
      <GroundPlane sceneWidth={groundSceneWidth} sceneDepth={groundSceneDepth} />
      <RoadMeshes />
      {buildingsData.map((item, index) => (
        <Building
          key={index}
          shape={item.shape}
          extrudeSettings={item.extrudeSettings}
          tags={item.tags}
        />
      ))}
      <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
      <Car />
      <Export />
      <Sky distance={450000} sunPosition={[0, 1, 0]} inclination={0} azimuth={0.25} />
      <Environment preset="city" />
    </Canvas>
  );
}
