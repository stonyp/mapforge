import { css, keyframes } from "@emotion/react";
import { Space } from "../three/Space";
import { FullscreenModal } from "../components/FullscreenModal";
import { Title } from "@/components/text/Title";
import { Description } from "@/components/text/Description";
import { Column } from "@/components/flex/Column";
import { MapComponent, MapComponentRef } from "@/components/map/SelectMap";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  NextButton,
  PrevButton,
} from "@/components/button/BottomButton";
import { Building } from "@/components/map/Processing";
import { ChevronLeft, ChevronRight, Download, Loader2, Search } from "lucide-react";
import L from "leaflet";
import { useAreaStore } from "@/state/areaStore";
import { useActionStore } from "@/state/exportStore";
import { Modal } from "@/components/modal/Modal";
import { TopNav } from "@/components/nav/TopNav";
import { getCookie } from "@/utils/cookie";
import { Row } from "@/components/flex/Row";
import instanceFleet from "@/api/axios";

const IconSize = css({
  width: "14px",
  height: "14px",
});

const spinAnimation = keyframes`
from { transform: rotate(0deg); }
to { transform: rotate(360deg); }
`;

const BOX_HALF_LAT: Record<"small" | "medium" | "large", number> = {
  small: 0.0018,
  medium: 0.0072,
  large: 0.029,
};

function App() {
  const [isNextButtonDisabled, setIsNextButtonDisabled] = useState(true);
  const [areaData, setAreaData] = useState([]);
  const [steps, setSteps] = useState(["front", "processing"]);
  const [step, setStep] = useState(0);
  const [isWarnModal, setIsWarnModal] = useState(false);
  const [isExportModal, setIsExportModal] = useState(false);
  const [isFleetLogin, setIsFleetLogin] = useState(false);
  const [isFleetModal, setIsFleetModal] = useState(false);
  const [spaceList, setSpaceList] = useState([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isFetchingBuildings, setIsFetchingBuildings] = useState(false);
  const [hasFetchedBuildings, setHasFetchedBuildings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [externalBounds, setExternalBounds] = useState<L.LatLngBounds | null>(null);
  const [boxSize, setBoxSize] = useState<"small" | "medium" | "large">("small");
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildStatus, setBuildStatus] = useState("");
  const [fetchError, setFetchError] = useState("");
  const mapRef = useRef<MapComponentRef>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const buildBoundsFromCenter = (lat: number, lon: number, size: "small" | "medium" | "large") => {
    const dLat = BOX_HALF_LAT[size];
    const dLng = dLat / Math.cos((lat * Math.PI) / 180);
    return new L.LatLngBounds([lat - dLat, lon - dLng], [lat + dLat, lon + dLng]);
  };

  const setCenter = useAreaStore((state) => state.setCenter);
  const appendAreas = useAreaStore((state) => state.appendAreas);
  const setRoads = useAreaStore((state) => state.setRoads);
  const setAction = useActionStore((state) => state.setAction);
  const setFleet = useActionStore((state) => state.setFleet);

  const checkIsBig = () => {
    const a = areaData[0].lat - areaData[1].lat;
    const b = areaData[0].lng - areaData[1].lng;

    console.log(a + b);

    if (a + b > 0.2) {
      return true;
    } else {
      return false;
    }
  };

  const exportFile = () => {
    setAction(true);
  };

  const exportFleet = () => {
    setAction(true);
  };

  const getFleetSpaces = async () => {
    const getSpace: any = await instanceFleet.get("space");

    setSpaceList([
      ...getSpace.data.spaces.map((item) => {
        return {
          ...item,
          key: item.id,
        };
      }),
    ]);
  };

  const putGlbOnFleetSpace = (spaceId) => {
    setFleet(spaceId, "fleet");
    setTimeout(() => {
      exportFleet();
    }, 100);
  };

  const loadFleetSpace = () => {
    getFleetSpaces();
    setIsFleetModal(true);
  };

  const checkFleetLogin = () => {
    try {
      const isCookie = getCookie("token");
      if (isCookie) {
        setIsFleetLogin(true);
      }
    } catch (error) {}
  };

  const handleDone = (data) => {
    setAreaData(data);
    setCenter(data);
    console.log(data, "AAEE");
    setIsNextButtonDisabled(false);
    setBuildings([]);
    setHasFetchedBuildings(false);
  };

  const handleRemove = () => {
    setAreaData([]);
    setIsNextButtonDisabled(true);
    setBuildings([]);
    setHasFetchedBuildings(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError("");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const results = await res.json();
      if (!results.length) {
        setSearchError("No results found. Try a different name.");
        return;
      }
      const { lat, lon } = results[0];
      const bounds = buildBoundsFromCenter(parseFloat(lat), parseFloat(lon), boxSize);
      setExternalBounds(bounds);
      mapRef.current?.flyToBounds(bounds);
    } catch {
      setSearchError("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const requestBuildings = async (): Promise<boolean> => {
    setIsFetchingBuildings(true);
    setFetchError("");
    setBuildProgress(0);
    setBuildStatus("Fetching map data from OpenStreetMap...");

    let p = 0;
    progressIntervalRef.current = setInterval(() => {
      p = p + (85 - p) * 0.05;
      setBuildProgress(p);
    }, 200);

    const south = areaData[1].lat;
    const west = areaData[1].lng;
    const north = areaData[0].lat;
    const east = areaData[0].lng;
    const query = `[out:json][timeout:25];(way["building"](${south},${west},${north},${east});relation["building"](${south},${west},${north},${east});way["highway"](${south},${west},${north},${east}););out body geom;`;
    try {
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!response.ok) throw new Error(`Server responded with ${response.status}`);
      const data = await response.json();

      const blds: Building[] = data.elements
        .filter((el: any) => el.tags?.building)
        .map((element: any) => ({
          id: element.id,
          tags: element.tags,
          geometry: element.geometry
            ? element.geometry.map((pt: any) => ({ lat: pt.lat, lng: pt.lon }))
            : undefined,
        }));

      const rdElems = data.elements
        .filter((el: any) => el.tags?.highway && el.geometry?.length >= 2)
        .map((el: any) => ({
          id: el.id,
          tags: el.tags,
          geometry: el.geometry.map((pt: any) => ({ lat: pt.lat, lon: pt.lon })),
        }));

      setBuildings(blds);
      appendAreas(blds);
      setRoads(rdElems);
      setHasFetchedBuildings(true);

      clearInterval(progressIntervalRef.current!);
      progressIntervalRef.current = null;
      setBuildStatus("Building 3D scene...");
      setBuildProgress(92);
      await new Promise((r) => setTimeout(r, 500));
      setBuildProgress(100);
      await new Promise((r) => setTimeout(r, 300));
      return true;
    } catch (error) {
      clearInterval(progressIntervalRef.current!);
      progressIntervalRef.current = null;
      const msg = error instanceof Error ? error.message : "Unknown error";
      setFetchError(`Failed to fetch map data: ${msg}. Please try again.`);
      setBuildProgress(0);
      setBuildStatus("");
      return false;
    } finally {
      setIsFetchingBuildings(false);
    }
  };

  const generate = async () => {
    setStep(1);
    const ok = await requestBuildings();
    if (ok) setStep(2);
    else setStep(0);
  };

  const handleClickNextStep = () => {
    if (step === 0) {
      if (checkIsBig()) { setIsWarnModal(true); return; }
      generate();
    }
  };

  const handleClickPrevStep = () => {
    setStep(step - 1);
  };

  const handleClickExport = () => {
    setIsExportModal(true);
  };

  useEffect(() => {
    checkFleetLogin();
  }, []);

  return (
    <div css={css({ height: "100%", width: "100%" })}>
      <TopNav step={step} />

      <FullscreenModal isOpen={steps[step] == "front"}>
        <Column gap="1rem">
          <Column gap="0.5rem">
            <Title>Generate 3d map</Title>
            <Description>
              Tools to create 3D maps based on maps and export them in GLB
              format
            </Description>
          </Column>
          <div css={css({ display: "flex", gap: "0.5rem", alignItems: "center" })}>
            <input
              type="text"
              placeholder="Search city or place..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              css={css({
                flex: 1,
                padding: "0.5rem 0.75rem",
                borderRadius: "8px",
                border: "1px solid rgba(0,0,0,0.15)",
                fontSize: "14px",
                outline: "none",
                "&:focus": { borderColor: "#007bff", boxShadow: "0 0 0 2px rgba(0,123,255,0.2)" },
              })}
            />
            <button
              onClick={handleSearch}
              disabled={isSearching}
              css={css({
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.5rem 1rem",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#007bff",
                color: "#fff",
                fontSize: "14px",
                cursor: isSearching ? "not-allowed" : "pointer",
                opacity: isSearching ? 0.7 : 1,
                "&:hover": { backgroundColor: "#0069d9" },
              })}
            >
              {isSearching ? <Loader2 css={css({ width: 14, height: 14, animation: `${spinAnimation} 1s linear infinite` })} /> : <Search css={css({ width: 14, height: 14 })} />}
              Search
            </button>
          </div>
          {searchError && (
            <div css={css({ color: "#ef4444", fontSize: "13px", marginTop: "-0.25rem" })}>
              {searchError}
            </div>
          )}
          {fetchError && (
            <div css={css({ color: "#ef4444", fontSize: "13px", padding: "0.5rem 0.75rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px" })}>
              {fetchError}
            </div>
          )}
          <div css={css({ display: "flex", alignItems: "center", gap: "0.5rem" })}>
            <span css={css({ fontSize: "13px", color: "#5f6368", fontWeight: 500 })}>Area size:</span>
            {(["small", "medium", "large"] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setBoxSize(s); mapRef.current?.snapToPreset(BOX_HALF_LAT[s]); }}
                css={css({
                  padding: "0.3rem 0.75rem",
                  borderRadius: "6px",
                  border: "1px solid",
                  fontSize: "13px",
                  cursor: "pointer",
                  transition: "0.15s",
                  borderColor: boxSize === s ? "#007bff" : "rgba(0,0,0,0.15)",
                  backgroundColor: boxSize === s ? "#007bff" : "transparent",
                  color: boxSize === s ? "#fff" : "#333",
                  fontWeight: boxSize === s ? 600 : 400,
                  "&:hover": {
                    borderColor: "#007bff",
                    color: boxSize === s ? "#fff" : "#007bff",
                  },
                })}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <span css={css({ fontSize: "12px", color: "#9aa0a6", marginLeft: "0.25rem" })}>
              {boxSize === "small" ? "~¼ mi" : boxSize === "medium" ? "~1 mi" : "~4 mi"} per side
            </span>
          </div>
          <MapComponent
            ref={mapRef}
            onRemove={handleRemove}
            onDone={handleDone}
            externalBounds={externalBounds}
          />
        </Column>
      </FullscreenModal>

      <FullscreenModal isOpen={steps[step] == "processing"}>
        <Column gap="2rem">
          <Column gap="0.5rem">
            <Title>Generating 3D Map</Title>
            <Description>{buildStatus}</Description>
          </Column>
          <div css={css({ width: "100%" })}>
            <div css={css({ background: "#e5e7eb", borderRadius: "100px", height: "8px", overflow: "hidden" })}>
              <div css={css({
                width: `${buildProgress}%`,
                height: "100%",
                background: "linear-gradient(90deg, #007bff, #0057cc)",
                borderRadius: "100px",
                transition: "width 0.25s ease",
              })} />
            </div>
            <div css={css({ marginTop: "0.5rem", fontSize: "13px", color: "#9aa0a6", textAlign: "right" })}>
              {Math.round(buildProgress)}%
            </div>
          </div>
        </Column>
      </FullscreenModal>

      <PrevButton isShow={step !== 0 && !isFetchingBuildings} onClick={handleClickPrevStep}>
        <ChevronLeft css={IconSize} /> Prev Step
      </PrevButton>

      <NextButton
        isShow={step === 0}
        disabled={isNextButtonDisabled}
        onClick={handleClickNextStep}
      >
        Generate <ChevronRight css={IconSize} />
      </NextButton>

      <NextButton isShow={step == 2} onClick={handleClickExport}>
        Export GLB <Download css={IconSize} />
      </NextButton>

      <Modal isOpen={isWarnModal} onClose={() => setIsWarnModal(false)}>
        <Column gap="0.5rem">
          <Title>The area is too big </Title>
          <Description>Do you want to proceed?</Description>
          <Button
            isShow={true}
            disabled={isNextButtonDisabled}
            onClick={() => {
              setIsWarnModal(false);
              generate();
            }}
          >
            Generate Anyway <ChevronRight css={IconSize} />
          </Button>
        </Column>
      </Modal>

      <Modal isOpen={isExportModal} onClose={() => setIsExportModal(false)}>
        <Column gap="0.5rem">
          <Title>Export</Title>

          <Row gap="0.5rem">
            <Button isShow={true} onClick={exportFile}>
              GLB Download <Download css={IconSize} />
            </Button>

            {/* {isFleetLogin ? (
              <Button isShow={true} onClick={loadFleetSpace}>
                Fleet Interlock
              </Button>
            ) : (
              <Button
                isShow={true}
                onClick={() => window.open("https://fleet.im/auth")}
              >
                Fleet Login
              </Button>
            )} */}
          </Row>
        </Column>
      </Modal>

      <Modal isOpen={isFleetModal} onClose={() => setIsFleetModal(false)}>
        <Column gap="0.5rem">
          <Title>Select Fleet Space</Title>
          {spaceList.map((item, index) => (
            <Button isShow={true} onClick={() => putGlbOnFleetSpace(item.id)}>
              {item.title}
            </Button>
          ))}
        </Column>
      </Modal>

      <Space></Space>
    </div>
  );
}

export default App;
