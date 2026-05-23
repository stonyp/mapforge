import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L, { LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-rotate";
import { css } from "@emotion/react";
import { CircleMinus, MousePointerClick } from "lucide-react";

// ── Leaflet-rotate type augmentation ─────────────────────────────────────────
declare module "leaflet" {
  interface MapOptions {
    rotate?: boolean;
    rotateControl?: boolean | { position?: string };
    bearing?: number;
  }
  interface Map {
    setBearing(bearing: number): void;
    getBearing(): number;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MapComponentRef {
  flyToBounds: (bounds: LatLngBounds) => void;
  snapToPreset: (halfLatDeg: number) => void;
}

/** Box in CSS-pixel coordinates relative to the map container's top-left. */
type BoxPx = { x1: number; y1: number; x2: number; y2: number };
type Corner = "tl" | "tr" | "bl" | "br";

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeBox(b: BoxPx): BoxPx {
  return {
    x1: Math.min(b.x1, b.x2),
    y1: Math.min(b.y1, b.y2),
    x2: Math.max(b.x1, b.x2),
    y2: Math.max(b.y1, b.y2),
  };
}

/**
 * Project the four screen-space corners of the box through the (possibly
 * rotated) map to get the axis-aligned geographic bounding box.
 */
function boxToGeoBounds(map: L.Map, box: BoxPx): LatLngBounds {
  const nb = normalizeBox(box);
  const corners = [
    map.containerPointToLatLng(L.point(nb.x1, nb.y1)),
    map.containerPointToLatLng(L.point(nb.x2, nb.y1)),
    map.containerPointToLatLng(L.point(nb.x2, nb.y2)),
    map.containerPointToLatLng(L.point(nb.x1, nb.y2)),
  ];
  const lats = corners.map((c) => c.lat);
  const lngs = corners.map((c) => c.lng);
  return new L.LatLngBounds(
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)]
  );
}

function latLngToBoxPx(map: L.Map, bounds: LatLngBounds): BoxPx {
  const nePx = map.latLngToContainerPoint(bounds.getNorthEast());
  const swPx = map.latLngToContainerPoint(bounds.getSouthWest());
  return { x1: swPx.x, y1: nePx.y, x2: nePx.x, y2: swPx.y };
}

// ── Corner handle style ───────────────────────────────────────────────────────
const HANDLE = 10;
function cornerHandleStyle(
  cx: "left" | "right",
  cy: "top" | "bottom"
): React.CSSProperties {
  const cursor =
    cx === "left" && cy === "top"
      ? "nw-resize"
      : cx === "right" && cy === "top"
      ? "ne-resize"
      : cx === "left" && cy === "bottom"
      ? "sw-resize"
      : "se-resize";
  return {
    position: "absolute",
    width: HANDLE,
    height: HANDLE,
    backgroundColor: "#fff",
    border: "2px solid #007bff",
    borderRadius: 2,
    [cx]: -HANDLE / 2 - 1,
    [cy]: -HANDLE / 2 - 1,
    cursor,
    zIndex: 1001,
    touchAction: "none",
  };
}

// ── Map controller (inside MapContainer) ─────────────────────────────────────
function MapController({
  leafletMapRef,
  emitChange,
  boxPxRef,
  pendingBoundsRef,
  setBoxPx,
}: {
  leafletMapRef: React.MutableRefObject<L.Map | null>;
  emitChange: (box: BoxPx) => void;
  boxPxRef: React.MutableRefObject<BoxPx | null>;
  pendingBoundsRef: React.MutableRefObject<LatLngBounds | null>;
  setBoxPx: React.Dispatch<React.SetStateAction<BoxPx | null>>;
}) {
  const map = useMap();

  useEffect(() => {
    leafletMapRef.current = map;

    const handleMove = () => {
      if (boxPxRef.current) emitChange(boxPxRef.current);
    };

    const handleMoveEnd = () => {
      const b = pendingBoundsRef.current;
      if (!b) return;
      const newBox = latLngToBoxPx(map, b);
      setBoxPx(newBox);
      emitChange(newBox);
      pendingBoundsRef.current = null;
    };

    // After rotation settles: invalidate size so Leaflet recalculates the
    // visible pixel bounds and requests any tiles now exposed at the corners.
    let rotateEndTimer: ReturnType<typeof setTimeout> | null = null;
    const handleRotate = () => {
      if (boxPxRef.current) emitChange(boxPxRef.current);
      if (rotateEndTimer) clearTimeout(rotateEndTimer);
      rotateEndTimer = setTimeout(() => {
        map.invalidateSize();
        map.fire("moveend");
        rotateEndTimer = null;
      }, 150);
    };

    map.on("move", handleMove);
    map.on("zoom", handleMove);
    map.on("moveend", handleMoveEnd);
    (map as any).on("rotate", handleRotate);

    return () => {
      map.off("move", handleMove);
      map.off("zoom", handleMove);
      map.off("moveend", handleMoveEnd);
      (map as any).off("rotate", handleRotate);
      if (rotateEndTimer) clearTimeout(rotateEndTimer);
    };
  // stable refs / callbacks — effect only needs to run when map changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

// ── Shared button base styles ─────────────────────────────────────────────────
const BTN_BASE: React.CSSProperties = {
  backdropFilter: "blur(8px)",
  border: "none",
  padding: "0.5rem 1rem",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "0.2s",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  fontSize: "14px",
};

const IconSize = css({ width: "14px", height: "14px" });

// ── Main component ────────────────────────────────────────────────────────────
export const MapComponent = forwardRef<
  MapComponentRef,
  {
    onDone: (e: any) => void;
    onRemove: () => void;
    externalBounds?: LatLngBounds | null;
  }
>(function MapComponent({ onDone, onRemove, externalBounds }, ref) {
  const [isDraw, setIsDraw] = useState(false);
  const [boxPx, setBoxPx] = useState<BoxPx | null>(null);
  const [isShiftHeld, setIsShiftHeld] = useState(false);

  // ---- Track Shift key so overlays yield to leaflet-rotate ----
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === "Shift") setIsShiftHeld(true); };
    const onUp   = (e: KeyboardEvent) => { if (e.key === "Shift") setIsShiftHeld(false); };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup",   onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup",   onUp);
    };
  }, []);

  // ---- Stable refs ----
  const leafletMapRef = useRef<L.Map | null>(null);
  const pendingBoundsRef = useRef<LatLngBounds | null>(null);
  /** Always points at the current boxPx without causing effect re-runs. */
  const boxPxRef = useRef<BoxPx | null>(null);
  boxPxRef.current = boxPx;
  /** Always points at the current onDone prop. */
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // ---- Draw drag state ----
  const drawAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const isDrawingRef = useRef(false);

  // ---- Box-center drag state ----
  const boxDragRef = useRef<{ mx: number; my: number; box: BoxPx } | null>(null);

  // ---- Corner drag state ----
  const cornerDragRef = useRef<{
    corner: Corner;
    mx: number;
    my: number;
    box: BoxPx;
  } | null>(null);

  // ---- Stable emitChange (reads via refs — no stale closures) ----
  const emitChange = useCallback((box: BoxPx) => {
    const map = leafletMapRef.current;
    if (!map) return;
    const bounds = boxToGeoBounds(map, box);
    onDoneRef.current([bounds.getNorthEast(), bounds.getSouthWest()]);
  }, []);

  // ---- Imperative ref API ----
  useImperativeHandle(
    ref,
    () => ({
      flyToBounds(b: LatLngBounds) {
        pendingBoundsRef.current = b;
        leafletMapRef.current?.flyToBounds(b, { padding: [20, 20] });
      },
      snapToPreset(halfLatDeg: number) {
        const map = leafletMapRef.current;
        if (!map) return;
        const c = map.getCenter();
        const halfLng = halfLatDeg / Math.cos((c.lat * Math.PI) / 180);
        const ne = new L.LatLng(c.lat + halfLatDeg, c.lng + halfLng);
        const sw = new L.LatLng(c.lat - halfLatDeg, c.lng - halfLng);
        const newBox = latLngToBoxPx(map, new L.LatLngBounds(sw, ne));
        setBoxPx(newBox);
        emitChange(newBox);
      },
    }),
    [emitChange]
  );

  // ---- External bounds (from search) ----
  useEffect(() => {
    if (!externalBounds) return;
    pendingBoundsRef.current = externalBounds;
    leafletMapRef.current?.flyToBounds(externalBounds, { padding: [20, 20] });
  }, [externalBounds]);

  // ---- Helper: px relative to map container ----
  const clientToPx = (clientX: number, clientY: number) => {
    const rect = leafletMapRef.current?.getContainer().getBoundingClientRect();
    return {
      x: clientX - (rect?.left ?? 0),
      y: clientY - (rect?.top ?? 0),
    };
  };

  // ---- Draw mode: initial mousedown on the overlay ----
  const handleDrawMouseDown = (e: React.MouseEvent) => {
    const { x, y } = clientToPx(e.clientX, e.clientY);
    drawAnchorRef.current = { x, y };
    isDrawingRef.current = true;
    document.body.style.cursor = "crosshair";
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDraw) return;
    const onMove = (e: MouseEvent) => {
      if (!isDrawingRef.current || !drawAnchorRef.current) return;
      const { x, y } = clientToPx(e.clientX, e.clientY);
      setBoxPx({ x1: drawAnchorRef.current.x, y1: drawAnchorRef.current.y, x2: x, y2: y });
    };
    const onUp = (e: MouseEvent) => {
      if (!isDrawingRef.current || !drawAnchorRef.current) return;
      isDrawingRef.current = false;
      document.body.style.cursor = "";
      const { x, y } = clientToPx(e.clientX, e.clientY);
      const newBox = {
        x1: drawAnchorRef.current.x,
        y1: drawAnchorRef.current.y,
        x2: x,
        y2: y,
      };
      drawAnchorRef.current = null;
      setBoxPx(newBox);
      emitChange(newBox);
      setIsDraw(false);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDraw, emitChange]);

  // ---- Box center drag ----
  const handleBoxMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!boxPx) return;
    boxDragRef.current = { mx: e.clientX, my: e.clientY, box: { ...boxPx } };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!boxDragRef.current) return;
      const dx = e.clientX - boxDragRef.current.mx;
      const dy = e.clientY - boxDragRef.current.my;
      const { box } = boxDragRef.current;
      const newBox = { x1: box.x1 + dx, y1: box.y1 + dy, x2: box.x2 + dx, y2: box.y2 + dy };
      setBoxPx(newBox);
      emitChange(newBox);
    };
    const onUp = () => { boxDragRef.current = null; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [emitChange]);

  // ---- Corner drag ----
  const handleCornerMouseDown = (e: React.MouseEvent, corner: Corner) => {
    e.preventDefault();
    e.stopPropagation();
    if (!boxPx) return;
    cornerDragRef.current = {
      corner,
      mx: e.clientX,
      my: e.clientY,
      box: normalizeBox(boxPx),
    };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = cornerDragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.mx;
      const dy = e.clientY - drag.my;
      let { x1, y1, x2, y2 } = drag.box;
      if (drag.corner === "tl")      { x1 += dx; y1 += dy; }
      else if (drag.corner === "tr") { x2 += dx; y1 += dy; }
      else if (drag.corner === "bl") { x1 += dx; y2 += dy; }
      else                           { x2 += dx; y2 += dy; }
      // Update anchor for next delta
      cornerDragRef.current = { ...drag, mx: e.clientX, my: e.clientY, box: { x1, y1, x2, y2 } };
      const newBox = { x1, y1, x2, y2 };
      setBoxPx(newBox);
      emitChange(newBox);
    };
    const onUp = () => { cornerDragRef.current = null; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [emitChange]);

  // ---- Derived display box ----
  const nb = boxPx ? normalizeBox(boxPx) : null;

  const handleRemoveBox = () => {
    setBoxPx(null);
    onRemove();
  };

  return (
    <div css={css({ position: "relative" })}>
      {/* ── Toolbar ── */}
      <div
        css={css({
          position: "absolute",
          zIndex: 9999,
          right: "1rem",
          top: "1rem",
          display: "flex",
          gap: "0.5rem",
        })}
      >
        {nb && (
          <button
            style={{
              ...BTN_BASE,
              backgroundColor: "#ef4444",
              color: "#fff",
              outline: "#ef4444c2 solid 0.1rem",
            }}
            onClick={handleRemoveBox}
          >
            <CircleMinus css={IconSize} /> Remove Box
          </button>
        )}
        <button
          style={{
            ...BTN_BASE,
            color: isDraw ? "#fff" : "#000",
            backgroundColor: isDraw ? "#007bffe8" : "#ffffff96",
            outline: isDraw
              ? "#086ad4c2 solid 0.1rem"
              : "rgba(240,240,244,0.51) solid 0.1rem",
          }}
          onClick={() => setIsDraw((d) => !d)}
        >
          {isDraw ? (
            "Cancel Draw"
          ) : (
            <>
              <MousePointerClick css={IconSize} />
              <span>Select Box</span>
            </>
          )}
        </button>
      </div>

      {/* ── Leaflet map ── */}
      <MapContainer
        center={[40.8, -73.95]}
        zoom={13}
        boxZoom={false}
        {...({ rotate: true, rotateControl: { position: "topleft", closeOnZeroBearing: false } } as any)}
        style={{ height: "70vh", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          keepBuffer={4}
        />
        <MapController
          leafletMapRef={leafletMapRef}
          emitChange={emitChange}
          boxPxRef={boxPxRef}
          pendingBoundsRef={pendingBoundsRef}
          setBoxPx={setBoxPx}
        />
      </MapContainer>

      {/* ── Draw overlay (full-map capture while in draw mode before box exists) ── */}
      {isDraw && !boxPx && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            cursor: isShiftHeld ? "default" : "crosshair",
            zIndex: 1000,
            pointerEvents: isShiftHeld ? "none" : "auto",
          }}
          onMouseDown={handleDrawMouseDown}
        />
      )}

      {/* ── Screen-space selection box with corner handles ── */}
      {nb && (
        <div
          style={{
            position: "absolute",
            left: nb.x1,
            top: nb.y1,
            width: nb.x2 - nb.x1,
            height: nb.y2 - nb.y1,
            border: "2px solid #007bff",
            backgroundColor: "rgba(0,123,255,0.1)",
            boxSizing: "border-box",
            zIndex: 1000,
            cursor: isShiftHeld ? "default" : "grab",
            userSelect: "none",
            pointerEvents: isShiftHeld ? "none" : "auto",
          }}
          onMouseDown={handleBoxMouseDown}
        >
          {/* Corner handles */}
          <div
            style={cornerHandleStyle("left", "top")}
            onMouseDown={(e) => handleCornerMouseDown(e, "tl")}
          />
          <div
            style={cornerHandleStyle("right", "top")}
            onMouseDown={(e) => handleCornerMouseDown(e, "tr")}
          />
          <div
            style={cornerHandleStyle("left", "bottom")}
            onMouseDown={(e) => handleCornerMouseDown(e, "bl")}
          />
          <div
            style={cornerHandleStyle("right", "bottom")}
            onMouseDown={(e) => handleCornerMouseDown(e, "br")}
          />
        </div>
      )}
    </div>
  );
});
